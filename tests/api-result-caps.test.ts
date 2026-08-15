import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/db";
import { apiKeys, executionEvents, pilotCohorts, relays, users, workOrders } from "@/db/schema";
import { createApiToken } from "@/lib/auth";
import { resolveLimit } from "@/app/api/_pagination";
import { eq, inArray } from "drizzle-orm";

import { GET as getActivity } from "@/app/api/requests/[id]/activity/route";
import { GET as getCohorts } from "@/app/api/admin/cohorts/route";
import { GET as getRequests } from "@/app/api/requests/route";

/**
 * Guards the list caps. Every assertion here fails against an unbounded select:
 * the row counts are chosen so that "no LIMIT" and "LIMIT n" give different
 * answers, and the cursor cases are built on rows that share a created_at so a
 * timestamp-only cursor visibly drops or repeats them.
 */

const suffix = randomUUID().slice(0, 8);
const relayHandle = `caps-relay-${suffix}`;
const operatorEmail = `caps-operator-${suffix}@certifera.local`;

// The activity route defaults to 100 events and clamps ?limit= to 500, so the
// ledger has to hold more than 500 rows for either bound to be observable.
const EVENT_COUNT = 520;
const TIED_EVENTS = 6;

let relayId: string;
let operatorUserId: string;
let operatorToken: string;
let workOrderId: string;
let tiedEventIds: string[] = [];
let verifiedWorkOrderId: string;
let cohortId: string;
const feedWorkOrderIds: string[] = [];
const cohortWorkOrderIds: string[] = [];

function withAuth(init: RequestInit = {}) {
  return { ...init, headers: { authorization: `Bearer ${operatorToken}`, ...(init.headers || {}) } };
}
function params(id: string) {
  return { params: Promise.resolve({ id }) };
}
async function activity(query = "") {
  const response = await getActivity(new Request(`http://localhost/api/requests/${workOrderId}/activity${query}`, withAuth()), params(workOrderId));
  return { status: response.status, payload: await response.json() };
}

beforeAll(async () => {
  const [relay] = await db
    .insert(relays)
    .values({ handle: relayHandle, zone: "Cap zone", specialty: "cap test", coverageCategories: ["Infrastructure"], onboardingStatus: "approved", active: true })
    .returning();
  relayId = relay.id;

  const [operator] = await db
    .insert(users)
    .values({ email: operatorEmail, passwordHash: "unusable:unusable", displayName: "Caps Operator", role: "operator", status: "active", emailVerifiedAt: new Date() })
    .returning();
  operatorUserId = operator.id;

  const generated = createApiToken();
  operatorToken = generated.token;
  await db.insert(apiKeys).values({ userId: operatorUserId, name: "Caps test", prefix: generated.prefix, tokenHash: generated.tokenHash, scopes: ["requests:read", "requests:write"] });

  const [order] = await db
    .insert(workOrders)
    .values({ externalRef: `caps-${suffix}`, title: "Cap probe outcome", category: "Infrastructure", location: "Cap City", rewardCents: 10000, requester: `operator/${operatorEmail}`, status: "open", proofRequirements: ["Time + location attestation"] })
    .returning();
  workOrderId = order.id;

  /*
   * The newest TIED_EVENTS rows share one created_at on purpose. That is what a
   * real transaction produces: recordLifecycleEvent fires more than once per
   * decision and defaultNow() is the transaction timestamp, so these rows are
   * indistinguishable to a cursor that only carries a timestamp.
   */
  const newest = new Date("2030-01-01T00:00:00.000Z");
  const inserted = await db
    .insert(executionEvents)
    .values(Array.from({ length: EVENT_COUNT }, (_, index) => ({
      workOrderId,
      type: "cap_probe",
      actor: "test/harness",
      summary: `Cap probe event ${index}`,
      createdAt: index < TIED_EVENTS ? newest : new Date(newest.getTime() - (index + 1) * 1000),
    })))
    .returning({ id: executionEvents.id, createdAt: executionEvents.createdAt });
  tiedEventIds = inserted.filter((event) => event.createdAt.getTime() === newest.getTime()).map((event) => event.id);

  // Dated ahead of every other row so the feed assertions do not depend on what
  // else the shared test database holds.
  const feedCreatedAt = new Date(Date.now() + 60 * 60 * 1000);
  const feedRows = await db
    .insert(workOrders)
    .values(Array.from({ length: 3 }, (_, index) => ({
      externalRef: `caps-feed-${suffix}-${index}`,
      title: `Cap feed outcome ${index}`,
      category: "Infrastructure",
      location: "Cap City",
      rewardCents: 10000,
      requester: `operator/${operatorEmail}`,
      status: "open",
      proofRequirements: ["Time + location attestation"],
      createdAt: feedCreatedAt,
    })))
    .returning({ id: workOrders.id });
  feedWorkOrderIds.push(...feedRows.map((row) => row.id));

  // Sorts just behind the three tied rows, so the status assertions have a row
  // the filter must exclude rather than depending on what else the database has.
  const [verified] = await db
    .insert(workOrders)
    .values({
      externalRef: `caps-feed-${suffix}-verified`,
      title: "Cap feed settled outcome",
      category: "Infrastructure",
      location: "Cap City",
      rewardCents: 10000,
      requester: `operator/${operatorEmail}`,
      status: "verified",
      proofRequirements: ["Time + location attestation"],
      createdAt: new Date(feedCreatedAt.getTime() - 1000),
    })
    .returning({ id: workOrders.id });
  verifiedWorkOrderId = verified.id;

  const [cohort] = await db
    .insert(pilotCohorts)
    .values({ name: `Caps cohort ${suffix}`, city: "Cap City", taskCategory: "Infrastructure", ownerUserId: operatorUserId })
    .returning({ id: pilotCohorts.id });
  cohortId = cohort.id;
  const cohortRows = await db
    .insert(workOrders)
    .values(["open", "matched", "review", "verified"].map((status, index) => ({
      externalRef: `caps-cohort-${suffix}-${index}`,
      title: `Cap cohort outcome ${index}`,
      category: "Infrastructure",
      location: "Cap City",
      rewardCents: 10000,
      requester: `operator/${operatorEmail}`,
      pilotCohortId: cohort.id,
      status,
      proofRequirements: ["Time + location attestation"],
    })))
    .returning({ id: workOrders.id });
  cohortWorkOrderIds.push(...cohortRows.map((row) => row.id));
});

afterAll(async () => {
  await db.delete(workOrders).where(inArray(workOrders.id, [workOrderId, verifiedWorkOrderId, ...feedWorkOrderIds, ...cohortWorkOrderIds]));
  await db.delete(pilotCohorts).where(eq(pilotCohorts.id, cohortId));
  await db.delete(users).where(eq(users.id, operatorUserId));
  await db.delete(relays).where(eq(relays.id, relayId));
});

describe("resolveLimit", () => {
  const request = (query: string) => new Request(`http://localhost/api/probe${query}`);

  it("falls back when no limit is supplied", () => {
    expect(resolveLimit(request(""), 100, 500)).toBe(100);
  });

  it("clamps an oversized caller limit to the ceiling instead of trusting it", () => {
    expect(resolveLimit(request("?limit=100000"), 100, 500)).toBe(500);
  });

  it("floors a caller limit at one row", () => {
    expect(resolveLimit(request("?limit=-40"), 100, 500)).toBe(1);
    expect(resolveLimit(request("?limit=0"), 100, 500)).toBe(1);
  });

  it("ignores junk rather than producing NaN", () => {
    expect(resolveLimit(request("?limit=abc"), 100, 500)).toBe(100);
    expect(resolveLimit(request("?limit="), 100, 500)).toBe(100);
  });

  it("honours a caller limit inside the range", () => {
    expect(resolveLimit(request("?limit=7"), 100, 500)).toBe(7);
    expect(resolveLimit(request("?limit=7.9"), 100, 500)).toBe(7);
  });
});

describe("the execution ledger is bounded", () => {
  it("truncates a large ledger to the default page instead of returning all of it", async () => {
    const { status, payload } = await activity();
    expect(status).toBe(200);
    expect(payload.events).toHaveLength(100);
    expect(payload.events.length).toBeLessThan(EVENT_COUNT);
    expect(payload.nextCursor).toEqual(expect.any(String));
  });

  it("clamps a caller-supplied limit to the ceiling", async () => {
    const { payload } = await activity("?limit=100000");
    expect(payload.events).toHaveLength(500);
  });

  it("honours a smaller caller-supplied limit", async () => {
    const { payload } = await activity("?limit=7");
    expect(payload.events).toHaveLength(7);
  });

  it("falls back to the default page for a junk limit", async () => {
    const { payload } = await activity("?limit=not-a-number");
    expect(payload.events).toHaveLength(100);
  });

  it("stops issuing a cursor once the last page is short", async () => {
    const first = await activity("?limit=500");
    expect(first.payload.events).toHaveLength(500);
    const last = await activity(`?limit=500&cursor=${encodeURIComponent(first.payload.nextCursor)}`);
    expect(last.payload.events).toHaveLength(EVENT_COUNT - 500);
    expect(last.payload.nextCursor).toBeNull();
  });

  it("rejects a cursor it did not issue", async () => {
    const { status } = await activity("?cursor=not-a-cursor");
    expect(status).toBe(400);
  });

  it("pages across rows that share a created_at without dropping or repeating any", async () => {
    const seen: string[] = [];
    let cursor: string | null = null;
    for (let page = 0; page < TIED_EVENTS / 2; page += 1) {
      const { payload } = await activity(`?limit=2${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`);
      seen.push(...payload.events.map((event: { id: string }) => event.id));
      cursor = payload.nextCursor;
    }
    expect(new Set(seen).size).toBe(TIED_EVENTS);
    expect([...seen].sort()).toEqual([...tiedEventIds].sort());
  });
});

describe("the request feed is bounded", () => {
  async function feed(query: string) {
    const response = await getRequests(new Request(`http://localhost/api/requests${query}`, withAuth()));
    expect(response.status).toBe(200);
    return response.json();
  }

  it("returns only the requested page, not the whole table", async () => {
    const payload = await feed("?limit=2");
    expect(payload.requests).toHaveLength(2);
    expect(payload.nextCursor).toEqual(expect.any(String));
  });

  it("pages across requests that share a created_at without dropping any", async () => {
    const seen: string[] = [];
    let cursor: string | null = null;
    for (let page = 0; page < 2; page += 1) {
      const payload = await feed(`?limit=2${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`);
      seen.push(...payload.requests.map((row: { id: string }) => row.id));
      cursor = payload.nextCursor;
    }
    expect(seen.slice(0, feedWorkOrderIds.length).sort()).toEqual([...feedWorkOrderIds].sort());
  });

  it("filters by status so the query can use the status index", async () => {
    const verified = await feed("?limit=10&status=verified");
    expect(verified.requests.map((row: { id: string }) => row.id)).toContain(verifiedWorkOrderId);
    expect(verified.requests.every((row: { status: string }) => row.status === "verified")).toBe(true);

    const open = await feed("?limit=10&status=open");
    expect(open.requests.map((row: { id: string }) => row.id)).not.toContain(verifiedWorkOrderId);
  });
});

describe("cohort task metrics", () => {
  it("rolls up in SQL to the same totals the per-row scan produced", async () => {
    const response = await getCohorts(new Request("http://localhost/api/admin/cohorts", withAuth()));
    expect(response.status).toBe(200);
    const payload = await response.json();
    const cohort = payload.cohorts.find((row: { id: string }) => row.id === cohortId);
    expect(cohort.metrics).toEqual({ tasks: 4, open: 1, inFlight: 2, settled: 1, rewardCents: 40000 });
  });
});
