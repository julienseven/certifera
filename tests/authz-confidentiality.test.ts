import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/db";
import { apiKeys, payouts, proofBundles, relayBids, relays, users, workOrders } from "@/db/schema";
import { createApiToken } from "@/lib/auth";
import { eq, inArray } from "drizzle-orm";

import { GET as getBids } from "@/app/api/requests/[id]/bids/route";
import { GET as getActivity } from "@/app/api/requests/[id]/activity/route";

/**
 * A relay must not be able to read another relay's commercial position.
 *
 * Every route below is reachable with a bare `requireIdentity(request)`, which
 * proves the caller is *someone* but says nothing about whether that someone
 * should see this outcome's data. The bid book is the sharpest case: it returns
 * every competing quote, ETA, and margin for an outcome to any authenticated
 * caller, so one relay could read the whole market and underbid it by a dollar.
 *
 * The tests are written from the perspective of a relay that has no
 * relationship to the outcome at all: not selected, and holding no bid on it.
 */

const suffix = randomUUID().slice(0, 8);

let incumbentRelayId: string;
let rivalRelayId: string;
let operatorToken: string;
let rivalRelayToken: string;
let incumbentRelayToken: string;
let workOrderId: string;
const userIds: string[] = [];

function withAuth(token: string, init: RequestInit = {}) {
  return { ...init, headers: { authorization: `Bearer ${token}`, ...(init.headers || {}) } };
}
function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

async function makeRelay(handle: string) {
  const [relay] = await db
    .insert(relays)
    .values({ handle, zone: "Test zone", specialty: "leak test", coverageCategories: ["Infrastructure"], active: true })
    .returning();
  return relay.id;
}

async function makeUser(email: string, role: string, relayId: string | null) {
  const [user] = await db
    .insert(users)
    .values({ email, passwordHash: "unusable:unusable", displayName: email, role, status: "active", relayId, emailVerifiedAt: new Date() })
    .returning();
  userIds.push(user.id);
  const generated = createApiToken();
  await db.insert(apiKeys).values({ userId: user.id, name: "Leak test", prefix: generated.prefix, tokenHash: generated.tokenHash, scopes: ["*"] });
  return generated.token;
}

beforeAll(async () => {
  incumbentRelayId = await makeRelay(`incumbent-${suffix}`);
  rivalRelayId = await makeRelay(`rival-${suffix}`);

  operatorToken = await makeUser(`op-${suffix}@certifera.local`, "operator", null);
  incumbentRelayToken = await makeUser(`incumbent-${suffix}@certifera.local`, "relay", incumbentRelayId);
  rivalRelayToken = await makeUser(`rival-${suffix}@certifera.local`, "relay", rivalRelayId);

  const [workOrder] = await db
    .insert(workOrders)
    .values({
      externalRef: `leak-${suffix}`,
      title: "Commercially sensitive outcome",
      category: "Infrastructure",
      location: "Test City",
      rewardCents: 50000,
      requester: "operator/leak-test",
      status: "open",
      proofRequirements: [],
    })
    .returning();
  workOrderId = workOrder.id;

  // The incumbent's quote is the secret: its price and margin.
  await db.insert(relayBids).values({
    workOrderId,
    relayId: incumbentRelayId,
    quoteCents: 31337,
    etaMinutes: 45,
    note: "Incumbent commercially sensitive quote.",
    status: "open",
  });
});

afterAll(async () => {
  await db.delete(workOrders).where(eq(workOrders.id, workOrderId));
  if (userIds.length) await db.delete(users).where(inArray(users.id, userIds));
  await db.delete(relays).where(inArray(relays.id, [incumbentRelayId, rivalRelayId]));
});

describe("bid book confidentiality", () => {
  it("does not show a rival relay the incumbent's quote", async () => {
    const response = await getBids(new Request(`http://localhost/api/requests/${workOrderId}/bids`, withAuth(rivalRelayToken)), params(workOrderId));
    expect(response.status).toBe(200);
    const { bids } = await response.json();

    const quotes = bids.map((bid: { quoteCents: number }) => bid.quoteCents);
    expect(quotes).not.toContain(31337);
    // A relay with no bid on this outcome has no commercial position to see.
    expect(bids).toEqual([]);
  });

  it("still shows a relay its own quote", async () => {
    const response = await getBids(new Request(`http://localhost/api/requests/${workOrderId}/bids`, withAuth(incumbentRelayToken)), params(workOrderId));
    expect(response.status).toBe(200);
    const { bids } = await response.json();

    expect(bids).toHaveLength(1);
    expect(bids[0]).toMatchObject({ relayId: incumbentRelayId, quoteCents: 31337 });
  });

  it("still shows the operator the whole book, which is the point of the market", async () => {
    const response = await getBids(new Request(`http://localhost/api/requests/${workOrderId}/bids`, withAuth(operatorToken)), params(workOrderId));
    expect(response.status).toBe(200);
    const { bids } = await response.json();

    expect(bids).toHaveLength(1);
    expect(bids[0].quoteCents).toBe(31337);
  });
});

describe("activity and payout confidentiality", () => {
  beforeAll(async () => {
    // Drive the outcome to a state that has payout financials attached.
    await db.update(workOrders).set({ status: "verified", selectedRelayId: incumbentRelayId }).where(eq(workOrders.id, workOrderId));
    const [proof] = await db
      .insert(proofBundles)
      .values({ workOrderId, relayId: incumbentRelayId, observation: "Leak test proof.", attestationHash: randomUUID(), verificationScore: 90, status: "verified" })
      .returning();
    await db.insert(payouts).values({
      workOrderId,
      proofBundleId: proof.id,
      relayId: incumbentRelayId,
      grossCents: 31337,
      protocolFeeCents: 1567,
      netCents: 29770,
      status: "authorized",
    });
  });

  it("does not show a rival relay the incumbent's payout economics", async () => {
    const response = await getActivity(new Request(`http://localhost/api/requests/${workOrderId}/activity`, withAuth(rivalRelayToken)), params(workOrderId));

    // Either refuse outright or withhold the financials; both are acceptable,
    // leaking another relay's net payout is not.
    if (response.status === 200) {
      const payload = await response.json();
      expect(payload.payout).toBeNull();
    } else {
      expect(response.status).toBe(403);
    }
  });

  it("still shows the selected relay its own payout", async () => {
    const response = await getActivity(new Request(`http://localhost/api/requests/${workOrderId}/activity`, withAuth(incumbentRelayToken)), params(workOrderId));
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.payout).toMatchObject({ netCents: 29770 });
  });

  it("still shows the operator the payout", async () => {
    const response = await getActivity(new Request(`http://localhost/api/requests/${workOrderId}/activity`, withAuth(operatorToken)), params(workOrderId));
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.payout).toMatchObject({ netCents: 29770 });
  });
});
