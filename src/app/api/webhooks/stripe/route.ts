import { db } from "@/db";
import { payouts, stripeWebhookEvents } from "@/db/schema";
import { recordLifecycleEvent } from "@/lib/lifecycle";
import { recordOperationalEvent, reportException } from "@/lib/observability";
import { stripePayloadHash, type StripeEvent, verifyStripeWebhook } from "@/lib/stripe-webhook";
import { eq } from "drizzle-orm";

export async function POST(request: Request) {
  const payload = await request.text();
  const signature = request.headers.get("stripe-signature");
  if (!verifyStripeWebhook(payload, signature, process.env.CERTIFERA_STRIPE_WEBHOOK_SECRET)) {
    return Response.json({ error: "Invalid Stripe webhook signature." }, { status: 400 });
  }

  try {
    const event = JSON.parse(payload) as StripeEvent;
    if (!event.id || !event.type) return Response.json({ error: "Malformed Stripe event." }, { status: 400 });
    const payoutId = event.data?.object?.metadata?.payout_id || null;
    const [stored] = await db
      .insert(stripeWebhookEvents)
      .values({ stripeEventId: event.id, type: event.type, payoutId, payloadHash: stripePayloadHash(payload), status: "received" })
      .onConflictDoNothing({ target: stripeWebhookEvents.stripeEventId })
      .returning({ id: stripeWebhookEvents.id });
    if (!stored) return Response.json({ ok: true, duplicate: true });

    if (!payoutId) {
      await db.update(stripeWebhookEvents).set({ status: "ignored", processedAt: new Date() }).where(eq(stripeWebhookEvents.id, stored.id));
      return Response.json({ ok: true, ignored: true });
    }
    const [payout] = await db.select().from(payouts).where(eq(payouts.id, payoutId)).limit(1);
    if (!payout) {
      await db.update(stripeWebhookEvents).set({ status: "ignored", failureReason: "Payout ID not found", processedAt: new Date() }).where(eq(stripeWebhookEvents.id, stored.id));
      await recordOperationalEvent({ level: "warning", service: "stripe", code: "unknown_payout_webhook", message: `Stripe event ${event.id} referenced an unknown payout.`, resourceType: "stripe_event", resourceId: event.id, data: { payoutId } });
      return Response.json({ ok: true, ignored: true });
    }

    if (event.type === "transfer.created") {
      await db.transaction(async (tx) => {
        await tx.update(payouts).set({ status: "released", settlementProvider: "stripe", settlementRef: event.data.object.id || payout.settlementRef, providerEventId: event.id, reconciledAt: new Date(), failureReason: null }).where(eq(payouts.id, payout.id));
        await tx.update(stripeWebhookEvents).set({ status: "processed", processedAt: new Date() }).where(eq(stripeWebhookEvents.id, stored.id));
        await recordLifecycleEvent(tx, { workOrderId: payout.workOrderId, type: "stripe_transfer_reconciled", actor: "stripe/webhook", summary: "Stripe confirmed the relay transfer.", data: { payoutId: payout.id, stripeEventId: event.id, transferId: event.data.object.id || null } });
      });
      return Response.json({ ok: true, reconciled: true });
    }

    if (event.type === "transfer.failed" || event.type === "transfer.reversed") {
      const reason = event.data.object.failure_message || (event.type === "transfer.reversed" ? "Stripe transfer reversed." : "Stripe transfer failed.");
      await db.transaction(async (tx) => {
        await tx.update(payouts).set({ status: "failed", providerEventId: event.id, reconciledAt: new Date(), failureReason: reason }).where(eq(payouts.id, payout.id));
        await tx.update(stripeWebhookEvents).set({ status: "processed", failureReason: reason, processedAt: new Date() }).where(eq(stripeWebhookEvents.id, stored.id));
        await recordLifecycleEvent(tx, { workOrderId: payout.workOrderId, type: "stripe_transfer_failed", actor: "stripe/webhook", summary: `Stripe reported a payout issue: ${reason}`, data: { payoutId: payout.id, stripeEventId: event.id } });
      });
      await recordOperationalEvent({ level: "critical", service: "stripe", code: "transfer_failed", message: reason, resourceType: "payout", resourceId: payout.id, data: { stripeEventId: event.id } });
      return Response.json({ ok: true, failed: true });
    }

    await db.update(stripeWebhookEvents).set({ status: "ignored", processedAt: new Date() }).where(eq(stripeWebhookEvents.id, stored.id));
    return Response.json({ ok: true, ignored: true });
  } catch (error) {
    await reportException({ service: "stripe", code: "webhook_processing_failed", error, resourceType: "stripe_webhook" });
    return Response.json({ error: "Stripe webhook processing failed." }, { status: 500 });
  }
}
