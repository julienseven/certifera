export type BetaMetrics = {
  totalTasks: number;
  matchedTasks: number;
  proofSubmittedTasks: number;
  resolvedReviewTasks: number;
  reviewsWithinSla: number;
  competitiveBidTasks: number;
  partnerCountWithTasks: number;
  repeatPartners: number;
  feedbackCount: number;
  averageSatisfaction: number | null;
  medianFirstBidMinutes: number | null;
  unresolvedCriticalAlerts: number;
};

export type LaunchGate = {
  key: string;
  label: string;
  target: string;
  current: string;
  status: "pass" | "fail" | "insufficient";
  description: string;
};

function ratio(numerator: number, denominator: number) {
  return denominator > 0 ? numerator / denominator : null;
}

function percentage(value: number | null) {
  return value === null ? "—" : `${Math.round(value * 100)}%`;
}

export function evaluateLaunchGates(metrics: BetaMetrics, deploymentReady: boolean): LaunchGate[] {
  const proofRate = ratio(metrics.proofSubmittedTasks, metrics.matchedTasks);
  const reviewSlaRate = ratio(metrics.reviewsWithinSla, metrics.resolvedReviewTasks);
  const bidDensity = ratio(metrics.competitiveBidTasks, metrics.totalTasks);
  const repeatRate = ratio(metrics.repeatPartners, metrics.partnerCountWithTasks);
  const betaSampleReady = metrics.totalTasks >= 25;
  return [
    {
      key: "infrastructure",
      label: "Production safeguards",
      target: "All required checks passed",
      current: deploymentReady ? "Ready" : "Blocked",
      status: deploymentReady ? "pass" : "fail",
      description: "Private storage, scan gate, email, MFA encryption, cron, backup drill, and incident readiness must be attested.",
    },
    {
      key: "sample",
      label: "Closed-beta sample",
      target: "≥ 25 completed task attempts",
      current: `${metrics.totalTasks} tasks`,
      status: betaSampleReady ? "pass" : "insufficient",
      description: "Do not interpret quality or economics from a handful of concierge tasks.",
    },
    {
      key: "proof_completion",
      label: "Match → proof completion",
      target: "≥ 90%",
      current: percentage(proofRate),
      status: !betaSampleReady || proofRate === null ? "insufficient" : proofRate >= 0.9 ? "pass" : "fail",
      description: "Matched work should reach an evidence bundle without manual rescue.",
    },
    {
      key: "review_sla",
      label: "Review resolution in SLA",
      target: "≥ 95%",
      current: percentage(reviewSlaRate),
      status: !betaSampleReady || reviewSlaRate === null ? "insufficient" : reviewSlaRate >= 0.95 ? "pass" : "fail",
      description: "Approved or disputed reviews should close inside the published review window.",
    },
    {
      key: "competitive_bids",
      label: "Competitive bid density",
      target: "≥ 70% of requests with 2+ bids",
      current: percentage(bidDensity),
      status: !betaSampleReady || bidDensity === null ? "insufficient" : bidDensity >= 0.7 ? "pass" : "fail",
      description: "Demand should attract genuine supply competition before scale-up.",
    },
    {
      key: "repeat_demand",
      label: "Partner repeat demand",
      target: "≥ 40%",
      current: percentage(repeatRate),
      status: !betaSampleReady || repeatRate === null ? "insufficient" : repeatRate >= 0.4 ? "pass" : "fail",
      description: "A partner is repeat-active after funding two or more outcome requests.",
    },
    {
      key: "feedback",
      label: "Partner satisfaction",
      target: "≥ 4.0 / 5.0",
      current: metrics.averageSatisfaction === null ? "—" : `${metrics.averageSatisfaction.toFixed(1)} / 5.0`,
      status: metrics.feedbackCount < 5 ? "insufficient" : (metrics.averageSatisfaction ?? 0) >= 4 ? "pass" : "fail",
      description: "Use structured check-ins to validate service quality before broad rollout.",
    },
    {
      key: "critical_alerts",
      label: "Unresolved critical alerts",
      target: "0",
      current: String(metrics.unresolvedCriticalAlerts),
      status: metrics.unresolvedCriticalAlerts === 0 ? "pass" : "fail",
      description: "No public expansion while payout, evidence, or security alerts are unresolved.",
    },
  ];
}
