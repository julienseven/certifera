import { db } from "@/db";
import { payouts, stripeWebhookEvents } from "@/db/schema";
import { recordLifecycleEvent } from "@/lib/lifecycle";
import { recordOperationalEvent, reportException } from "@/lib/observability";
import { stripePayloadHash, type StripeEvent, verifyStripeWebhook } from "@/lib/stripe-webhook";
import { and, eq, inArray } from "drizzle-orm";

/**
 * Dedupe outcomes, resolved inside the transaction and reported after it.
 *
 * Observability writes go through their own connection, so they cannot run
 * inside the transaction that decides them without committing ahead of it.
 */
type WebhookOutcome =
  | { kind: "duplicate" }
  | { kind: "ignored" }
  | { kind: "unknown_payout"; eventId: string; payoutId: string }
  | { kind: "reconciled" }
  | { kind: "stale"; payoutId: string; payoutStatus: string; eventId: string }
  | { kind: "failed"; payoutId: string; reason: string; eventId: string };

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

    /**
     * The receipt and the work it names commit together.
     *
     * The receipt used to be its own statement, committed before the payout was
     * touched. That made the dedupe claim something it could not back: a
     * delivery interrupted after the receipt — a dropped connection, a killed
     * instance, anything that unwinds the handler — left a row that Stripe's
     * redelivery matched, so the retry was answered "duplicate" and the event
     * was dropped. For a transfer.failed that is a payout the ledger never
     * learns went wrong.
     *
     * Inside one transaction the receipt exists only if the reconciliation it
     * records also landed, so an interrupted delivery leaves nothing behind and
     * the retry does the work. Two deliveries arriving together still serialise
     * on the unique index: the second blocks until the first commits, then
     * conflicts and returns nothing.
     */
    const outcome = await db.transaction(async (tx): Promise<WebhookOutcome> => {
      const [stored] = await tx
        .insert(stripeWebhookEvents)
        .values({ stripeEventId: event.id, type: event.type, payoutId, payloadHash: stripePayloadHash(payload), status: "received" })
        .onConflictDoNothing({ target: stripeWebhookEvents.stripeEventId })
        .returning({ id: stripeWebhookEvents.id });
      if (!stored) return { kind: "duplicate" };

      if (!payoutId) {
        await tx.update(stripeWebhookEvents).set({ status: "ignored", processedAt: new Date() }).where(eq(stripeWebhookEvents.id, stored.id));
        return { kind: "ignored" };
      }
      const [payout] = await tx.select().from(payouts).where(eq(payouts.id, payoutId)).limit(1);
      if (!payout) {
        await tx.update(stripeWebhookEvents).set({ status: "ignored", failureReason: "Payout ID not found", processedAt: new Date() }).where(eq(stripeWebhookEvents.id, stored.id));
        return { kind: "unknown_payout", eventId: event.id, payoutId };
      }

      if (event.type === "transfer.created") {
        // Guard against an out-of-order transfer.created arriving after a
        // transfer.failed/reversed already resolved this payout: only a payout
        // still awaiting its outcome may be marked released.
        //
        // "releasing" is included because the release route commits that claim
        // before calling Stripe, so the webhook legitimately races the route's
        // own completion. Whichever arrives first records the release; the other
        // finds the row already "released" and ignores it.
        const [row] = await tx
          .update(payouts)
          .set({ status: "released", settlementProvider: "stripe", settlementRef: event.data.object.id || payout.settlementRef, providerEventId: event.id, reconciledAt: new Date(), releasedAt: payout.releasedAt ?? new Date(), failureReason: null })
          .where(and(eq(payouts.id, payout.id), inArray(payouts.status, ["authorized", "releasing"])))
          .returning();
        await tx
          .update(stripeWebhookEvents)
          .set({
            status: row ? "processed" : "ignored",
            failureReason: row ? null : `Payout was already "${payout.status}"; ignored an out-of-order transfer.created.`,
            processedAt: new Date(),
          })
          .where(eq(stripeWebhookEvents.id, stored.id));
        if (!row) return { kind: "stale", payoutId: payout.id, payoutStatus: payout.status, eventId: event.id };
        await recordLifecycleEvent(tx, { workOrderId: payout.workOrderId, type: "stripe_transfer_reconciled", actor: "stripe/webhook", summary: "Stripe confirmed the relay transfer.", data: { payoutId: payout.id, stripeEventId: event.id, transferId: event.data.object.id || null } });
        return { kind: "reconciled" };
      }

      if (event.type === "transfer.failed" || event.type === "transfer.reversed") {
        const reason = event.data.object.failure_message || (event.type === "transfer.reversed" ? "Stripe transfer reversed." : "Stripe transfer failed.");
        await tx.update(payouts).set({ status: "failed", providerEventId: event.id, reconciledAt: new Date(), failureReason: reason }).where(eq(payouts.id, payout.id));
        await tx.update(stripeWebhookEvents).set({ status: "processed", failureReason: reason, processedAt: new Date() }).where(eq(stripeWebhookEvents.id, stored.id));
        await recordLifecycleEvent(tx, { workOrderId: payout.workOrderId, type: "stripe_transfer_failed", actor: "stripe/webhook", summary: `Stripe reported a payout issue: ${reason}`, data: { payoutId: payout.id, stripeEventId: event.id } });
        return { kind: "failed", payoutId: payout.id, reason, eventId: event.id };
      }

      await tx.update(stripeWebhookEvents).set({ status: "ignored", processedAt: new Date() }).where(eq(stripeWebhookEvents.id, stored.id));
      return { kind: "ignored" };
    });

    if (outcome.kind === "duplicate") return Response.json({ ok: true, duplicate: true });
    if (outcome.kind === "unknown_payout") {
      await recordOperationalEvent({ level: "warning", service: "stripe", code: "unknown_payout_webhook", message: `Stripe event ${outcome.eventId} referenced an unknown payout.`, resourceType: "stripe_event", resourceId: outcome.eventId, data: { payoutId: outcome.payoutId } });
      return Response.json({ ok: true, ignored: true });
    }
    if (outcome.kind === "stale") {
      await recordOperationalEvent({ level: "warning", service: "stripe", code: "stale_transfer_created", message: `Ignored an out-of-order transfer.created for payout already in status "${outcome.payoutStatus}".`, resourceType: "payout", resourceId: outcome.payoutId, data: { stripeEventId: outcome.eventId } });
      return Response.json({ ok: true, ignored: true });
    }
    if (outcome.kind === "failed") {
      await recordOperationalEvent({ level: "critical", service: "stripe", code: "transfer_failed", message: outcome.reason, resourceType: "payout", resourceId: outcome.payoutId, data: { stripeEventId: outcome.eventId } });
      return Response.json({ ok: true, failed: true });
    }
    if (outcome.kind === "reconciled") return Response.json({ ok: true, reconciled: true });
    return Response.json({ ok: true, ignored: true });
  } catch (error) {
    await reportException({ service: "stripe", code: "webhook_processing_failed", error, resourceType: "stripe_webhook" });
    return Response.json({ error: "Stripe webhook processing failed." }, { status: 500 });
  }
}
