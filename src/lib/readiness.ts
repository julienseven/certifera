import { db } from "@/db";
import { deploymentChecks } from "@/db/schema";
import { evidenceStorageStatus } from "@/lib/evidence-storage";
import { mailDeliveryStatus } from "@/lib/mailer";
import { observabilityStatus } from "@/lib/observability";

export const manualReadinessChecks = [
  ["backup_restore_drill", "Backup & restore drill", "A managed database restore has been performed and documented."],
  ["incident_response_runbook", "Incident response runbook", "Payout, evidence, security, and outage response ownership is documented."],
  ["legal_terms", "Legal & privacy package", "Marketplace terms, privacy policy, relay agreement, and dispute policy are approved."],
  ["relay_kyc_process", "Relay verification process", "KYC/KYB, credential, insurance, and service-zone checks have an accountable owner."],
  ["payout_reconciliation_owner", "Payout reconciliation owner", "A named operator reviews settlement failures and Stripe reconciliation daily."],
  ["security_review", "Security review", "A security assessment has reviewed auth, evidence access, and payout boundaries."],
] as const;

export type ReadinessCheck = {
  key: string;
  label: string;
  description: string;
  source: "automatic" | "manual";
  status: "passed" | "pending" | "blocked";
  note: string;
  verifiedAt: Date | null;
};

export async function getProductionReadiness() {
  const [stored, evidence, mail, observability] = await Promise.all([
    db.select().from(deploymentChecks),
    Promise.resolve(evidenceStorageStatus()),
    Promise.resolve(mailDeliveryStatus()),
    Promise.resolve(observabilityStatus()),
  ]);
  const storedByKey = new Map(stored.map((check) => [check.checkKey, check]));
  const automatic: ReadinessCheck[] = [
    ["private_evidence_storage", "Private evidence storage", evidence.provider === "s3" && evidence.configured, `Provider: ${evidence.provider}`],
    ["malware_scan_gate", "Malware scan gate", evidence.scanRequired && evidence.scannerConfigured, evidence.scannerConfigured ? "Scanner webhook configured" : "Scanner webhook missing"],
    ["transactional_email", "Transactional email", mail.configured, `Provider: ${mail.provider}`],
    ["mfa_encryption", "MFA field encryption", Boolean(process.env.CERTIFERA_FIELD_ENCRYPTION_KEY), "AES-256-GCM key required for TOTP secrets"],
    ["scheduled_maintenance", "Scheduled maintenance", Boolean(process.env.CERTIFERA_CRON_SECRET || process.env.CRON_SECRET), "Hourly SLA/token cleanup job requires cron secret"],
    ["alert_delivery", "Incident alert delivery", observability.alertWebhookConfigured, observability.alertProvider],
    ["stripe_webhook", "Stripe reconciliation", (process.env.CERTIFERA_SETTLEMENT_MODE || "sandbox") !== "stripe" || Boolean(process.env.CERTIFERA_STRIPE_WEBHOOK_SECRET), "Required before Stripe settlement"],
  ].map(([key, label, passed, note]) => ({ key: key as string, label: label as string, description: note as string, source: "automatic" as const, status: passed ? "passed" as const : "blocked" as const, note: note as string, verifiedAt: null }));
  const manual: ReadinessCheck[] = manualReadinessChecks.map(([key, label, description]) => {
    const saved = storedByKey.get(key);
    const status = saved?.status === "passed" || saved?.status === "blocked" ? saved.status : "pending";
    return { key, label, description, source: "manual", status, note: saved?.note || "", verifiedAt: saved?.verifiedAt || null };
  });
  const checks = [...automatic, ...manual];
  return { checks, ready: checks.every((check) => check.status === "passed") };
}
