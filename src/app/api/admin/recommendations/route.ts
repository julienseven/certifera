import { db } from "@/db";
import { evidenceAssets, payouts } from "@/db/schema";
import { requireIdentity } from "@/lib/auth";
import { getBetaMetrics } from "@/lib/beta";
import { getProductionReadiness } from "@/lib/readiness";
import { and, count, eq, lt } from "drizzle-orm";

export async function GET(request: Request) {
  const auth = await requireIdentity(request, { roles: ["admin", "operator"] });
  if (!auth.identity) return auth.response;
  const [metrics, lowSignal, failedPayouts, readiness] = await Promise.all([
    getBetaMetrics(),
    db.select({ total: count() }).from(evidenceAssets).where(and(eq(evidenceAssets.scanStatus, "validated"), lt(evidenceAssets.intelligenceScore, 70))),
    db.select({ total: count() }).from(payouts).where(eq(payouts.status, "failed")),
    getProductionReadiness(),
  ]);
  const recommendations: { priority: "now" | "next" | "later"; title: string; rationale: string; action: string }[] = [];
  if (!readiness.ready) recommendations.push({ priority: "now", title: "Finish deployment readiness", rationale: "Operational safeguards are incomplete, which blocks a trustworthy cohort launch.", action: "Resolve blocked checks in Pilot Command before increasing task volume." });
  if (metrics.unresolvedCriticalAlerts > 0) recommendations.push({ priority: "now", title: "Resolve critical operations alerts", rationale: `${metrics.unresolvedCriticalAlerts} critical alert(s) remain unresolved.`, action: "Use Operations Center to investigate, reconcile, and resolve before new paid work." });
  if (metrics.totalTasks < 25) recommendations.push({ priority: "now", title: "Run the first 25 task attempts", rationale: "There is not enough cohort evidence to interpret marketplace quality or economics.", action: "Use Cohort Command task templates to execute a narrow city/category sample." });
  const bidDensity = metrics.totalTasks ? metrics.competitiveBidTasks / metrics.totalTasks : 0;
  if (metrics.totalTasks >= 10 && bidDensity < 0.7) recommendations.push({ priority: "next", title: "Increase relay coverage and dispatch signals", rationale: `Only ${Math.round(bidDensity * 100)}% of requests have competitive bid density.`, action: "Onboard available relays, require heartbeat updates, and use dispatch preflight before funding tasks." });
  const reviewSla = metrics.resolvedReviewTasks ? metrics.reviewsWithinSla / metrics.resolvedReviewTasks : 0;
  if (metrics.resolvedReviewTasks >= 5 && reviewSla < 0.95) recommendations.push({ priority: "next", title: "Triage the review queue", rationale: `Review SLA is ${Math.round(reviewSla * 100)}%, below the 95% gate.`, action: "Create reviewer coverage blocks and use evidence signals to prioritize low-risk review lanes." });
  const repeatDemand = metrics.partnerCountWithTasks ? metrics.repeatPartners / metrics.partnerCountWithTasks : 0;
  if (metrics.partnerCountWithTasks >= 3 && repeatDemand < 0.4) recommendations.push({ priority: "next", title: "Package recurring partner requests", rationale: `Repeat demand is ${Math.round(repeatDemand * 100)}%, below the 40% gate.`, action: "Create task templates per partner and schedule a weekly operating review with follow-up actions." });
  if ((lowSignal[0]?.total ?? 0) > 0) recommendations.push({ priority: "next", title: "Improve evidence collection guidance", rationale: `${lowSignal[0]?.total ?? 0} validated assets have low contextual signals.`, action: "Require capture time/GPS/device metadata where appropriate and train relays on evidence checklists." });
  if ((failedPayouts[0]?.total ?? 0) > 0) recommendations.push({ priority: "now", title: "Repair payout reconciliation", rationale: `${failedPayouts[0]?.total ?? 0} payout(s) are marked failed.`, action: "Export finance reconciliation, inspect Stripe webhooks, and resolve provider failures before further release." });
  if (metrics.totalTasks >= 25 && bidDensity >= 0.7 && reviewSla >= 0.95 && repeatDemand >= 0.4 && metrics.unresolvedCriticalAlerts === 0) recommendations.push({ priority: "later", title: "Begin agent integration expansion", rationale: "The operating loop is showing stable demand, supply, and review quality.", action: "Introduce partner webhooks and the Certifera agent SDK before considering $CERT security mechanisms." });
  return Response.json({ recommendations, generatedAt: new Date().toISOString() });
}
