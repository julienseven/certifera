import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { db } from "@/db";
import { executionEvents, relayBids, relays, reputationEvents, workOrders } from "@/db/schema";
import { escalateOverdueSla } from "@/lib/sla";
import { eq, inArray } from "drizzle-orm";

/**
 * Escalation has to be a one-shot per SLA window, and the sweep gives it two
 * ways to be called twice on the same outcome.
 *
 * A review escalation leaves the outcome in "review" with its deadline still in
 * the past — the only thing that changes is sla_status — so every later caller
 * still sees an overdue review window and escalates it again. Nothing about the
 * row stops it, which is how a single stuck review turns into one duplicate
 * lifecycle event per sweep, forever.
 *
 * The second way is overlap: the hourly cron and an operator pressing "run
 * maintenance" resolve the same overdue execution concurrently. Both read the
 * row before either writes it, so the relay pays the reputation penalty twice
 * for one missed commitment.
 */

const suffix = randomUUID().slice(0, 8);
const relayIds: string[] = [];
const workOrderIds: string[] = [];

afterAll(async () => {
  if (workOrderIds.length) await db.delete(workOrders).where(inArray(workOrders.id, workOrderIds));
  if (relayIds.length) await db.delete(relays).where(inArray(relays.id, relayIds));
});

async function makeRelay(reputation = 100) {
  const [relay] = await db
    .insert(relays)
    .values({
      handle: `sla-idem-${suffix}-${relayIds.length}`,
      zone: "Test zone",
      specialty: "sla idempotence",
      coverageCategories: ["Infrastructure"],
      availabilityStatus: "available",
      onboardingStatus: "approved",
      active: true,
      reputation,
    })
    .returning();
  relayIds.push(relay.id);
  return relay;
}

async function makeWorkOrder(overrides: Partial<typeof workOrders.$inferInsert>) {
  const [workOrder] = await db
    .insert(workOrders)
    .values({
      externalRef: `sla-idem-${suffix}-${workOrderIds.length}`,
      title: "SLA idempotence outcome",
      category: "Infrastructure",
      location: "Test City",
      rewardCents: 10_000,
      requester: "sla-idempotence-suite",
      proofRequirements: ["photo"],
      status: "matched",
      ...overrides,
    })
    .returning();
  workOrderIds.push(workOrder.id);
  return workOrder;
}

describe("escalateOverdueSla is one-shot per window", () => {
  it("refuses to escalate a review window it has already escalated", async () => {
    const relay = await makeRelay();
    const workOrder = await makeWorkOrder({ status: "review", selectedRelayId: relay.id, reviewDueAt: new Date(Date.now() - 60_000), slaStatus: "on_track" });

    const first = await escalateOverdueSla(workOrder.id, "test-suite/first");
    expect(first).toMatchObject({ ok: true, action: "review_escalated" });

    // The deadline is still in the past and the outcome is still in review, so
    // nothing about the row has stopped being "overdue". Only the recorded
    // escalation distinguishes the second call from the first.
    const second = await escalateOverdueSla(workOrder.id, "test-suite/second");
    expect(second).toEqual({ ok: false, error: "This SLA window has already been escalated.", status: 409 });

    const escalations = await db.select().from(executionEvents).where(eq(executionEvents.workOrderId, workOrder.id));
    expect(escalations.filter((event) => event.type === "review_sla_escalated")).toHaveLength(1);
  });

  it("still escalates a review window on an outcome whose execution breached earlier", async () => {
    // Late evidence leaves sla_status at "execution_breached" while the outcome
    // moves into review, so the guard has to be per-phase and not just "this
    // outcome breached something once".
    const relay = await makeRelay();
    const workOrder = await makeWorkOrder({ status: "review", selectedRelayId: relay.id, reviewDueAt: new Date(Date.now() - 60_000), slaStatus: "execution_breached" });

    const result = await escalateOverdueSla(workOrder.id, "test-suite/late-evidence");
    expect(result).toMatchObject({ ok: true, action: "review_escalated", slaStatus: "review_breached" });
  });

  it("penalises the relay once when two runs escalate the same execution at the same time", async () => {
    const relay = await makeRelay(100);
    const workOrder = await makeWorkOrder({ selectedRelayId: relay.id, executionDueAt: new Date(Date.now() - 60_000), slaStatus: "on_track" });
    await db.insert(relayBids).values({ workOrderId: workOrder.id, relayId: relay.id, quoteCents: 8_000, etaMinutes: 60, status: "selected" });

    const [cron, operator] = await Promise.all([
      escalateOverdueSla(workOrder.id, "maintenance/worker"),
      escalateOverdueSla(workOrder.id, "operator/console"),
    ]);

    // Exactly one of the two owns the escalation; the loser must be told the
    // window is gone rather than re-applying the penalty.
    expect([cron.ok, operator.ok].filter(Boolean)).toHaveLength(1);

    const penalties = await db.select().from(reputationEvents).where(eq(reputationEvents.workOrderId, workOrder.id));
    expect(penalties).toHaveLength(1);

    const [updatedRelay] = await db.select().from(relays).where(eq(relays.id, relay.id)).limit(1);
    expect(updatedRelay.reputation).toBe(94);

    const ledger = await db.select().from(executionEvents).where(eq(executionEvents.workOrderId, workOrder.id));
    expect(ledger.filter((event) => event.type === "execution_sla_escalated")).toHaveLength(1);
  });
});
