import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/db";
import { apiKeys, relays, users, workOrders } from "@/db/schema";
import { createApiToken } from "@/lib/auth";
import { eq, inArray } from "drizzle-orm";

import { GET as listRequests } from "@/app/api/requests/route";

/**
 * Probe: does the outcome *list* leak what the per-outcome routes now protect?
 *
 * The bid book and activity feed were tightened to a per-outcome stake test,
 * but GET /api/requests is a separate query that returns every outcome to any
 * authenticated caller. Two of its columns are not market-public:
 *
 *  - disputeReason is a free-text operator note written when a proof is
 *    rejected, about a *different* relay's work.
 *  - requester identifies the buyer, which on partner-funded work is the
 *    partner alias.
 *
 * A relay needs to see open outcomes to bid, so the feed itself is not the
 * problem; carrying another relay's dispute writeup on every row is.
 */

const suffix = randomUUID().slice(0, 8);
let incumbentRelayId: string;
let rivalRelayToken: string;
let operatorToken: string;
let workOrderId: string;
const userIds: string[] = [];
const relayIds: string[] = [];

const DISPUTE_NOTE = "Incumbent relay submitted a doctored inverter photograph.";

function withAuth(token: string) {
  return { headers: { authorization: `Bearer ${token}` } };
}

async function makeUser(email: string, role: string, relayId: string | null) {
  const [user] = await db
    .insert(users)
    .values({ email, passwordHash: "unusable:unusable", displayName: email, role, status: "active", relayId, emailVerifiedAt: new Date() })
    .returning();
  userIds.push(user.id);
  const generated = createApiToken();
  await db.insert(apiKeys).values({ userId: user.id, name: "Feed leak test", prefix: generated.prefix, tokenHash: generated.tokenHash, scopes: ["*"] });
  return generated.token;
}

beforeAll(async () => {
  for (const handle of [`feed-incumbent-${suffix}`, `feed-rival-${suffix}`]) {
    const [relay] = await db
      .insert(relays)
      .values({ handle, zone: "Test zone", specialty: "feed leak", coverageCategories: ["Infrastructure"], active: true })
      .returning();
    relayIds.push(relay.id);
  }
  incumbentRelayId = relayIds[0];

  operatorToken = await makeUser(`feed-op-${suffix}@certifera.local`, "operator", null);
  rivalRelayToken = await makeUser(`feed-rival-${suffix}@certifera.local`, "relay", relayIds[1]);

  const [workOrder] = await db
    .insert(workOrders)
    .values({
      externalRef: `feed-${suffix}`,
      title: "Disputed outcome",
      category: "Infrastructure",
      location: "Test City",
      rewardCents: 50000,
      requester: "partner/confidential-buyer-alias",
      status: "disputed",
      proofRequirements: [],
      selectedRelayId: incumbentRelayId,
      disputeReason: DISPUTE_NOTE,
    })
    .returning();
  workOrderId = workOrder.id;
});

afterAll(async () => {
  await db.delete(workOrders).where(eq(workOrders.id, workOrderId));
  if (userIds.length) await db.delete(users).where(inArray(users.id, userIds));
  if (relayIds.length) await db.delete(relays).where(inArray(relays.id, relayIds));
});

async function feedRowFor(token: string) {
  const response = await listRequests(new Request("http://localhost/api/requests", withAuth(token)));
  expect(response.status).toBe(200);
  const { requests } = await response.json();
  return requests.find((row: { id: string }) => row.id === workOrderId);
}

describe("outcome feed confidentiality", () => {
  it("does not hand a rival relay another relay's dispute writeup", async () => {
    const row = await feedRowFor(rivalRelayToken);
    expect(row).toBeDefined();
    // The outcome itself is visible; the operator's note about someone else's
    // work is not.
    expect(row.disputeReason).toBeNull();
  });

  it("withholds the buyer alias from a relay that does not own the outcome", async () => {
    const row = await feedRowFor(rivalRelayToken);
    expect(row.requester).toBeNull();
    // Withheld, not removed: the console reads these keys, and a missing key
    // and a null read differently at a call site.
    expect(row).toHaveProperty("requester");
    expect(row).toHaveProperty("disputeReason");
  });

  it("still returns the fields a relay needs in order to bid", async () => {
    const row = await feedRowFor(rivalRelayToken);
    expect(row).toMatchObject({
      id: workOrderId,
      title: "Disputed outcome",
      category: "Infrastructure",
      location: "Test City",
      rewardCents: 50000,
    });
  });

  it("still gives the operator the full record", async () => {
    const row = await feedRowFor(operatorToken);
    expect(row.disputeReason).toBe(DISPUTE_NOTE);
    expect(row.requester).toBe("partner/confidential-buyer-alias");
  });

  it("still gives the selected relay its own dispute reason", async () => {
    // The relay being disputed needs to know why in order to respond.
    const incumbentToken = await makeUser(`feed-incumbent-${suffix}@certifera.local`, "relay", incumbentRelayId);
    const row = await feedRowFor(incumbentToken);
    expect(row.disputeReason).toBe(DISPUTE_NOTE);
  });
});
