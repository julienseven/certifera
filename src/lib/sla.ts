import { db } from "@/db";
import { relayBids, relays, reputationEvents, workOrders } from "@/db/schema";
import { recordLifecycleEvent, REPUTATION_SLA_BREACH_PENALTY } from "@/lib/lifecycle";
import { and, eq } from "drizzle-orm";

export type SlaSnapshot = {
  phase: "execution" | "review" | null;
  dueAt: Date | null;
  isOverdue: boolean;
  slaStatus: string;
};

export function getSlaSnapshot(workOrder: { status: string; executionDueAt: Date | null; reviewDueAt: Date | null; slaStatus: string }): SlaSnapshot {
  const phase = workOrder.status === "matched" ? "execution" : workOrder.status === "review" ? "review" : null;
  const dueAt = phase === "execution" ? workOrder.executionDueAt : phase === "review" ? workOrder.reviewDueAt : null;
  return { phase, dueAt, isOverdue: Boolean(dueAt && Date.now() > dueAt.getTime()), slaStatus: workOrder.slaStatus };
}

export type SlaEscalation =
  | { ok: true; action: "review_escalated" | "execution_reopened"; status: "review" | "open"; slaStatus: string; reputationDelta?: number }
  | { ok: false; error: string; status: number };

/**
 * The sla_status each phase's escalation writes, which is also the record that
 * the phase has already been escalated.
 *
 * Reopening an execution moves the outcome out of the matched state, so a
 * second attempt finds no window. A review escalation has nothing equivalent:
 * the outcome stays in "review" with its deadline still in the past, so without
 * this the same overdue review is escalated again on every sweep. Checked per
 * phase rather than as "has breached something", because late evidence leaves
 * an outcome in review carrying execution_breached and that review window still
 * deserves its own escalation.
 */
const ESCALATED_STATUS = { execution: "execution_breached", review: "review_breached" } as const;

export async function escalateOverdueSla(workOrderId: string, actor: string): Promise<SlaEscalation> {
  return db.transaction(async (tx) => {
    // Locked, not just read: the hourly cron and an operator pressing "run
    // maintenance" reach the same overdue outcome concurrently, and both would
    // otherwise decide it needs escalating before either wrote its verdict —
    // charging the relay two reputation penalties for one missed commitment.
    // Under read committed the loser re-reads the row this released, so it sees
    // the escalation that just landed.
    const [workOrder] = await tx.select().from(workOrders).where(eq(workOrders.id, workOrderId)).limit(1).for("update");
    if (!workOrder) return { ok: false, error: "This request no longer exists.", status: 404 };
    const snapshot = getSlaSnapshot(workOrder);
    if (!snapshot.phase) return { ok: false, error: "This request has no active SLA window to evaluate.", status: 409 };
    if (!snapshot.isOverdue) return { ok: false, error: "The active SLA window has not expired yet.", status: 409 };
    if (workOrder.slaStatus === ESCALATED_STATUS[snapshot.phase]) {
      return { ok: false, error: "This SLA window has already been escalated.", status: 409 };
    }

    if (snapshot.phase === "review") {
      await tx.update(workOrders).set({ slaStatus: "review_breached", updatedAt: new Date() }).where(eq(workOrders.id, workOrderId));
      await recordLifecycleEvent(tx, {
        workOrderId,
        type: "review_sla_escalated",
        actor,
        summary: "Escalated an overdue review window. Evidence remains held pending a decision.",
        data: { reviewDueAt: workOrder.reviewDueAt?.toISOString() || null },
      });
      return { ok: true, action: "review_escalated", status: "review", slaStatus: "review_breached" };
    }

    if (!workOrder.selectedRelayId) return { ok: false, error: "This execution has no selected relay to escalate.", status: 409 };
    const [relay] = await tx.select().from(relays).where(eq(relays.id, workOrder.selectedRelayId)).limit(1);
    const [selectedBid] = await tx
      .select()
      .from(relayBids)
      .where(and(eq(relayBids.workOrderId, workOrderId), eq(relayBids.status, "selected")))
      .limit(1);
    await tx
      .update(workOrders)
      .set({ status: "open", selectedRelayId: null, executionDueAt: null, reviewDueAt: null, slaStatus: "execution_breached", updatedAt: new Date() })
      .where(eq(workOrders.id, workOrderId));
    if (selectedBid) await tx.update(relayBids).set({ status: "expired" }).where(eq(relayBids.id, selectedBid.id));

    let reputationDelta = 0;
    if (relay) {
      const nextReputation = Math.max(0, relay.reputation + REPUTATION_SLA_BREACH_PENALTY);
      reputationDelta = nextReputation - relay.reputation;
      await tx.update(relays).set({ reputation: nextReputation }).where(eq(relays.id, relay.id));
      await tx.insert(reputationEvents).values({ relayId: relay.id, workOrderId, delta: reputationDelta, reason: "Missed committed execution SLA without a submitted proof bundle." });
    }
    await recordLifecycleEvent(tx, {
      workOrderId,
      type: "execution_sla_escalated",
      actor,
      summary: `Execution SLA expired. Outcome reopened for bids${relay ? `; ${relay.handle} reputation changed by ${reputationDelta}` : ""}.`,
      data: { relayId: workOrder.selectedRelayId, executionDueAt: workOrder.executionDueAt?.toISOString() || null, reputationDelta },
    });
    return { ok: true, action: "execution_reopened", status: "open", slaStatus: "execution_breached", reputationDelta };
  });
}
