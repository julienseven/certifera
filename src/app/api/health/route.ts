import { db } from "@/db";
import { evidenceStorageStatus } from "@/lib/evidence-storage";
import { mailDeliveryStatus } from "@/lib/mailer";
import { observabilityStatus } from "@/lib/observability";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await db.execute(sql`select 1`);
    const evidence = evidenceStorageStatus();
    const mail = mailDeliveryStatus();
    const observability = observabilityStatus();
    const settlementMode = process.env.CERTIFERA_SETTLEMENT_MODE || "sandbox";
const productionReady = process.env.NODE_ENV !== "production" || (
      evidence.configured
      && evidence.provider === "s3"
      && evidence.scanRequired
      && evidence.scannerConfigured
      && mail.configured
      && Boolean(process.env.CERTIFERA_FIELD_ENCRYPTION_KEY)
      && Boolean(process.env.CERTIFERA_CRON_SECRET || process.env.CRON_SECRET)
      && Boolean(process.env.CERTIFERA_SETUP_CODE)
      && (settlementMode !== "stripe" || Boolean(process.env.CERTIFERA_STRIPE_SECRET_KEY && process.env.CERTIFERA_STRIPE_WEBHOOK_SECRET))
    );
    return Response.json({
      ok: true,
      service: "certifera",
      timestamp: new Date().toISOString(),
      readiness: {
        productionReady,
        evidence,
        mail,
        observability,
        settlement: { mode: settlementMode, stripeConfigured: Boolean(process.env.CERTIFERA_STRIPE_SECRET_KEY), stripeWebhookConfigured: Boolean(process.env.CERTIFERA_STRIPE_WEBHOOK_SECRET) },
        maintenance: { cronSecretConfigured: Boolean(process.env.CERTIFERA_CRON_SECRET || process.env.CRON_SECRET) },
      },
    }, { headers: { "cache-control": "no-store" } });
  } catch {
    return Response.json({ ok: false, service: "certifera" }, { status: 500, headers: { "cache-control": "no-store" } });
  }
}
