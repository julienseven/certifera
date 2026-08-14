import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { deploymentChecks } from "@/db/schema";
import { getProductionReadiness, manualReadinessChecks } from "@/lib/readiness";
import { inArray } from "drizzle-orm";

const ENV_KEYS = [
  "CERTIFERA_EVIDENCE_STORAGE",
  "CERTIFERA_S3_BUCKET",
  "CERTIFERA_S3_REGION",
  "CERTIFERA_EVIDENCE_SCAN_REQUIRED",
  "CERTIFERA_MALWARE_SCAN_WEBHOOK",
  "CERTIFERA_RESEND_API_KEY",
  "CERTIFERA_MAIL_FROM",
  "CERTIFERA_FIELD_ENCRYPTION_KEY",
  "CERTIFERA_CRON_SECRET",
  "CRON_SECRET",
  "CERTIFERA_ALERT_WEBHOOK",
  "CERTIFERA_SETTLEMENT_MODE",
  "CERTIFERA_STRIPE_WEBHOOK_SECRET",
] as const;

const manualKeys = manualReadinessChecks.map(([key]) => key);

let savedEnv: Partial<Record<(typeof ENV_KEYS)[number], string>>;

function setFullyConfiguredEnv() {
  process.env.CERTIFERA_EVIDENCE_STORAGE = "s3";
  process.env.CERTIFERA_S3_BUCKET = "evidence-bucket";
  process.env.CERTIFERA_S3_REGION = "us-east-1";
  process.env.CERTIFERA_EVIDENCE_SCAN_REQUIRED = "true";
  process.env.CERTIFERA_MALWARE_SCAN_WEBHOOK = "https://scan.example.com/hook";
  process.env.CERTIFERA_RESEND_API_KEY = "resend-key";
  process.env.CERTIFERA_MAIL_FROM = "noreply@example.com";
  process.env.CERTIFERA_FIELD_ENCRYPTION_KEY = Buffer.alloc(32, 3).toString("base64");
  process.env.CERTIFERA_CRON_SECRET = "cron-secret";
  process.env.CERTIFERA_ALERT_WEBHOOK = "https://alerts.example.com/hook";
}

beforeEach(() => {
  savedEnv = {};
  for (const key of ENV_KEYS) {
    savedEnv[key] = process.env[key];
    delete process.env[key];
  }
});

afterEach(async () => {
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
  await db.delete(deploymentChecks).where(inArray(deploymentChecks.checkKey, manualKeys));
});

describe("production readiness", () => {
  it("blocks unconfigured automatic checks, defaults sandbox settlement to passed, and leaves manual checks pending", async () => {
    const { checks, ready } = await getProductionReadiness();
    expect(checks).toHaveLength(7 + manualKeys.length);

    const automatic = checks.filter((check) => check.source === "automatic");
    const blockedKeys = automatic.filter((check) => check.status === "blocked").map((check) => check.key);
    expect(blockedKeys).toEqual(expect.arrayContaining([
      "private_evidence_storage",
      "malware_scan_gate",
      "transactional_email",
      "mfa_encryption",
      "scheduled_maintenance",
      "alert_delivery",
    ]));
    // Sandbox is the default settlement mode, so the Stripe webhook check passes without any Stripe config.
    expect(automatic.find((check) => check.key === "stripe_webhook")?.status).toBe("passed");

    const manual = checks.filter((check) => check.source === "manual");
    expect(manual).toHaveLength(manualKeys.length);
    expect(manual.every((check) => check.status === "pending")).toBe(true);

    expect(ready).toBe(false);
  });

  it("passes every automatic check once its environment flag is configured", async () => {
    setFullyConfiguredEnv();
    const { checks } = await getProductionReadiness();
    const automatic = checks.filter((check) => check.source === "automatic");
    expect(automatic.every((check) => check.status === "passed")).toBe(true);
  });

  it("requires a Stripe webhook secret only once settlement mode is stripe", async () => {
    process.env.CERTIFERA_SETTLEMENT_MODE = "stripe";
    const blocked = await getProductionReadiness();
    expect(blocked.checks.find((check) => check.key === "stripe_webhook")?.status).toBe("blocked");

    process.env.CERTIFERA_STRIPE_WEBHOOK_SECRET = "whsec_test";
    const passed = await getProductionReadiness();
    expect(passed.checks.find((check) => check.key === "stripe_webhook")?.status).toBe("passed");
  });

  it("becomes ready only once every automatic check passes and every manual check is recorded as passed", async () => {
    setFullyConfiguredEnv();
    const verifiedAt = new Date();
    await db.insert(deploymentChecks).values(
      manualKeys.map((key) => ({ checkKey: key, status: "passed", note: `${key} verified in test`, verifiedAt })),
    );

    const { checks, ready } = await getProductionReadiness();
    expect(ready).toBe(true);
    expect(checks.every((check) => check.status === "passed")).toBe(true);

    const backupCheck = checks.find((check) => check.key === "backup_restore_drill");
    expect(backupCheck?.note).toBe("backup_restore_drill verified in test");
    expect(backupCheck?.verifiedAt?.getTime()).toBe(verifiedAt.getTime());
  });

  it("maps a stored blocked status through but folds any other stored status to pending", async () => {
    await db.insert(deploymentChecks).values([
      { checkKey: "security_review", status: "blocked", note: "failed the audit" },
      { checkKey: "legal_terms", status: "in_review", note: "awaiting counsel" },
    ]);

    const { checks } = await getProductionReadiness();
    const securityCheck = checks.find((check) => check.key === "security_review");
    expect(securityCheck?.status).toBe("blocked");
    expect(securityCheck?.note).toBe("failed the audit");

    const legalCheck = checks.find((check) => check.key === "legal_terms");
    expect(legalCheck?.status).toBe("pending");
  });
});
