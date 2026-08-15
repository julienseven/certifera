import { randomUUID } from "node:crypto";
import { db } from "@/db";
import { payouts, relays, workOrders } from "@/db/schema";
import { requireIdentity, writeAudit } from "@/lib/auth";
import { recordLifecycleEvent } from "@/lib/lifecycle";
import { recordOperationalEvent, reportException } from "@/lib/observability";
import { releaseSettlement } from "@/lib/settlement";
import { and, eq, sql } from "drizzle-orm";

/**
 * Releases an authorized payout.
 *
 * Ordering matters more than anything else in this file. The previous version
 * read the payout's preconditions, called Stripe, and only then opened a
 * transaction to mark the row released. Two things went wrong with that:
 *
 *  - The checks were a TOCTOU window. Nothing held the row between the read and
 *    the transfer, so two concurrent releases both saw "authorized" and both
 *    called Stripe. Only the per-payout idempotency key stopped a double
 *    payment, which put correctness in the provider rather than in this system.
 *  - If the process died after the transfer, or the guarded update matched no
 *    row, Stripe had moved money while the database still said "authorized" —
 *    and the endpoint returned an error inviting the operator to retry.
 *
 * The order is now: claim, commit, transfer, record.
 *
 * The claim is a single conditional UPDATE, so exactly one caller can move a
 * payout out of "authorized", and it commits before any money moves. From that
 * point the row names an in-flight attempt, and its attempt id is the provider
 * idempotency key, so a crash between claim and transfer is recoverable and can
 * never be re-released by a second caller.
 */
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireIdentity(request, { roles: ["operator", "admin"] });
  if (!auth.identity) return auth.response;

  const { id } = await context.params;
  const attemptId = randomUUID();

  // Claim: the compare-and-set that authorizes this caller, and only this
  // caller, to move money for this payout. Every precondition that used to be
  // checked in application code is in the predicate, so nothing can change
  // between the check and the claim.
  const [claimed] = await db
    .update(payouts)
    .set({ status: "releasing", releaseClaimedAt: new Date(), releaseAttemptId: attemptId })
    .where(
      and(
        eq(payouts.status, "authorized"),
        eq(
          payouts.id,
          sql`(SELECT p.id FROM ${payouts} p JOIN ${workOrders} w ON w.id = p.work_order_id
              WHERE p.work_order_id = ${id}::uuid AND w.status = 'verified' LIMIT 1)`,
        ),
      ),
    )
    .returning();

  if (!claimed) {
    // Nothing was claimable. Report which of the reasons it was, without
    // trusting the earlier read: this is a plain diagnostic, not a guard.
    const [candidate] = await db
      .select({ workOrderStatus: workOrders.status, payoutStatus: payouts.status })
      .from(workOrders)
      .innerJoin(payouts, eq(payouts.workOrderId, workOrders.id))
      .where(eq(workOrders.id, id))
      .limit(1);
    if (!candidate) return Response.json({ error: "No authorized payout exists for this request." }, { status: 409 });
    if (candidate.workOrderStatus !== "verified") return Response.json({ error: "Payout can only release after proof approval." }, { status: 409 });
    if (candidate.payoutStatus === "released") return Response.json({ error: "This payout has already been released." }, { status: 409 });
    if (candidate.payoutStatus === "releasing") return Response.json({ error: "This payout is already being released. Refresh the settlement record." }, { status: 409 });
    return Response.json({ error: "This payout is not in a releasable state." }, { status: 409 });
  }

  try {
    const [relay] = await db.select({ stripeAccountId: relays.stripeAccountId }).from(relays).where(eq(relays.id, claimed.relayId)).limit(1);

    const settlement = await releaseSettlement({
      payoutId: claimed.id,
      workOrderId: id,
      netCents: claimed.netCents,
      stripeAccountId: relay?.stripeAccountId ?? null,
      attemptId,
    });

    // Money has moved. This transition is unconditional on status because this
    // caller holds the claim: it is the only one that could have got here, and
    // leaving the row in "releasing" after a successful transfer would be worse
    // than any conflict this might overwrite. Still scoped to the attempt id so
    // a superseded claim can never write over a newer one.
    const [released] = await db.transaction(async (tx) => {
      const rows = await tx
        .update(payouts)
        .set({ status: "released", settlementProvider: settlement.provider, settlementRef: settlement.reference, releasedAt: new Date(), failureReason: null })
        .where(and(eq(payouts.id, claimed.id), eq(payouts.releaseAttemptId, attemptId)))
        .returning();
      if (rows.length > 0) {
        await recordLifecycleEvent(tx, {
          workOrderId: id,
          type: "payout_released",
          actor: `settlement/${settlement.provider}`,
          summary: `Released $${(rows[0].netCents / 100).toFixed(2)} to the selected relay through ${settlement.provider} settlement.`,
          data: { payoutId: rows[0].id, netCents: rows[0].netCents, settlementRef: settlement.reference, provider: settlement.provider },
        });
      }
      return rows;
    });

    if (!released) {
      // The transfer succeeded but the row moved out from under this attempt.
      // Money is out and the ledger disagrees, which needs a human.
      await recordOperationalEvent({
        level: "critical",
        service: "settlement",
        code: "release_recorded_without_claim",
        message: "A settlement transfer succeeded but its payout row was no longer held by this attempt.",
        resourceType: "payout",
        resourceId: claimed.id,
        data: { attemptId, settlementRef: settlement.reference, provider: settlement.provider },
      });
      return Response.json({ error: "The transfer completed but could not be recorded. This payout needs manual reconciliation." }, { status: 500 });
    }

    await writeAudit({ actorId: auth.identity.userId, action: "payout_released", resourceType: "payout", resourceId: released.id, request, data: { provider: settlement.provider, netCents: released.netCents } });
    return Response.json({ payout: released });
  } catch (error) {
    // The transfer failed, or we cannot prove it did not. Releasing the claim
    // back to "authorized" would invite a retry that could double-pay, so the
    // row stays in "releasing" for the reconciler to resolve against the
    // provider using the attempt id it already carries.
    console.error("settlement release failed", error);
    await db
      .update(payouts)
      .set({ failureReason: error instanceof Error ? error.message : "Settlement transfer failed." })
      .where(and(eq(payouts.id, claimed.id), eq(payouts.releaseAttemptId, attemptId)));
    await recordOperationalEvent({
      level: "critical",
      service: "settlement",
      code: "payout_release_failed",
      message: "A claimed payout could not be released and is awaiting reconciliation.",
      resourceType: "payout",
      resourceId: claimed.id,
      data: { attemptId, error: error instanceof Error ? error.message : "unknown" },
    });
    await reportException({ service: "settlement", code: "payout_release_failed", error, resourceType: "work_order" });
    return Response.json({ error: "Could not release the payout instruction. It is held for reconciliation." }, { status: 500 });
  }
}
