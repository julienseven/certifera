import { describe, expect, it } from "vitest";
import { collectEnvProblems } from "@/lib/env";

/**
 * The unsafe fallbacks these guard against were all silent. A production
 * deployment missing CERTIFERA_SETTLEMENT_MODE did not fail; it marked payouts
 * released against a fabricated reference and moved no money. Tests assert the
 * problem is *detected*, because the whole point is that nothing else notices.
 */

const productionBase = {
  NODE_ENV: "production",
  DATABASE_URL: "postgresql://user:pass@db.example.com:5432/app",
  CERTIFERA_SETTLEMENT_MODE: "sandbox",
  CERTIFERA_EVIDENCE_STORAGE: "s3",
  CERTIFERA_S3_BUCKET: "bucket",
  CERTIFERA_S3_REGION: "us-east-1",
  CERTIFERA_SETUP_CODE: "a-long-random-value",
  CERTIFERA_FIELD_ENCRYPTION_KEY: "base64-key",
  CERTIFERA_CRON_SECRET: "another-long-random-value",
} as unknown as NodeJS.ProcessEnv;

function problemsFor(overrides: Record<string, string | undefined>) {
  const env = { ...productionBase, ...overrides } as NodeJS.ProcessEnv;
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) delete (env as Record<string, unknown>)[key];
  }
  return collectEnvProblems(env).map((problem) => problem.key);
}

describe("development stays permissive", () => {
  it("asks only for a database URL", () => {
    expect(collectEnvProblems({ NODE_ENV: "development", DATABASE_URL: "postgresql://localhost:5432/app" } as NodeJS.ProcessEnv)).toEqual([]);
  });

  it("still requires a database URL", () => {
    expect(collectEnvProblems({ NODE_ENV: "development" } as NodeJS.ProcessEnv).map((problem) => problem.key)).toEqual(["DATABASE_URL"]);
  });

  it("does not hold a preview deployment to production settlement rules", () => {
    // Previews build with NODE_ENV=production but exist to be demoed.
    const preview = { NODE_ENV: "production", VERCEL_ENV: "preview", DATABASE_URL: "postgresql://user:pass@db.example.com:5432/app" } as NodeJS.ProcessEnv;
    expect(collectEnvProblems(preview)).toEqual([]);
  });

  it("does not require production runtime secrets during `next build`", () => {
    // `next build` runs with NODE_ENV=production and evaluates route modules.
    // Enforcing there would mean CI could not build without the production
    // secrets, and a build artifact is not a deployment.
    const build = {
      NODE_ENV: "production",
      NEXT_PHASE: "phase-production-build",
      DATABASE_URL: "postgresql://user:pass@db.example.com:5432/app",
    } as NodeJS.ProcessEnv;
    expect(collectEnvProblems(build)).toEqual([]);
  });

  it("still enforces at runtime once the build phase is over", () => {
    const runtime = { NODE_ENV: "production", DATABASE_URL: "postgresql://user:pass@db.example.com:5432/app" } as NodeJS.ProcessEnv;
    expect(collectEnvProblems(runtime).length).toBeGreaterThan(0);
  });
});

describe("production refuses to lose money silently", () => {
  it("rejects an unset settlement mode rather than defaulting to sandbox", () => {
    expect(problemsFor({ CERTIFERA_SETTLEMENT_MODE: undefined })).toContain("CERTIFERA_SETTLEMENT_MODE");
  });

  it("rejects an unrecognised settlement mode", () => {
    expect(problemsFor({ CERTIFERA_SETTLEMENT_MODE: "stripee" })).toContain("CERTIFERA_SETTLEMENT_MODE");
  });

  it("requires the Stripe secret and webhook secret together", () => {
    const keys = problemsFor({ CERTIFERA_SETTLEMENT_MODE: "stripe" });
    expect(keys).toContain("CERTIFERA_STRIPE_SECRET_KEY");
    // Without webhook verification a failed transfer is never reconciled.
    expect(keys).toContain("CERTIFERA_STRIPE_WEBHOOK_SECRET");
  });

  it("accepts a fully configured Stripe deployment", () => {
    expect(
      problemsFor({
        CERTIFERA_SETTLEMENT_MODE: "stripe",
        CERTIFERA_STRIPE_SECRET_KEY: "sk_live_x",
        CERTIFERA_STRIPE_WEBHOOK_SECRET: "whsec_x",
      }),
    ).toEqual([]);
  });
});

describe("production refuses unsafe storage and transport", () => {
  it("rejects database evidence storage", () => {
    expect(problemsFor({ CERTIFERA_EVIDENCE_STORAGE: "database" })).toContain("CERTIFERA_EVIDENCE_STORAGE");
  });

  it("rejects an unset evidence storage mode, which used to mean database", () => {
    expect(problemsFor({ CERTIFERA_EVIDENCE_STORAGE: undefined })).toContain("CERTIFERA_EVIDENCE_STORAGE");
  });

  it("requires a bucket and region when using S3", () => {
    const keys = problemsFor({ CERTIFERA_S3_BUCKET: undefined, CERTIFERA_S3_REGION: undefined });
    expect(keys).toContain("CERTIFERA_S3_BUCKET");
    expect(keys).toContain("CERTIFERA_S3_REGION");
  });

  it("refuses to disable TLS to a remote database", () => {
    expect(problemsFor({ DATABASE_SSL: "disable" })).toContain("DATABASE_SSL");
  });
});

describe("production requires the secrets that gate privileged paths", () => {
  it("requires a setup code, or first-administrator creation is open", () => {
    expect(problemsFor({ CERTIFERA_SETUP_CODE: undefined })).toContain("CERTIFERA_SETUP_CODE");
  });

  it("requires a field encryption key for TOTP secrets", () => {
    expect(problemsFor({ CERTIFERA_FIELD_ENCRYPTION_KEY: undefined })).toContain("CERTIFERA_FIELD_ENCRYPTION_KEY");
  });

  it("accepts either cron secret name", () => {
    expect(problemsFor({ CERTIFERA_CRON_SECRET: undefined, CRON_SECRET: "value" })).toEqual([]);
    expect(problemsFor({ CERTIFERA_CRON_SECRET: undefined })).toContain("CERTIFERA_CRON_SECRET");
  });
});

describe("reporting", () => {
  it("reports every problem at once rather than one per failed boot", () => {
    const keys = problemsFor({
      CERTIFERA_SETTLEMENT_MODE: undefined,
      CERTIFERA_EVIDENCE_STORAGE: undefined,
      CERTIFERA_SETUP_CODE: undefined,
      CERTIFERA_FIELD_ENCRYPTION_KEY: undefined,
    });
    expect(keys).toEqual(
      expect.arrayContaining([
        "CERTIFERA_SETTLEMENT_MODE",
        "CERTIFERA_EVIDENCE_STORAGE",
        "CERTIFERA_SETUP_CODE",
        "CERTIFERA_FIELD_ENCRYPTION_KEY",
      ]),
    );
  });

  it("passes a correctly configured production deployment", () => {
    expect(collectEnvProblems(productionBase)).toEqual([]);
  });
});

/**
 * The bricked deployment: every upload commits at scan_status "pending", and
 * nothing in the repository moves a row off it, so proof submission is refused
 * for every outcome with only a warning-level event to say why.
 */
describe("scan gating", () => {
  it("refuses required scanning with no scanner to answer it", () => {
    expect(problemsFor({ CERTIFERA_EVIDENCE_SCAN_REQUIRED: "true" })).toContain("CERTIFERA_MALWARE_SCAN_WEBHOOK");
  });

  it("accepts required scanning once a scanner is configured", () => {
    expect(
      problemsFor({ CERTIFERA_EVIDENCE_SCAN_REQUIRED: "true", CERTIFERA_MALWARE_SCAN_WEBHOOK: "https://scanner.example/scan" }),
    ).toEqual([]);
  });

  it("leaves a deployment that has not enabled gating alone", () => {
    expect(problemsFor({ CERTIFERA_EVIDENCE_SCAN_REQUIRED: undefined })).toEqual([]);
  });
});
