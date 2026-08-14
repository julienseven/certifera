import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { db } from "@/db";
import { executionEvents, relayBids, relays, reputationEvents, workOrders } from "@/db/schema";
import { escalateOverdueSla, getSlaSnapshot } from "@/lib/sla";
import { eq } from "drizzle-orm";

describe("getSlaSnapshot", () => {
  const base = { executionDueAt: null as Date | null, reviewDueAt: null as Date | null, slaStatus: "on_track" };

  it("tracks the execution deadline while matched", () => {
    const past = new Date(Date.now() - 60_000);
    const snapshot = getSlaSnapshot({ ...base, status: "matched", executionDueAt: past });
    expect(snapshot).toEqual({ phase: "execution", dueAt: past, isOverdue: true, slaStatus: "on_track" });
  });

  it("is not overdue while the execution deadline is still in the future", () => {
    const future = new Date(Date.now() + 60_000);
    const snapshot = getSlaSnapshot({ ...base, status: "matched", executionDueAt: future });
    expect(snapshot.isOverdue).toBe(false);
    expect(snapshot.phase).toBe("execution");
  });

  it("tracks the review deadline while in review", () => {
    const past = new Date(Date.now() - 60_000);
    const snapshot = getSlaSnapshot({ ...base, status: "review", reviewDueAt: past });
    expect(snapshot).toEqual({ phase: "review", dueAt: past, isOverdue: true, slaStatus: "on_track" });
  });

  it("has no active SLA window outside matched/review states", () => {
    const past = new Date(Date.now() - 60_000);
    const snapshot = getSlaSnapshot({ ...base, status: "open", executionDueAt: past, reviewDueAt: past });
    expect(snapshot).toEqual({ phase: null, dueAt: null, isOverdue: false, slaStatus: "on_track" });
  });

  it("is not overdue when the relevant deadline is missing", () => {
    const snapshot = getSlaSnapshot({ ...base, status: "matched", executionDueAt: null });
    expect(snapshot.isOverdue).toBe(false);
    expect(snapshot.dueAt).toBeNull();
  });

  it("passes the stored slaStatus through unchanged", () => {
    const snapshot = getSlaSnapshot({ ...base, status: "matched", executionDueAt: null, slaStatus: "execution_breached" });
    expect(snapshot.slaStatus).toBe("execution_breached");
  });
});

describe("escalateOverdueSla", () => {
  const suffix = randomUUID().slice(0, 8);
  const createdRelayIds: string[] = [];
  const createdWorkOrderIds: string[] = [];

  afterAll(async () => {
    for (const id of createdWorkOrderIds) await db.delete(workOrders).where(eq(workOrders.id, id));
    for (const id of createdRelayIds) await db.delete(relays).where(eq(relays.id, id));
  });

  async function makeRelay(reputation: number) {
    const [relay] = await db
      .insert(relays)
      .values({
        handle: `sla-test-relay-${suffix}-${createdRelayIds.length}`,
        zone: "Test zone",
        specialty: "sla test",
        coverageCategories: ["Infrastructure"],
        availabilityStatus: "available",
        onboardingStatus: "approved",
        active: true,
        reputation,
        lastHeartbeatAt: new Date(),
      })
      .returning();
    createdRelayIds.push(relay.id);
    return relay;
  }

  async function makeWorkOrder(overrides: Partial<typeof workOrders.$inferInsert>) {
    const [workOrder] = await db
      .insert(workOrders)
      .values({
        externalRef: `sla-test-${suffix}-${createdWorkOrderIds.length}`,
        title: "SLA test outcome",
        category: "Infrastructure",
        location: "Test City",
        rewardCents: 10_000,
        requester: "sla-test-suite",
        proofRequirements: ["photo"],
        status: "matched",
        ...overrides,
      })
      .returning();
    createdWorkOrderIds.push(workOrder.id);
    return workOrder;
  }

  it("reopens the request and applies the reputation penalty when execution is overdue", async () => {
    const relay = await makeRelay(100);
    const workOrder = await makeWorkOrder({ selectedRelayId: relay.id, executionDueAt: new Date(Date.now() - 60_000), slaStatus: "on_track" });
    const [bid] = await db
      .insert(relayBids)
      .values({ workOrderId: workOrder.id, relayId: relay.id, quoteCents: 8_000, etaMinutes: 60, status: "selected" })
      .returning();

    const result = await escalateOverdueSla(workOrder.id, "test-suite/operator");
    expect(result).toEqual({ ok: true, action: "execution_reopened", status: "open", slaStatus: "execution_breached", reputationDelta: -6 });

    const [updatedOrder] = await db.select().from(workOrders).where(eq(workOrders.id, workOrder.id)).limit(1);
    expect(updatedOrder).toMatchObject({ status: "open", selectedRelayId: null, executionDueAt: null, reviewDueAt: null, slaStatus: "execution_breached" });

    const [updatedBid] = await db.select().from(relayBids).where(eq(relayBids.id, bid.id)).limit(1);
    expect(updatedBid.status).toBe("expired");

    const [updatedRelay] = await db.select().from(relays).where(eq(relays.id, relay.id)).limit(1);
    expect(updatedRelay.reputation).toBe(94);

    const events = await db.select().from(reputationEvents).where(eq(reputationEvents.workOrderId, workOrder.id));
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ relayId: relay.id, delta: -6 });

    const ledger = await db.select().from(executionEvents).where(eq(executionEvents.workOrderId, workOrder.id));
    expect(ledger.map((event) => event.type)).toContain("execution_sla_escalated");
  });

  it("floors reputation at zero instead of going negative", async () => {
    const relay = await makeRelay(3);
    const workOrder = await makeWorkOrder({ selectedRelayId: relay.id, executionDueAt: new Date(Date.now() - 60_000), slaStatus: "on_track" });

    const result = await escalateOverdueSla(workOrder.id, "test-suite/operator");
    expect(result).toMatchObject({ ok: true, reputationDelta: -3 });

    const [updatedRelay] = await db.select().from(relays).where(eq(relays.id, relay.id)).limit(1);
    expect(updatedRelay.reputation).toBe(0);
  });

  it("escalates an overdue review window without reopening the request or touching reputation", async () => {
    const relay = await makeRelay(100);
    const workOrder = await makeWorkOrder({ status: "review", selectedRelayId: relay.id, reviewDueAt: new Date(Date.now() - 60_000), slaStatus: "on_track" });

    const result = await escalateOverdueSla(workOrder.id, "test-suite/operator");
    expect(result).toEqual({ ok: true, action: "review_escalated", status: "review", slaStatus: "review_breached" });

    const [updatedOrder] = await db.select().from(workOrders).where(eq(workOrders.id, workOrder.id)).limit(1);
    expect(updatedOrder).toMatchObject({ status: "review", slaStatus: "review_breached" });

    const [updatedRelay] = await db.select().from(relays).where(eq(relays.id, relay.id)).limit(1);
    expect(updatedRelay.reputation).toBe(100);
  });

  it("rejects escalation for a request that does not exist", async () => {
    const result = await escalateOverdueSla(randomUUID(), "test-suite/operator");
    expect(result).toEqual({ ok: false, error: "This request no longer exists.", status: 404 });
  });

  it("rejects escalation when there is no active SLA window", async () => {
    const workOrder = await makeWorkOrder({ status: "open" });
    const result = await escalateOverdueSla(workOrder.id, "test-suite/operator");
    expect(result).toEqual({ ok: false, error: "This request has no active SLA window to evaluate.", status: 409 });
  });

  it("rejects escalation when the deadline has not yet passed", async () => {
    const relay = await makeRelay(100);
    const workOrder = await makeWorkOrder({ selectedRelayId: relay.id, executionDueAt: new Date(Date.now() + 60_000), slaStatus: "on_track" });
    const result = await escalateOverdueSla(workOrder.id, "test-suite/operator");
    expect(result).toEqual({ ok: false, error: "The active SLA window has not expired yet.", status: 409 });
  });

  it("rejects execution escalation when no relay is selected", async () => {
    const workOrder = await makeWorkOrder({ selectedRelayId: null, executionDueAt: new Date(Date.now() - 60_000), slaStatus: "on_track" });
    const result = await escalateOverdueSla(workOrder.id, "test-suite/operator");
    expect(result).toEqual({ ok: false, error: "This execution has no selected relay to escalate.", status: 409 });
  });
});
