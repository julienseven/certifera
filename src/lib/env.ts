/**
 * Environment validation.
 *
 * Configuration was read directly from process.env at each use site, with a
 * fallback chosen for developer convenience. That is the right default in
 * development and the wrong one in production, because the fallbacks are
 * silent and several of them are unsafe:
 *
 *  - CERTIFERA_SETTLEMENT_MODE defaulted to "sandbox", so a production
 *    deployment that forgot to set it marked payouts "released" against a
 *    fabricated reference. The ledger said the relay was paid and no money had
 *    moved. Nothing failed, which is what made it dangerous.
 *  - CERTIFERA_EVIDENCE_STORAGE defaulted to "database", putting 8 MB evidence
 *    blobs in Postgres rows, its backups, and its WAL.
 *  - DATABASE_SSL_REJECT_UNAUTHORIZED defaulted to *not* verifying the server
 *    certificate, so a production connection accepted any presented cert.
 *
 * The readiness endpoint already reported most of this, but reporting is not
 * enforcement: it requires someone to look. These checks run at startup and
 * refuse to boot a production deployment that is configured to lose money or
 * leak data, while leaving development untouched.
 */

export type EnvProblem = { key: string; message: string };

function isProduction(env: NodeJS.ProcessEnv) {
  // A preview deployment builds with NODE_ENV=production but is not the real
  // thing, and holding it to production's settlement rules would make previews
  // unusable for demos.
  if (env.NODE_ENV !== "production" || env.VERCEL_ENV === "preview") return false;

  // `next build` also runs with NODE_ENV=production, and it evaluates route
  // modules to collect page data. Validating there would make the build require
  // the production runtime secrets, which CI does not have and should not have:
  // a build artifact is not a deployment. NEXT_PHASE is set by Next only for
  // the build itself, so this narrows enforcement to actually serving traffic.
  if (env.NEXT_PHASE === "phase-production-build") return false;

  return true;
}

function isLocalDatabase(url: string) {
  return /@(localhost|127\.0\.0\.1|\[::1\])[:/]/.test(url);
}

/**
 * Collects every problem rather than throwing on the first.
 *
 * A deployment that is missing four secrets should learn all four from one
 * failed boot, not discover them one redeploy at a time.
 */
export function collectEnvProblems(env: NodeJS.ProcessEnv = process.env): EnvProblem[] {
  const problems: EnvProblem[] = [];
  const requireKey = (key: string, message: string) => {
    if (!env[key]) problems.push({ key, message });
  };

  if (!env.DATABASE_URL) {
    problems.push({ key: "DATABASE_URL", message: "A Postgres connection string is required." });
  }

  if (!isProduction(env)) return problems;

  // Settlement: the failure mode is a payout recorded as paid that never paid.
  const settlementMode = env.CERTIFERA_SETTLEMENT_MODE;
  if (!settlementMode) {
    problems.push({
      key: "CERTIFERA_SETTLEMENT_MODE",
      message: "Set explicitly in production. Defaulting to sandbox marks payouts released against a fabricated reference without moving money.",
    });
  } else if (settlementMode !== "sandbox" && settlementMode !== "stripe") {
    problems.push({ key: "CERTIFERA_SETTLEMENT_MODE", message: `Must be "sandbox" or "stripe", received "${settlementMode}".` });
  } else if (settlementMode === "stripe") {
    requireKey("CERTIFERA_STRIPE_SECRET_KEY", "Stripe settlement cannot create transfers without an API secret.");
    requireKey("CERTIFERA_STRIPE_WEBHOOK_SECRET", "Stripe settlement cannot be reconciled without a verified webhook, so failed transfers would go unnoticed.");
  }

  // Evidence: the failure mode is the primary database carrying file bytes.
  if (env.CERTIFERA_EVIDENCE_STORAGE !== "s3") {
    problems.push({
      key: "CERTIFERA_EVIDENCE_STORAGE",
      message: 'Must be "s3" in production. Database storage base64-encodes whole files into Postgres rows, its backups, and its WAL.',
    });
  } else {
    requireKey("CERTIFERA_S3_BUCKET", "S3 evidence storage requires a bucket.");
    requireKey("CERTIFERA_S3_REGION", "S3 evidence storage requires a region.");
  }

  // Transport security: the failure mode is accepting any presented certificate.
  const databaseUrl = env.DATABASE_URL ?? "";
  if (databaseUrl && !isLocalDatabase(databaseUrl) && env.DATABASE_SSL === "disable") {
    problems.push({ key: "DATABASE_SSL", message: "TLS cannot be disabled for a non-local database in production." });
  }

  requireKey("CERTIFERA_SETUP_CODE", "Without it, the first-administrator endpoint is open to whoever reaches it first.");
  requireKey("CERTIFERA_FIELD_ENCRYPTION_KEY", "TOTP secrets are stored with AES-256-GCM and cannot be encrypted without it.");
  if (!env.CERTIFERA_CRON_SECRET && !env.CRON_SECRET) {
    problems.push({
      key: "CERTIFERA_CRON_SECRET",
      message: "The maintenance sweep endpoint would be reachable without one, and SLA escalation would not run.",
    });
  }

  return problems;
}

export function formatEnvProblems(problems: EnvProblem[]) {
  const lines = problems.map((problem) => `  - ${problem.key}: ${problem.message}`);
  return `Refusing to start: ${problems.length} environment problem${problems.length === 1 ? "" : "s"} found.\n${lines.join("\n")}`;
}

/**
 * Throws when the environment is unsafe for the mode it is running in.
 *
 * Called from the database module, which every server path already imports, so
 * a misconfigured production deployment fails at startup rather than at the
 * first request that happens to touch the missing setting.
 */
export function assertEnvValid(env: NodeJS.ProcessEnv = process.env) {
  const problems = collectEnvProblems(env);
  if (problems.length > 0) throw new Error(formatEnvProblems(problems));
}
