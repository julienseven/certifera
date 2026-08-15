import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { apiKeys, payouts, proofBundles, relays, users, workOrders } from "@/db/schema";
import { createApiToken } from "@/lib/auth";
import { eq } from "drizzle-orm";
import * as settlement from "@/lib/settlement";

import { PATCH as releasePayout } from "@/app/api/requests/[id]/settlement/route";

/**
 * Higher-contention version of the settlement race check.
 *
 * The two-caller case proves the claim is exclusive at all; this pushes eight
 * simultaneous callers at one payout to make sure exclusivity does not depend on
 * the timing of a small race. Postgres re-evaluates the UPDATE's predicate
 * against the updated row when it unblocks, so only the first caller can move
 * the payout out of "authorized" no matter how many are queued behind it.
 */

const suffix = randomUUID().slice(0, 8);
let relayId: string;
let operatorUserId: string;
let operatorToken: string;
const createdWorkOrders: string[] = [];

function withAuth(token: string, init: RequestInit = {}) {
  return { ...init, headers: { authorization: `Bearer ${token}`, ...(init.headers || {}) } };
}
function releaseRequest(workOrderId: string) {
  return releasePayout(
    new Request(`http://localhost/api/requests/${workOrderId}/settlement`, withAuth(operatorToken, { method: "PATCH" })),
    { params: Promise.resolve({ id: workOrderId }) },
  );
}

async function seedReleasablePayout() {
  const [workOrder] = await db
    .insert(workOrders)
    .values({
      externalRef: `settle-storm-${randomUUID().slice(0, 8)}`,
      title: "Settlement contention outcome",
      category: "Infrastructure",
      location: "Test City",
      rewardCents: 10000,
      requester: "test/settlement",
      status: "verified",
      proofRequirements: [],
      selectedRelayId: relayId,
    })
    .returning();
  createdWorkOrders.push(workOrder.id);

  const [proof] = await db
    .insert(proofBundles)
    .values({ workOrderId: workOrder.id, relayId, observation: "Contention proof bundle.", attestationHash: randomUUID(), verificationScore: 90, status: "verified" })
    .returning();

  const [payout] = await db
    .insert(payouts)
    .values({ workOrderId: workOrder.id, proofBundleId: proof.id, relayId, grossCents: 8000, protocolFeeCents: 400, netCents: 7600, status: "authorized" })
    .returning();

  return { workOrderId: workOrder.id, payoutId: payout.id };
}

beforeAll(async () => {
  process.env.CERTIFERA_SETTLEMENT_MODE = "sandbox";

  const [relay] = await db
    .insert(relays)
    .values({ handle: `settle-storm-relay-${suffix}`, zone: "Test zone", specialty: "contention", coverageCategories: ["Infrastructure"], active: true })
    .returning();
  relayId = relay.id;

  const [operator] = await db
    .insert(users)
    .values({ email: `settle-storm-${suffix}@certifera.local`, passwordHash: "unusable:unusable", displayName: "Storm Operator", role: "operator", status: "active", emailVerifiedAt: new Date() })
    .returning();
  operatorUserId = operator.id;

  const generated = createApiToken();
  operatorToken = generated.token;
  await db.insert(apiKeys).values({ userId: operatorUserId, name: "Contention test", prefix: generated.prefix, tokenHash: generated.tokenHash, scopes: ["*"] });
});

afterAll(async () => {
  for (const id of createdWorkOrders) await db.delete(workOrders).where(eq(workOrders.id, id));
  if (operatorUserId) await db.delete(users).where(eq(users.id, operatorUserId));
  if (relayId) await db.delete(relays).where(eq(relays.id, relayId));
  vi.restoreAllMocks();
});

describe("settlement release under heavy contention", () => {
  it("instructs the provider once no matter how many callers release at once", async () => {
    const { workOrderId, payoutId } = await seedReleasablePayout();

    const transfer = vi.spyOn(settlement, "releaseSettlement").mockImplementation(async (input) => {
      // Held open so every caller is genuinely in flight together.
      await new Promise((resolve) => setTimeout(resolve, 80));
      return { provider: "sandbox" as const, reference: `cert-sandbox-${input.attemptId.slice(0, 12)}` };
    });

    const responses = await Promise.all(Array.from({ length: 8 }, () => releaseRequest(workOrderId)));
    const statuses = responses.map((response) => response.status);

    // The only outcome that means money moved once.
    expect(transfer).toHaveBeenCalledTimes(1);
    expect(statuses.filter((status) => status === 200)).toHaveLength(1);
    expect(statuses.filter((status) => status === 409)).toHaveLength(7);

    const [row] = await db.select().from(payouts).where(eq(payouts.id, payoutId));
    expect(row.status).toBe("released");
    expect(row.releaseAttemptId).toBe(transfer.mock.calls[0][0].attemptId);

    vi.restoreAllMocks();
  });
});
