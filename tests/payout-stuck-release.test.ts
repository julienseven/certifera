import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/db";
import { operationalEvents, payouts, proofBundles, relays, workOrders } from "@/db/schema";
import { runMaintenance } from "@/lib/maintenance";
import { and, eq } from "drizzle-orm";

/**
 * A payout in "releasing" means a transfer was about to be attempted at the
 * provider. It is deliberately never auto-reverted to "authorized", because the
 * transfer may in fact have landed and a retry would pay twice. That safety
 * choice only works if a stuck claim is actually surfaced to a human, so this
 * covers the sweep that raises it.
 */

const suffix = randomUUID().slice(0, 8);
let relayId: string;
const orderIds: string[] = [];

async function seedPayout(status: string, claimedAt: Date | null) {
  const [workOrder] = await db
    .insert(workOrders)
    .values({
      externalRef: `stuck-${suffix}-${randomUUID().slice(0, 8)}`,
      title: "Stuck release outcome",
      category: "Infrastructure",
      location: "Test City",
      rewardCents: 10000,
      requester: "test/stuck",
      status: "verified",
      proofRequirements: [],
      selectedRelayId: relayId,
    })
    .returning();
  orderIds.push(workOrder.id);

  const [proof] = await db
    .insert(proofBundles)
    .values({
      workOrderId: workOrder.id,
      relayId,
      observation: "Stuck release proof bundle.",
      attestationHash: randomUUID(),
      verificationScore: 90,
      status: "verified",
    })
    .returning();

  const [payout] = await db
    .insert(payouts)
    .values({
      workOrderId: workOrder.id,
      proofBundleId: proof.id,
      relayId,
      grossCents: 8000,
      protocolFeeCents: 400,
      netCents: 7600,
      status,
      releaseClaimedAt: claimedAt,
      releaseAttemptId: claimedAt ? randomUUID() : null,
    })
    .returning();

  return payout;
}

async function stuckAlertsFor(payoutId: string) {
  return db
    .select({ id: operationalEvents.id, level: operationalEvents.level, data: operationalEvents.data })
    .from(operationalEvents)
    .where(and(eq(operationalEvents.code, "payout_release_stuck"), eq(operationalEvents.resourceId, payoutId)));
}

beforeAll(async () => {
  const [relay] = await db
    .insert(relays)
    .values({ handle: `stuck-relay-${suffix}`, zone: "Test zone", specialty: "stuck release", coverageCategories: ["Infrastructure"] })
    .returning();
  relayId = relay.id;
});

afterAll(async () => {
  for (const id of orderIds) await db.delete(workOrders).where(eq(workOrders.id, id));
  if (relayId) await db.delete(relays).where(eq(relays.id, relayId));
});

describe("stuck payout release detection", () => {
  it("raises a critical alert for a payout claimed long ago and never resolved", async () => {
    const payout = await seedPayout("releasing", new Date(Date.now() - 60 * 60 * 1000));

    const result = await runMaintenance("test/stuck");
    expect(result.stuckReleases).toBeGreaterThan(0);

    const alerts = await stuckAlertsFor(payout.id);
    expect(alerts).toHaveLength(1);
    expect(alerts[0].level).toBe("critical");
    // The attempt id is what a human needs to reconcile against the provider.
    expect(alerts[0].data).toMatchObject({ attemptId: expect.any(String) });

    // Never auto-reverted: reverting could double-pay if the transfer landed.
    const [row] = await db.select().from(payouts).where(eq(payouts.id, payout.id));
    expect(row.status).toBe("releasing");
  });

  it("leaves a freshly claimed payout alone", async () => {
    const payout = await seedPayout("releasing", new Date());

    await runMaintenance("test/stuck");

    // Still inside the grace window, so a release in flight is not alarmed on.
    expect(await stuckAlertsFor(payout.id)).toEqual([]);
  });

  it("does not alarm on payouts that are not mid-release", async () => {
    const authorized = await seedPayout("authorized", null);

    await runMaintenance("test/stuck");

    expect(await stuckAlertsFor(authorized.id)).toEqual([]);
  });
});
