import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { executionEvents, relays, workOrders } from "@/db/schema";
import { eq, inArray } from "drizzle-orm";

/**
 * The sweep selects overdue work by (status, deadline) alone. A review
 * escalation changes neither of those, so an escalated-but-unresolved review
 * stays in the result set for every subsequent run.
 *
 * That is not just duplicate noise. The batch ceiling is applied to the rows the
 * query returns, so a handful of reviews nobody has decided yet will occupy the
 * whole per-run budget and starve outcomes that breached afterwards — the sweep
 * reports work done while the actual backlog never drains.
 */

const suffix = randomUUID().slice(0, 8);
const workOrderIds: string[] = [];
const hourMs = 60 * 60 * 1000;

let relayId: string;
let staleReviewId: string;
let freshReviewId: string;

beforeAll(async () => {
  const [relay] = await db
    .insert(relays)
    .values({ handle: `sweep-idem-${suffix}`, zone: "Test zone", specialty: "sweep", coverageCategories: ["Infrastructure"] })
    .returning();
  relayId = relay.id;

  // Already escalated on some earlier run and still waiting on a reviewer.
  const [stale] = await db
    .insert(workOrders)
    .values({
      externalRef: `sweep-stale-${suffix}`,
      title: "Review escalated an hour ago",
      category: "Infrastructure",
      location: "Test City",
      rewardCents: 4_000,
      requester: "sweep-idempotence-suite",
      proofRequirements: ["photo"],
      status: "review",
      selectedRelayId: relayId,
      reviewDueAt: new Date(Date.now() - 2 * hourMs),
      slaStatus: "review_breached",
    })
    .returning();
  staleReviewId = stale.id;
  workOrderIds.push(stale.id);

  // Breached since that run and never escalated.
  const [fresh] = await db
    .insert(workOrders)
    .values({
      externalRef: `sweep-fresh-${suffix}`,
      title: "Review breached just now",
      category: "Infrastructure",
      location: "Test City",
      rewardCents: 4_000,
      requester: "sweep-idempotence-suite",
      proofRequirements: ["photo"],
      status: "review",
      selectedRelayId: relayId,
      reviewDueAt: new Date(Date.now() - hourMs),
      slaStatus: "on_track",
    })
    .returning();
  freshReviewId = fresh.id;
  workOrderIds.push(fresh.id);
});

afterAll(async () => {
  if (workOrderIds.length) await db.delete(workOrders).where(inArray(workOrders.id, workOrderIds));
  if (relayId) await db.delete(relays).where(eq(relays.id, relayId));
});

describe("maintenance sweep", () => {
  it("does not spend its batch budget re-escalating reviews it already escalated", async () => {
    // A ceiling of one makes the starvation observable: if the already-escalated
    // review is still eligible it takes the only slot, and the review that
    // breached afterwards waits for a run that never comes.
    vi.resetModules();
    process.env.CERTIFERA_MAINTENANCE_BATCH = "1";
    const { runMaintenance } = await import("@/lib/maintenance");

    await runMaintenance(`test/sweep-idem-${suffix}`);
    delete process.env.CERTIFERA_MAINTENANCE_BATCH;

    const [fresh] = await db.select().from(workOrders).where(eq(workOrders.id, freshReviewId)).limit(1);
    expect(fresh.slaStatus).toBe("review_breached");

    // And the settled one picked up no second escalation on the way past.
    const staleEvents = await db.select().from(executionEvents).where(eq(executionEvents.workOrderId, staleReviewId));
    expect(staleEvents.filter((event) => event.type === "review_sla_escalated")).toHaveLength(0);
  });
});
