import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/db";
import { apiKeys, operationalEvents, partnerCheckins, pilotPartners, proofBundles, relayBids, relays, users, workOrders } from "@/db/schema";
import { createApiToken } from "@/lib/auth";
import { GET as getScorecard } from "@/app/api/admin/beta-scorecard/route";
import { desc, eq, inArray, isNull, and, count } from "drizzle-orm";

/**
 * Pins the scorecard's SQL rewrite against the per-row reduction it replaced.
 *
 * The route now computes every metric in one aggregate query over the full
 * tables, where it used to pull four LIMIT 5000 slices and reduce them in JS.
 * The reference implementation below is that original reduction, run over
 * every row rather than a slice, so any divergence between what Postgres
 * computes and what the route used to report shows up as a failed equality —
 * including the cases the SQL has to get right on its own: the latest proof per
 * outcome, the first bid per outcome, an even-length median, and outcomes with
 * no proof or no bid at all.
 *
 * Seeded rows deliberately include a re-submitted proof (two bundles on one
 * outcome, only the newest counting), an outcome reviewed after its due date,
 * an outcome with a single bid, and a partner with two tasks.
 */

const suffix = randomUUID().slice(0, 8);
const operatorEmail = `score-operator-${suffix}@certifera.local`;

let operatorToken: string;
let operatorUserId: string;
// relay_bids is unique on (work_order_id, relay_id): competitive bids have to
// come from different relays, exactly as they would in production.
let relayId: string;
let secondRelayId: string;
let partnerId: string;
const seededOrderIds: string[] = [];

function withAuth() {
  return { headers: { authorization: `Bearer ${operatorToken}` } };
}

/** The pre-rewrite JS reduction, over every row instead of a 5000-row slice. */
async function referenceMetrics() {
  const [orders, bids, proofs, checkins, critical] = await Promise.all([
    db.select({ id: workOrders.id, status: workOrders.status, createdAt: workOrders.createdAt, pilotPartnerId: workOrders.pilotPartnerId, reviewDueAt: workOrders.reviewDueAt }).from(workOrders).orderBy(desc(workOrders.createdAt)),
    db.select({ workOrderId: relayBids.workOrderId, createdAt: relayBids.createdAt }).from(relayBids).orderBy(desc(relayBids.createdAt)),
    db.select({ workOrderId: proofBundles.workOrderId, status: proofBundles.status, createdAt: proofBundles.createdAt, reviewedAt: proofBundles.reviewedAt }).from(proofBundles).orderBy(desc(proofBundles.createdAt)),
    db.select({ satisfaction: partnerCheckins.satisfaction }).from(partnerCheckins),
    db.select({ total: count() }).from(operationalEvents).where(and(eq(operationalEvents.level, "critical"), isNull(operationalEvents.resolvedAt))),
  ]);

  const bidsByOrder = new Map<string, Date[]>();
  for (const bid of bids) bidsByOrder.set(bid.workOrderId, [...(bidsByOrder.get(bid.workOrderId) || []), bid.createdAt]);
  const proofsByOrder = new Map<string, typeof proofs[number]>();
  for (const proof of proofs) {
    const existing = proofsByOrder.get(proof.workOrderId);
    if (!existing || proof.createdAt > existing.createdAt) proofsByOrder.set(proof.workOrderId, proof);
  }
  const ordersById = new Map(orders.map((order) => [order.id, order]));
  const matchedStatuses = new Set(["matched", "review", "disputed", "verified"]);
  const firstBidMinutes = orders.flatMap((order) => {
    const first = bidsByOrder.get(order.id)?.sort((a, b) => a.getTime() - b.getTime())[0];
    return first ? [Math.max(0, Math.round((first.getTime() - order.createdAt.getTime()) / 60_000))] : [];
  });
  const resolvedProofs = [...proofsByOrder.entries()].filter(([, proof]) => proof.status === "verified" || proof.status === "disputed");
  const reviewOnTime = resolvedProofs.filter(([orderId, proof]) => {
    const order = ordersById.get(orderId);
    return Boolean(proof.reviewedAt && order?.reviewDueAt && proof.reviewedAt <= order.reviewDueAt);
  });
  const partnersWithTaskCounts = new Map<string, number>();
  for (const order of orders) if (order.pilotPartnerId) partnersWithTaskCounts.set(order.pilotPartnerId, (partnersWithTaskCounts.get(order.pilotPartnerId) || 0) + 1);
  const satisfactionValues = checkins.map((checkin) => checkin.satisfaction).filter((value): value is number => typeof value === "number");
  const sorted = [...firstBidMinutes].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return {
    totalTasks: orders.length,
    matchedTasks: orders.filter((order) => matchedStatuses.has(order.status)).length,
    proofSubmittedTasks: proofsByOrder.size,
    resolvedReviewTasks: resolvedProofs.length,
    reviewsWithinSla: reviewOnTime.length,
    competitiveBidTasks: [...bidsByOrder.values()].filter((items) => items.length >= 2).length,
    partnerCountWithTasks: partnersWithTaskCounts.size,
    repeatPartners: [...partnersWithTaskCounts.values()].filter((total) => total >= 2).length,
    feedbackCount: satisfactionValues.length,
    averageSatisfaction: satisfactionValues.length ? satisfactionValues.reduce((sum, value) => sum + value, 0) / satisfactionValues.length : null,
    medianFirstBidMinutes: sorted.length === 0 ? null : sorted.length % 2 ? sorted[middle] : Math.round((sorted[middle - 1] + sorted[middle]) / 2),
    unresolvedCriticalAlerts: critical[0]?.total ?? 0,
  };
}

async function scorecard() {
  const response = await getScorecard(new Request("http://localhost/api/admin/beta-scorecard", withAuth()));
  expect(response.status).toBe(200);
  return (await response.json()) as { metrics: Record<string, number | null>; sampled: boolean };
}

const base = new Date("2031-03-01T00:00:00.000Z");
function at(minutes: number) {
  return new Date(base.getTime() + minutes * 60_000);
}

beforeAll(async () => {
  const seededRelays = await db
    .insert(relays)
    .values([0, 1].map((index) => ({ handle: `score-relay-${suffix}-${index}`, zone: "Score zone", specialty: "scorecard test", coverageCategories: ["Infrastructure"], onboardingStatus: "approved", active: true })))
    .returning({ id: relays.id });
  [relayId, secondRelayId] = seededRelays.map((relay) => relay.id);

  const [operator] = await db
    .insert(users)
    .values({ email: operatorEmail, passwordHash: "unusable:unusable", displayName: "Score Operator", role: "operator", status: "active", emailVerifiedAt: new Date() })
    .returning();
  operatorUserId = operator.id;
  const generated = createApiToken();
  operatorToken = generated.token;
  await db.insert(apiKeys).values({ userId: operatorUserId, name: "Scorecard test", prefix: generated.prefix, tokenHash: generated.tokenHash, scopes: ["*"] });

  const [partner] = await db
    .insert(pilotPartners)
    .values({ name: `Score Partner ${suffix}`, requesterAlias: `score-partner-${suffix}`, industry: "Utilities", city: "Score City", primaryContactEmail: operatorEmail, taskCategory: "Infrastructure", status: "active", contractStatus: "signed" })
    .returning();
  partnerId = partner.id;

  // Four outcomes: two for the repeat partner, one unpartnered, one with no bid
  // and no proof so the left joins have to survive a null on both sides.
  const orderSpecs = [
    { key: "resubmitted", status: "verified", partner: true, reviewDueAt: at(600) },
    { key: "late-review", status: "disputed", partner: true, reviewDueAt: at(10) },
    { key: "single-bid", status: "matched", partner: false, reviewDueAt: at(600) },
    { key: "untouched", status: "open", partner: false, reviewDueAt: null as Date | null },
  ];
  const orders = await db
    .insert(workOrders)
    .values(orderSpecs.map((spec) => ({
      externalRef: `score-${suffix}-${spec.key}`,
      title: `Scorecard ${spec.key}`,
      category: "Infrastructure",
      location: "Score City",
      rewardCents: 10000,
      requester: `operator/${operatorEmail}`,
      status: spec.status,
      pilotPartnerId: spec.partner ? partnerId : null,
      reviewDueAt: spec.reviewDueAt,
      proofRequirements: ["Time + location attestation"],
      createdAt: base,
    })))
    .returning({ id: workOrders.id, externalRef: workOrders.externalRef });
  seededOrderIds.push(...orders.map((order) => order.id));
  const byKey = (key: string) => orders.find((order) => order.externalRef === `score-${suffix}-${key}`)!.id;

  // Two bids on two outcomes (competitive), one on the third, none on the last.
  await db.insert(relayBids).values([
    { workOrderId: byKey("resubmitted"), relayId, quoteCents: 9000, etaMinutes: 60, createdAt: at(30) },
    { workOrderId: byKey("resubmitted"), relayId: secondRelayId, quoteCents: 8500, etaMinutes: 45, createdAt: at(90) },
    { workOrderId: byKey("late-review"), relayId, quoteCents: 9000, etaMinutes: 60, createdAt: at(10) },
    { workOrderId: byKey("late-review"), relayId: secondRelayId, quoteCents: 8000, etaMinutes: 30, createdAt: at(50) },
    { workOrderId: byKey("single-bid"), relayId, quoteCents: 9500, etaMinutes: 90, createdAt: at(70) },
  ]);

  // The resubmitted outcome carries two bundles; only the newest may count, and
  // the older one was reviewed inside the 600-minute window and the newest was
  // not, so a route that reads the wrong bundle changes reviewsWithinSla.
  await db.insert(proofBundles).values([
    { workOrderId: byKey("resubmitted"), relayId, observation: "First attempt", attestationHash: `hash-${suffix}-1`, verificationScore: 70, status: "verified", reviewedAt: at(120), createdAt: at(100) },
    { workOrderId: byKey("resubmitted"), relayId, observation: "Second attempt", attestationHash: `hash-${suffix}-2`, verificationScore: 90, status: "verified", reviewedAt: at(700), createdAt: at(200) },
    { workOrderId: byKey("late-review"), relayId, observation: "Disputed attempt", attestationHash: `hash-${suffix}-3`, verificationScore: 40, status: "disputed", reviewedAt: at(400), createdAt: at(150) },
    { workOrderId: byKey("single-bid"), relayId, observation: "Awaiting review", attestationHash: `hash-${suffix}-4`, verificationScore: 80, status: "pending_review", createdAt: at(160) },
  ]);

  await db.insert(partnerCheckins).values([
    { partnerId, ownerUserId: operatorUserId, satisfaction: 5, feedback: "Strong", riskLevel: "low" },
    { partnerId, ownerUserId: operatorUserId, satisfaction: 3, feedback: "Mixed", riskLevel: "medium" },
    { partnerId, ownerUserId: operatorUserId, satisfaction: null, feedback: "No score given", riskLevel: "low" },
  ]);
});

afterAll(async () => {
  await db.delete(partnerCheckins).where(eq(partnerCheckins.partnerId, partnerId));
  if (seededOrderIds.length) {
    await db.delete(proofBundles).where(inArray(proofBundles.workOrderId, seededOrderIds));
    await db.delete(relayBids).where(inArray(relayBids.workOrderId, seededOrderIds));
    await db.delete(workOrders).where(inArray(workOrders.id, seededOrderIds));
  }
  await db.delete(pilotPartners).where(eq(pilotPartners.id, partnerId));
  await db.delete(apiKeys).where(eq(apiKeys.userId, operatorUserId));
  await db.delete(users).where(eq(users.id, operatorUserId));
  await db.delete(relays).where(inArray(relays.id, [relayId, secondRelayId]));
});

describe("beta scorecard aggregate", () => {
  it("matches the per-row reduction it replaced", async () => {
    const [payload, reference] = await Promise.all([scorecard(), referenceMetrics()]);
    expect(payload.metrics).toEqual(reference);
  });

  it("no longer reports itself as sampled", async () => {
    const payload = await scorecard();
    expect(payload.sampled).toBe(false);
  });

  it("counts only the newest proof bundle per outcome", async () => {
    const payload = await scorecard();
    // Three of the four seeded outcomes carry a bundle, and the resubmitted one
    // has two: a per-bundle count would report four proofs for three outcomes.
    const reference = await referenceMetrics();
    expect(payload.metrics.proofSubmittedTasks).toBe(reference.proofSubmittedTasks);
    const bundles = await db.select({ id: proofBundles.id }).from(proofBundles).where(inArray(proofBundles.workOrderId, seededOrderIds));
    expect(bundles.length).toBeGreaterThan(reference.proofSubmittedTasks);
  });

  it("reads the whole table rather than a fixed sample", async () => {
    const before = (await scorecard()).metrics.totalTasks as number;
    const [extra] = await db
      .insert(workOrders)
      .values({ externalRef: `score-${suffix}-extra`, title: "Scorecard extra", category: "Infrastructure", location: "Score City", rewardCents: 10000, requester: `operator/${operatorEmail}`, status: "open", proofRequirements: ["Time + location attestation"], createdAt: new Date(base.getTime() - 86_400_000) })
      .returning({ id: workOrders.id });
    seededOrderIds.push(extra.id);
    expect((await scorecard()).metrics.totalTasks).toBe(before + 1);
  });
});
