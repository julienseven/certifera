import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/db";
import { apiKeys, auditLogs, executionEvents, payouts, pilotPartners, proofBundles, relayBids, relays, reputationEvents, users, workOrders } from "@/db/schema";
import { createApiToken } from "@/lib/auth";
import { GET as getScorecard } from "@/app/api/admin/beta-scorecard/route";
import { PATCH as reviewProof } from "@/app/api/requests/[id]/review/route";
import { eq, inArray } from "drizzle-orm";

/**
 * The scorecard's definitions, as opposed to its arithmetic.
 *
 * beta-scorecard.test.ts pins the aggregate query against a row-by-row
 * reduction, which proves the SQL computes what the JS computed but says
 * nothing about whether either one answers the question the launch gates ask.
 * These cases seed the states the lifecycle actually produces — a review the
 * operator decided inside its window, an outcome a relay abandoned, an outcome
 * reopened after a dispute, a partner who came back eleven weeks later — and
 * assert the gate numbers those states should produce.
 */

const suffix = randomUUID().slice(0, 8);
const operatorEmail = `defs-operator-${suffix}@certifera.local`;

let operatorToken: string;
let operatorUserId: string;
let relayId: string;
const orderIds: string[] = [];
const partnerIds: string[] = [];
const orderByKey = new Map<string, string>();

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

function withAuth() {
  return { headers: { authorization: `Bearer ${operatorToken}` } };
}

type Metrics = {
  totalTasks: number;
  matchedTasks: number;
  proofSubmittedTasks: number;
  resolvedReviewTasks: number;
  reviewsWithinSla: number;
  partnerCountWithTasks: number;
  repeatPartners: number;
};

async function metrics() {
  const response = await getScorecard(new Request("http://localhost/api/admin/beta-scorecard", withAuth()));
  expect(response.status).toBe(200);
  return ((await response.json()) as { metrics: Metrics }).metrics;
}

/** Seeds an outcome and remembers it for cleanup. */
async function seedOrder(key: string, values: Partial<typeof workOrders.$inferInsert>) {
  const [order] = await db
    .insert(workOrders)
    .values({
      externalRef: `defs-${suffix}-${key}`,
      title: `Definitions ${key}`,
      category: "Infrastructure",
      location: "Definition City",
      rewardCents: 12000,
      requester: `operator/${operatorEmail}`,
      status: "open",
      proofRequirements: ["Time + location attestation"],
      ...values,
    })
    .returning({ id: workOrders.id });
  orderIds.push(order.id);
  orderByKey.set(key, order.id);
  return order.id;
}

/**
 * Puts an outcome in the exact state the proof route leaves behind: awaiting a
 * decision, with a pending bundle and the winning quote still selected, so the
 * review route can be driven for real rather than simulated.
 */
async function seedAwaitingReview(key: string, reviewDueAt: Date) {
  const orderId = await seedOrder(key, { status: "review", selectedRelayId: relayId, reviewDueAt });
  await db.insert(relayBids).values({ workOrderId: orderId, relayId, quoteCents: 11000, etaMinutes: 60, status: "selected" });
  await db.insert(proofBundles).values({
    workOrderId: orderId,
    relayId,
    observation: `Bundle for ${key}`,
    attestationHash: `defs-hash-${suffix}-${key}`,
    verificationScore: 88,
    status: "pending_review",
  });
  return orderId;
}

async function approve(orderId: string) {
  const response = await reviewProof(
    new Request(`http://localhost/api/requests/${orderId}/review`, {
      method: "PATCH",
      headers: { ...withAuth().headers, "content-type": "application/json" },
      body: JSON.stringify({ decision: "approve", note: "Evidence matches the requested outcome." }),
    }),
    { params: Promise.resolve({ id: orderId }) },
  );
  expect(response.status).toBe(200);
}

beforeAll(async () => {
  const [relay] = await db
    .insert(relays)
    .values({ handle: `defs-relay-${suffix}`, zone: "Definition zone", specialty: "definitions", coverageCategories: ["Infrastructure"], onboardingStatus: "approved", active: true })
    .returning({ id: relays.id });
  relayId = relay.id;

  const [operator] = await db
    .insert(users)
    .values({ email: operatorEmail, passwordHash: "unusable:unusable", displayName: "Definitions Operator", role: "operator", status: "active", emailVerifiedAt: new Date() })
    .returning();
  operatorUserId = operator.id;
  const generated = createApiToken();
  operatorToken = generated.token;
  await db.insert(apiKeys).values({ userId: operatorUserId, name: "Definitions test", prefix: generated.prefix, tokenHash: generated.tokenHash, scopes: ["*"] });
});

afterAll(async () => {
  if (orderIds.length) {
    await db.delete(payouts).where(inArray(payouts.workOrderId, orderIds));
    await db.delete(reputationEvents).where(inArray(reputationEvents.workOrderId, orderIds));
    await db.delete(executionEvents).where(inArray(executionEvents.workOrderId, orderIds));
    await db.delete(proofBundles).where(inArray(proofBundles.workOrderId, orderIds));
    await db.delete(relayBids).where(inArray(relayBids.workOrderId, orderIds));
    await db.delete(workOrders).where(inArray(workOrders.id, orderIds));
  }
  if (partnerIds.length) await db.delete(pilotPartners).where(inArray(pilotPartners.id, partnerIds));
  await db.delete(auditLogs).where(eq(auditLogs.actorId, operatorUserId));
  await db.delete(apiKeys).where(eq(apiKeys.userId, operatorUserId));
  await db.delete(users).where(eq(users.id, operatorUserId));
  await db.delete(relays).where(eq(relays.id, relayId));
});

describe("review resolution gate", () => {
  it("credits a decision taken inside the review window", async () => {
    const orderId = await seedAwaitingReview("in-window", new Date(Date.now() + 60 * MINUTE));
    const before = await metrics();
    await approve(orderId);
    const after = await metrics();
    // The review route clears review_due_at in the same statement that records
    // the decision, so a scorecard that reads that column back sees no deadline
    // and scores every on-time review as a breach.
    expect(after.resolvedReviewTasks - before.resolvedReviewTasks).toBe(1);
    expect(after.reviewsWithinSla - before.reviewsWithinSla).toBe(1);
  });

  it("still withholds credit from a decision taken after the window closed", async () => {
    const orderId = await seedAwaitingReview("late", new Date(Date.now() - 60 * MINUTE));
    const before = await metrics();
    await approve(orderId);
    const after = await metrics();
    expect(after.resolvedReviewTasks - before.resolvedReviewTasks).toBe(1);
    expect(after.reviewsWithinSla - before.reviewsWithinSla).toBe(0);
  });
});

describe("match to proof completion gate", () => {
  it("keeps an outcome the relay abandoned in the completion denominator", async () => {
    const before = await metrics();
    // What an execution SLA breach leaves behind: back on the market, no relay,
    // no proof — the manual-rescue case the gate exists to measure. Dropping it
    // from the denominator hides the failure and lifts the rate instead.
    const orderId = await seedOrder("abandoned", { status: "open", slaStatus: "execution_breached" });
    await db.insert(executionEvents).values({ workOrderId: orderId, type: "relay_matched", actor: "operator/console", summary: "Selected a relay." });
    const after = await metrics();
    expect(after.matchedTasks - before.matchedTasks).toBe(1);
    expect(after.proofSubmittedTasks - before.proofSubmittedTasks).toBe(0);
  });

  it("cannot report more proofs than matched outcomes", async () => {
    // A disputed outcome the operator returned to the market keeps its bundle
    // but loses its matched status, so a status-based denominator counts the
    // proof without counting the match and the rate climbs past 100%.
    const orderId = await seedOrder("reopened", { status: "open", slaStatus: "reopened" });
    await db.insert(executionEvents).values({ workOrderId: orderId, type: "relay_matched", actor: "operator/console", summary: "Selected a relay." });
    await db.insert(proofBundles).values({
      workOrderId: orderId,
      relayId,
      observation: "Disputed then returned to the market",
      attestationHash: `defs-hash-${suffix}-reopened`,
      verificationScore: 40,
      status: "disputed",
      reviewedAt: new Date(),
    });
    const after = await metrics();
    expect(after.proofSubmittedTasks).toBeLessThanOrEqual(after.matchedTasks);
  });
});

describe("repeat demand gate", () => {
  async function seedPartner(key: string, orderAgesInDays: number[]) {
    const [partner] = await db
      .insert(pilotPartners)
      .values({ name: `Defs ${key} ${suffix}`, requesterAlias: `defs-${key}-${suffix}`, industry: "Utilities", city: "Definition City", primaryContactEmail: operatorEmail, taskCategory: "Infrastructure", status: "active", contractStatus: "signed" })
      .returning({ id: pilotPartners.id });
    partnerIds.push(partner.id);
    for (const [index, age] of orderAgesInDays.entries()) {
      await seedOrder(`${key}-${index}`, { pilotPartnerId: partner.id, createdAt: new Date(Date.now() - age * DAY) });
    }
    return partner.id;
  }

  it("does not count a partner who returned eleven weeks later as repeat demand", async () => {
    const before = await metrics();
    await seedPartner("lapsed", [100, 5]);
    const after = await metrics();
    // The gate reads "a second paid request within 30 days"; 95 days apart is
    // the churn case, not the retention case.
    expect(after.partnerCountWithTasks - before.partnerCountWithTasks).toBe(1);
    expect(after.repeatPartners - before.repeatPartners).toBe(0);
  });

  it("counts a partner who returned inside the window as repeat demand", async () => {
    const before = await metrics();
    await seedPartner("returning", [60, 55]);
    const after = await metrics();
    expect(after.partnerCountWithTasks - before.partnerCountWithTasks).toBe(1);
    expect(after.repeatPartners - before.repeatPartners).toBe(1);
  });

  it("leaves a partner whose first 30 days have not elapsed out of the rate", async () => {
    const before = await metrics();
    await seedPartner("fresh", [1]);
    const after = await metrics();
    // Counting them as a non-repeat scores an unanswerable question as a
    // failure, which drags a ramping pilot below the gate on arithmetic alone.
    expect(after.partnerCountWithTasks - before.partnerCountWithTasks).toBe(0);
    expect(after.repeatPartners - before.repeatPartners).toBe(0);
  });
});
