import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { db, pool } from "@/db";
import { executionEvents, relayBids, relays, workOrders } from "@/db/schema";
import { ensureSandboxData, resetSandboxSeedCache } from "@/lib/sandbox";
import { inArray, like } from "drizzle-orm";

/**
 * ensureSandboxData() is awaited by nine route handlers, several of them on the
 * hottest paths. Before it was gated and memoized it issued 17 statements on
 * every request, three of which were unfiltered scans of relays, work_orders,
 * and execution_events — tables that grow with real production traffic.
 *
 * These lock in the three properties that keep it off the hot path: the
 * production gate, once-per-process memoization, and scoped reads.
 */

const SANDBOX_HANDLES = ["northstar-07", "atlas-field", "gridline-2"];

/** Counts statements issued through the shared pool while `run` executes. */
async function countQueries(run: () => Promise<unknown>) {
  const original = pool.query.bind(pool);
  let count = 0;
  (pool as any).query = (...args: unknown[]) => {
    count += 1;
    return (original as any)(...args);
  };
  try {
    await run();
  } finally {
    (pool as any).query = original;
  }
  return count;
}

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

beforeEach(() => {
  resetSandboxSeedCache();
  delete process.env.CERTIFERA_SANDBOX_SEED;
});

afterEach(() => {
  delete process.env.CERTIFERA_SANDBOX_SEED;
});

afterAll(async () => {
  await clearSandboxRows();
});

describe("sandbox seeding gate", () => {
  it("issues no queries at all when explicitly disabled", async () => {
    process.env.CERTIFERA_SANDBOX_SEED = "false";
    const queries = await countQueries(() => ensureSandboxData());
    expect(queries).toBe(0);
  });

  it("seeds when explicitly enabled", async () => {
    await clearSandboxRows();
    process.env.CERTIFERA_SANDBOX_SEED = "true";
    await ensureSandboxData();
    const seeded = await db.select({ handle: relays.handle }).from(relays).where(inArray(relays.handle, SANDBOX_HANDLES));
    expect(seeded).toHaveLength(SANDBOX_HANDLES.length);
  });

  it("seeds by default outside production", async () => {
    // vitest runs with NODE_ENV=test, which is the non-production branch.
    expect(process.env.NODE_ENV).not.toBe("production");
    const queries = await countQueries(() => ensureSandboxData());
    expect(queries).toBeGreaterThan(0);
  });
});

describe("sandbox seeding memoization", () => {
  it("costs nothing after the first call in a process", async () => {
    const cold = await countQueries(() => ensureSandboxData());
    const warm = await countQueries(() => ensureSandboxData());
    expect(cold).toBeGreaterThan(0);
    expect(warm).toBe(0);
  });

  it("shares one in-flight seed across concurrent callers", async () => {
    resetSandboxSeedCache();
    // Ten simultaneous cold requests must not each run the full seed, or the
    // concurrent ON CONFLICT inserts contend for the same rows.
    const concurrent = await countQueries(() => Promise.all(Array.from({ length: 10 }, () => ensureSandboxData())));
    const single = await countQueries(async () => {
      resetSandboxSeedCache();
      await ensureSandboxData();
    });
    expect(concurrent).toBe(single);
  });

  it("retries on the next call when a seed fails", async () => {
    resetSandboxSeedCache();
    const original = pool.query.bind(pool);
    let failed = false;
    try {
      (pool as any).query = () => Promise.reject(new Error("seed boom"));
      await ensureSandboxData();
    } catch {
      // drizzle rewraps the driver error, so assert that it rejected at all
      // rather than matching a message this layer does not own.
      failed = true;
    } finally {
      // Restoring in `finally` matters: an assertion thrown before this line
      // would otherwise leave the pool poisoned for every later test.
      (pool as any).query = original;
    }
    expect(failed).toBe(true);

    // A rejected seed must be evicted, or the instance stays unseeded forever.
    await expect(ensureSandboxData()).resolves.toBeUndefined();
  });
});

describe("sandbox seeding reads", () => {
  it("never scans a table unfiltered", async () => {
    resetSandboxSeedCache();
    const statements: string[] = [];
    const original = pool.query.bind(pool);
    try {
      (pool as any).query = (...args: any[]) => {
        const text = typeof args[0] === "string" ? args[0] : args[0]?.text;
        if (typeof text === "string") statements.push(text);
        return (original as any)(...args);
      };
      await ensureSandboxData();
    } finally {
      (pool as any).query = original;
    }

    expect(statements.length).toBeGreaterThan(0);
    // The three scans this guards against were on relays, work_orders, and
    // execution_events — each unbounded and each on a table that grows in
    // production.
    const unfilteredSelects = statements.filter((text) => /^\s*select/i.test(text) && !/\swhere\s/i.test(text));
    expect(unfilteredSelects).toEqual([]);
  });
});
