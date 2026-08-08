import { db } from "@/db";
import { evidenceStorageStatus } from "@/lib/evidence-storage";
import { mailDeliveryStatus } from "@/lib/mailer";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

/**
 * Public, unauthenticated liveness probe. Deliberately reports only pass/fail,
 * not which specific secrets or providers are configured — that detail is
 * recon value for an attacker and belongs behind auth at /api/admin/readiness.
 */
export async function GET() {
  try {
    await db.execute(sql`select 1`);
    const settlementMode = process.env.CERTIFERA_SETTLEMENT_MODE || "sandbox";
    const productionReady = process.env.NODE_ENV !== "production" || (
      evidenceStorageStatus().configured
      && mailDeliveryStatus().configured
      && Boolean(process.env.CERTIFERA_FIELD_ENCRYPTION_KEY)
      && Boolean(process.env.CERTIFERA_CRON_SECRET || process.env.CRON_SECRET)
      && Boolean(process.env.CERTIFERA_SETUP_CODE)
      && (settlementMode !== "stripe" || Boolean(process.env.CERTIFERA_STRIPE_SECRET_KEY && process.env.CERTIFERA_STRIPE_WEBHOOK_SECRET))
    );
    return Response.json({
      ok: true,
      service: "certifera",
      timestamp: new Date().toISOString(),
      productionReady,
    }, { headers: { "cache-control": "no-store" } });
  } catch {
    return Response.json({ ok: false, service: "certifera" }, { status: 500, headers: { "cache-control": "no-store" } });
  }
}
