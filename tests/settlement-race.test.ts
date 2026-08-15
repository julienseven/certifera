import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { apiKeys, payouts, proofBundles, relays, users, workOrders } from "@/db/schema";
import { createApiToken } from "@/lib/auth";
import { eq } from "drizzle-orm";
import * as settlement from "@/lib/settlement";

import { PATCH as releasePayout } from "@/app/api/requests/[id]/settlement/route";

/**
 * The settlement release is the only place in the product that moves money, and
 * the thing that makes it safe is ordering: the payout row is claimed and
 * committed *before* the provider is called, so a second caller cannot reach the
 * provider at all.
 *
 * These tests drive the real route handler against the real database and assert
 * on the states the route leaves behind. The lifecycle suite covers the happy
 * path in sequence; what is checked here is what happens when two releases race,
 * which is the case the previous read-then-transfer-then-write ordering got
 * wrong and which no sequential test can observe.
 */

const suffix = randomUUID().slice(0, 8);
let relayId: string;
let operatorUserId: string;
let operatorToken: string;
const createdWorkOrders: string[] = [];

function withAuth(token: string, init: RequestInit = {}) {
  return { ...init, headers: { authorization: `Bearer ${token}`, ...(init.headers || {}) } };
}
function params(id: string) {
  return { params: Promise.resolve({ id }) };
}
function releaseRequest(workOrderId: string) {
  return releasePayout(
    new Request(`http://localhost/api/requests/${workOrderId}/settlement`, withAuth(operatorToken, { method: "PATCH" })),
    params(workOrderId),
  );
}

/** Builds an outcome sitting exactly where a release is legal: verified, with an authorized payout. */
async function seedReleasablePayout() {
  const [workOrder] = await db
    .insert(workOrders)
    .values({
      externalRef: `settle-race-${randomUUID().slice(0, 8)}`,
      title: "Settlement race outcome",
      category: "Infrastructure",
      location: "Test City",
      rewardCents: 10000,
      requester: "test/settlement",
      status: "verified",
      proofRequirements: ["Test requirement"],
      selectedRelayId: relayId,
    })
    .returning();
  createdWorkOrders.push(workOrder.id);

  const [proof] = await db
    .insert(proofBundles)
    .values({
      workOrderId: workOrder.id,
      relayId,
      observation: "Settlement race proof bundle.",
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
      status: "authorized",
    })
    .returning();

  return { workOrderId: workOrder.id, payoutId: payout.id };
}

beforeAll(async () => {
  process.env.CERTIFERA_SETTLEMENT_MODE = "sandbox";

  const [relay] = await db
    .insert(relays)
    .values({
      handle: `settle-race-relay-${suffix}`,
      zone: "Test zone",
      specialty: "settlement race",
      coverageCategories: ["Infrastructure"],
      availabilityStatus: "available",
      onboardingStatus: "approved",
      active: true,
    })
    .returning();
  relayId = relay.id;

  const [operator] = await db
    .insert(users)
    .values({
      email: `settle-race-${suffix}@certifera.local`,
      passwordHash: "unusable:unusable",
      displayName: "Settlement Race Operator",
      role: "operator",
      status: "active",
      emailVerifiedAt: new Date(),
    })
    .returning();
  operatorUserId = operator.id;

  const generated = createApiToken();
  operatorToken = generated.token;
  await db.insert(apiKeys).values({
    userId: operatorUserId,
    name: "Settlement race test",
    prefix: generated.prefix,
    tokenHash: generated.tokenHash,
    scopes: ["*"],
  });
});

afterAll(async () => {
  for (const id of createdWorkOrders) await db.delete(workOrders).where(eq(workOrders.id, id));
  if (operatorUserId) await db.delete(users).where(eq(users.id, operatorUserId));
  if (relayId) await db.delete(relays).where(eq(relays.id, relayId));
});

describe("settlement release under concurrency", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("calls the settlement provider exactly once when two operators release simultaneously", async () => {
    const { workOrderId, payoutId } = await seedReleasablePayout();

    // The property that actually matters: how many times money was instructed
    // to move. Counting provider calls states it directly, rather than
    // inferring it from whatever the losing caller happened to write.
    //
    // The spy also widens the race window. The real sandbox adapter returns
    // synchronously, which can let the first call finish before the second is
    // scheduled; holding it open forces both callers to be in flight at once.
    const transfer = vi.spyOn(settlement, "releaseSettlement").mockImplementation(async (input) => {
      await new Promise((resolve) => setTimeout(resolve, 50));
      return { provider: "sandbox" as const, reference: `cert-sandbox-${input.attemptId.slice(0, 12)}` };
    });

    const responses = await Promise.all([releaseRequest(workOrderId), releaseRequest(workOrderId)]);
    const statuses = responses.map((response) => response.status).sort();

    expect(transfer).toHaveBeenCalledTimes(1);
    expect(statuses).toEqual([200, 409]);

    const [row] = await db.select().from(payouts).where(eq(payouts.id, payoutId));
    expect(row.status).toBe("released");
    expect(row.releasedAt).not.toBeNull();
    // The transfer was keyed on the claim the winner committed before calling out.
    expect(row.releaseAttemptId).toBe(transfer.mock.calls[0][0].attemptId);
    expect(row.settlementRef).toBe(`cert-sandbox-${row.releaseAttemptId!.slice(0, 12)}`);
  });

  it("releases exactly once when two operators release the same payout simultaneously", async () => {
    const { workOrderId, payoutId } = await seedReleasablePayout();

    // Both in flight before either resolves: this is the interleaving the old
    // read -> transfer -> write ordering could not survive.
    const responses = await Promise.all([releaseRequest(workOrderId), releaseRequest(workOrderId)]);
    const statuses = responses.map((response) => response.status).sort();

    expect(statuses).toEqual([200, 409]);

    const [row] = await db.select().from(payouts).where(eq(payouts.id, payoutId));
    expect(row.status).toBe("released");
    expect(row.releasedAt).not.toBeNull();
    // The winner's claim is the one recorded, and it is what keyed the transfer.
    expect(row.releaseAttemptId).not.toBeNull();
    expect(row.settlementRef).toBe(`cert-sandbox-${row.releaseAttemptId!.slice(0, 12)}`);
  });

  it("holds the payout for reconciliation when the provider call fails", async () => {
    const { workOrderId, payoutId } = await seedReleasablePayout();

    vi.spyOn(settlement, "releaseSettlement").mockRejectedValue(new Error("Stripe is unreachable."));

    const response = await releaseRequest(workOrderId);
    expect(response.status).toBe(500);

    // Deliberately not reverted to "authorized": the transfer may in fact have
    // landed, so a retry could double-pay. It stays claimed, carrying the
    // attempt id needed to reconcile it against the provider.
    const [row] = await db.select().from(payouts).where(eq(payouts.id, payoutId));
    expect(row.status).toBe("releasing");
    expect(row.releaseAttemptId).not.toBeNull();
    expect(row.failureReason).toContain("Stripe is unreachable.");
    expect(row.releasedAt).toBeNull();
  });

  it("claims the payout before the provider is called, so a release is never re-attempted", async () => {
    const { workOrderId, payoutId } = await seedReleasablePayout();

    await releaseRequest(workOrderId);
    const [afterFirst] = await db.select().from(payouts).where(eq(payouts.id, payoutId));
    const firstAttempt = afterFirst.releaseAttemptId;

    // A retry after a completed release must not reach the provider again, and
    // must not overwrite the reference that names the money that actually moved.
    const retry = await releaseRequest(workOrderId);
    expect(retry.status).toBe(409);
    await expect(retry.json()).resolves.toMatchObject({ error: expect.stringContaining("already been released") });

    const [afterRetry] = await db.select().from(payouts).where(eq(payouts.id, payoutId));
    expect(afterRetry.releaseAttemptId).toBe(firstAttempt);
    expect(afterRetry.settlementRef).toBe(afterFirst.settlementRef);
    expect(afterRetry.releasedAt?.getTime()).toBe(afterFirst.releasedAt?.getTime());
  });

  it("refuses to release a payout whose outcome is not verified", async () => {
    const { workOrderId, payoutId } = await seedReleasablePayout();
    await db.update(workOrders).set({ status: "review" }).where(eq(workOrders.id, workOrderId));

    const response = await releaseRequest(workOrderId);
    expect(response.status).toBe(409);

    // The claim must not have been taken: an unverified outcome should leave the
    // payout exactly as it was, still releasable once review completes.
    const [row] = await db.select().from(payouts).where(eq(payouts.id, payoutId));
    expect(row.status).toBe("authorized");
    expect(row.releaseAttemptId).toBeNull();
    expect(row.releaseClaimedAt).toBeNull();
  });

  it("does not hand out a second claim on a payout already being released", async () => {
    const { workOrderId, payoutId } = await seedReleasablePayout();
    const inFlightAttempt = randomUUID();
    // Simulates an attempt that reached the provider but never recorded its
    // outcome, e.g. the process died mid-transfer.
    await db
      .update(payouts)
      .set({ status: "releasing", releaseClaimedAt: new Date(), releaseAttemptId: inFlightAttempt })
      .where(eq(payouts.id, payoutId));

    const response = await releaseRequest(workOrderId);
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ error: expect.stringContaining("already being released") });

    // Untouched, so reconciliation can still resolve it against the provider.
    const [row] = await db.select().from(payouts).where(eq(payouts.id, payoutId));
    expect(row.status).toBe("releasing");
    expect(row.releaseAttemptId).toBe(inFlightAttempt);
  });
});
