import { afterAll, describe, expect, it } from "vitest";
import { db, pool } from "@/db";
import { executionEvents, relayBids, relays, workOrders } from "@/db/schema";
import { seedSandboxData } from "@/lib/sandbox";
import { inArray, like } from "drizzle-orm";

/**
 * Sandbox seeding is a deployment step invoked by `npm run db:seed:sandbox`,
 * not something request handling can reach. It used to be awaited by seven
 * route handlers, so the properties that mattered were a production gate and
 * once-per-process memoization; both are gone with the call sites, and the
 * route-level guarantee is now covered by sandbox-not-in-request-path.test.ts.
 *
 * What still matters is that the seed itself is safe to run: idempotent, and
 * never scanning a table it does not filter.
 */

const SANDBOX_HANDLES = ["northstar-07", "atlas-field", "gridline-2"];

async function clearSandboxRows() {
  const orders = await db.select({ id: workOrders.id }).from(workOrders).where(like(workOrders.externalRef, "sandbox-%"));
  const orderIds = orders.map((order) => order.id);
  if (orderIds.length) {
    await db.delete(executionEvents).where(inArray(executionEvents.workOrderId, orderIds));
    await db.delete(relayBids).where(inArray(relayBids.workOrderId, orderIds));
    await db.delete(workOrders).where(inArray(workOrders.id, orderIds));
  }
  await db.delete(relays).where(inArray(relays.handle, SANDBOX_HANDLES));
}

/** Records the statements issued through the shared pool while `run` executes. */
async function captureStatements(run: () => Promise<unknown>) {
  const statements: string[] = [];
  const original = pool.query.bind(pool);
  try {
    (pool as any).query = (...args: any[]) => {
      const text = typeof args[0] === "string" ? args[0] : args[0]?.text;
      if (typeof text === "string") statements.push(text);
      return (original as any)(...args);
    };
    await run();
  } finally {
    // Restoring in `finally` matters: an assertion thrown before this line
    // would otherwise leave the pool poisoned for every later test.
    (pool as any).query = original;
  }
  return statements;
}

afterAll(async () => {
  await clearSandboxRows();
});

describe("sandbox seed", () => {
  it("seeds the demonstration relays, outcomes, and bids", async () => {
    await clearSandboxRows();
    await seedSandboxData();

    const seeded = await db.select({ handle: relays.handle }).from(relays).where(inArray(relays.handle, SANDBOX_HANDLES));
    expect(seeded).toHaveLength(SANDBOX_HANDLES.length);

    const orders = await db.select({ id: workOrders.id }).from(workOrders).where(like(workOrders.externalRef, "sandbox-%"));
    expect(orders.length).toBeGreaterThan(0);
  });

  it("is idempotent, so re-running a deploy step cannot duplicate demo rows", async () => {
    await clearSandboxRows();
    await seedSandboxData();
    const afterFirst = await db.select({ id: workOrders.id }).from(workOrders).where(like(workOrders.externalRef, "sandbox-%"));
    const bidsAfterFirst = await db.select({ id: relayBids.id }).from(relayBids).where(inArray(relayBids.workOrderId, afterFirst.map((order) => order.id)));

    await seedSandboxData();
    const afterSecond = await db.select({ id: workOrders.id }).from(workOrders).where(like(workOrders.externalRef, "sandbox-%"));
    const bidsAfterSecond = await db.select({ id: relayBids.id }).from(relayBids).where(inArray(relayBids.workOrderId, afterSecond.map((order) => order.id)));

    expect(afterSecond).toHaveLength(afterFirst.length);
    expect(bidsAfterSecond).toHaveLength(bidsAfterFirst.length);

    const seeded = await db.select({ handle: relays.handle }).from(relays).where(inArray(relays.handle, SANDBOX_HANDLES));
    expect(seeded).toHaveLength(SANDBOX_HANDLES.length);
  });

  it("never scans a table unfiltered", async () => {
    const statements = await captureStatements(() => seedSandboxData());

    expect(statements.length).toBeGreaterThan(0);
    // The three scans this guards against were on relays, work_orders, and
    // execution_events — each unbounded and each on a table that grows in
    // production.
    const unfilteredSelects = statements.filter((text) => /^\s*select/i.test(text) && !/\swhere\s/i.test(text));
    expect(unfilteredSelects).toEqual([]);
  });
});
