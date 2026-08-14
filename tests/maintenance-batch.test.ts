import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { relays, workOrders } from "@/db/schema";
import { eq, inArray } from "drizzle-orm";

/**
 * The hourly sweep escalates each overdue outcome in its own transaction, so an
 * unbounded backlog would run until the serverless function is killed — leaving
 * the run row stuck at "running". These cover the per-run ceiling and the
 * `overdueRemaining` signal that lets a backlog drain across runs.
 */

const suffix = randomUUID().slice(0, 8);
const hourMs = 60 * 60 * 1000;

let relayId: string;
const orderIds: string[] = [];

beforeAll(async () => {
  const [relay] = await db
    .insert(relays)
    .values({ handle: `batch-relay-${suffix}`, zone: "Austin", specialty: "Infrastructure", coverageCategories: ["Infrastructure"] })
    .returning();
  relayId = relay.id;

  const past = new Date(Date.now() - 2 * hourMs);
  for (let index = 0; index < 3; index += 1) {
    const [order] = await db
      .insert(workOrders)
      .values({
        externalRef: `batch-${suffix}-${index}`,
        title: "Overdue execution",
        category: "Infrastructure",
        location: "Austin, TX",
        rewardCents: 1000,
        requester: "test",
        proofRequirements: [],
        status: "matched",
        selectedRelayId: relayId,
        executionDueAt: past,
      })
      .returning();
    orderIds.push(order.id);
  }
});

afterAll(async () => {
  if (orderIds.length) await db.delete(workOrders).where(inArray(workOrders.id, orderIds));
  if (relayId) await db.delete(relays).where(eq(relays.id, relayId));
});

describe("maintenance batching", () => {
  it("caps escalations per run and reports the remaining backlog", async () => {
    // The ceiling is read at module load, so the env var must be set before the
    // dynamic import rather than before the call.
    vi.resetModules();
    process.env.CERTIFERA_MAINTENANCE_BATCH = "2";
    const { runMaintenance } = await import("@/lib/maintenance");

    const result = await runMaintenance("test/batch");

    expect(result.overdueChecked).toBe(2);
    expect(result.overdueRemaining).toBeGreaterThanOrEqual(1);
    delete process.env.CERTIFERA_MAINTENANCE_BATCH;
  });

  it("reports no backlog once the queue fits inside one run", async () => {
    vi.resetModules();
    process.env.CERTIFERA_MAINTENANCE_BATCH = "50";
    const { runMaintenance } = await import("@/lib/maintenance");

    const result = await runMaintenance("test/batch-drain");

    expect(result.overdueRemaining).toBe(0);
    delete process.env.CERTIFERA_MAINTENANCE_BATCH;
  });
});

describe("maintenance cron entrypoint", () => {
  it("answers GET, which is the only verb Vercel Cron issues", async () => {
    const route = await import("@/app/api/internal/maintenance/route");
    expect(typeof route.GET).toBe("function");
    // Same handler for both, so a manual admin POST cannot drift from the cron path.
    expect(route.GET).toBe(route.POST);
  });

  it("allows a longer duration than the 10s serverless default", async () => {
    const route = await import("@/app/api/internal/maintenance/route");
    expect(route.maxDuration).toBeGreaterThan(10);
  });
});
