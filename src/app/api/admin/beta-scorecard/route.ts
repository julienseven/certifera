import { db } from "@/db";
import { operationalEvents, partnerCheckins, proofBundles, relayBids, workOrders } from "@/db/schema";
import { requireIdentity } from "@/lib/auth";
import { evaluateLaunchGates } from "@/lib/beta";
import { getProductionReadiness } from "@/lib/readiness";
import { and, count, eq, isNull } from "drizzle-orm";

function median(values: number[]) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : Math.round((sorted[middle - 1] + sorted[middle]) / 2);
}

export async function GET(request: Request) {
  const auth = await requireIdentity(request, { roles: ["admin", "operator"] });
  if (!auth.identity) return auth.response;
  const [orders, bids, proofs, checkins, critical, readiness] = await Promise.all([
    db.select({ id: workOrders.id, status: workOrders.status, createdAt: workOrders.createdAt, pilotPartnerId: workOrders.pilotPartnerId, reviewDueAt: workOrders.reviewDueAt }).from(workOrders),
    db.select({ workOrderId: relayBids.workOrderId, createdAt: relayBids.createdAt }).from(relayBids),
    db.select({ workOrderId: proofBundles.workOrderId, status: proofBundles.status, createdAt: proofBundles.createdAt, reviewedAt: proofBundles.reviewedAt }).from(proofBundles),
    db.select({ satisfaction: partnerCheckins.satisfaction }).from(partnerCheckins),
    db.select({ total: count() }).from(operationalEvents).where(and(eq(operationalEvents.level, "critical"), isNull(operationalEvents.resolvedAt))),
    getProductionReadiness(),
  ]);

  const bidsByOrder = new Map<string, Date[]>();
  for (const bid of bids) bidsByOrder.set(bid.workOrderId, [...(bidsByOrder.get(bid.workOrderId) || []), bid.createdAt]);
  const proofsByOrder = new Map<string, typeof proofs[number]>();
  for (const proof of proofs) {
    const existing = proofsByOrder.get(proof.workOrderId);
    if (!existing || proof.createdAt > existing.createdAt) proofsByOrder.set(proof.workOrderId, proof);
  }
  const matchedStatuses = new Set(["matched", "review", "disputed", "verified"]);
  const matchedTasks = orders.filter((order) => matchedStatuses.has(order.status));
  const firstBidMinutes = orders.flatMap((order) => {
    const first = bidsByOrder.get(order.id)?.sort((a, b) => a.getTime() - b.getTime())[0];
    return first ? [Math.max(0, Math.round((first.getTime() - order.createdAt.getTime()) / 60_000))] : [];
  });
  const resolvedProofs = [...proofsByOrder.entries()].filter(([, proof]) => proof.status === "verified" || proof.status === "disputed");
  const reviewOnTime = resolvedProofs.filter(([orderId, proof]) => {
    const order = orders.find((candidate) => candidate.id === orderId);
    return Boolean(proof.reviewedAt && order?.reviewDueAt && proof.reviewedAt <= order.reviewDueAt);
  });
  const partnersWithTaskCounts = new Map<string, number>();
  for (const order of orders) if (order.pilotPartnerId) partnersWithTaskCounts.set(order.pilotPartnerId, (partnersWithTaskCounts.get(order.pilotPartnerId) || 0) + 1);
  const satisfactionValues = checkins.map((checkin) => checkin.satisfaction).filter((value): value is number => typeof value === "number");
  const metrics = {
    totalTasks: orders.length,
    matchedTasks: matchedTasks.length,
    proofSubmittedTasks: proofsByOrder.size,
    resolvedReviewTasks: resolvedProofs.length,
    reviewsWithinSla: reviewOnTime.length,
    competitiveBidTasks: [...bidsByOrder.values()].filter((items) => items.length >= 2).length,
    partnerCountWithTasks: partnersWithTaskCounts.size,
    repeatPartners: [...partnersWithTaskCounts.values()].filter((total) => total >= 2).length,
    feedbackCount: satisfactionValues.length,
    averageSatisfaction: satisfactionValues.length ? satisfactionValues.reduce((sum, value) => sum + value, 0) / satisfactionValues.length : null,
    medianFirstBidMinutes: median(firstBidMinutes),
    unresolvedCriticalAlerts: critical[0]?.total ?? 0,
  };
  return Response.json({ metrics, readiness, gates: evaluateLaunchGates(metrics, readiness.ready) });
}
