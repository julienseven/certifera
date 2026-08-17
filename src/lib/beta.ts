import { db } from "@/db";
import { sql } from "drizzle-orm";

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
      description: "A partner is repeat-active after funding a second outcome request within 30 days of their first. Partners whose first 30 days have not elapsed are not counted either way.",
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

/*
 * The scorecard is a cross-table aggregate (latest proof per outcome, first bid
 * per outcome, a median first-bid latency). It used to be four `LIMIT 5000`
 * table scans reduced in JS, which meant the numbers described the most recent
 * slice rather than the pilot, and the response had to carry `sampled: true` to
 * say so. Postgres can express all of it — DISTINCT ON for the latest proof,
 * MIN for the first bid, percentile_cont for the median — so the whole thing is
 * one round trip over the full tables, with no row ever crossing the wire
 * except the single aggregate row.
 *
 * The scans this replaces were the memory ceiling on the scorecard: every count
 * below is now computed in the database and bounded by the index, not by how
 * much of work_orders / relay_bids / proof_bundles fits in one lambda.
 *
 * It lives here rather than beside the route because the recommendations route
 * needs the same numbers, and used to get them by calling the scorecard's own
 * HTTP endpoint with the caller's cookie forwarded — which failed outright for
 * anyone authenticating with an API key.
 */

type ScorecardRow = {
  total_tasks: string | number;
  matched_tasks: string | number;
  proof_submitted_tasks: string | number;
  resolved_review_tasks: string | number;
  reviews_within_sla: string | number;
  competitive_bid_tasks: string | number;
  partner_count_with_tasks: string | number;
  repeat_partners: string | number;
  feedback_count: string | number;
  average_satisfaction: string | number | null;
  median_first_bid_minutes: string | number | null;
  unresolved_critical_alerts: string | number;
};

/** node-postgres returns bigint/numeric as strings to avoid precision loss. */
function int(value: string | number | null | undefined) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}
function nullableNumber(value: string | number | null | undefined) {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

const SCORECARD = sql`
  with latest_proof as (
    select distinct on (work_order_id)
      work_order_id, status, created_at
    from proof_bundles
    order by work_order_id, created_at desc, id desc
  ),
  first_bid as (
    select work_order_id, min(created_at) as first_bid_at, count(*) as bid_count
    from relay_bids
    group by work_order_id
  ),
  /*
   * work_orders holds current state, and the two facts these gates are about
   * are both erased by the transition that follows them: an SLA breach or a
   * post-dispute reopen puts a matched outcome back to 'open' with no relay,
   * and the review route clears review_due_at in the same statement that
   * records the decision. Reading either column back therefore answers a
   * different question than the gate asks. execution_events is append-only, so
   * it is where the pilot's history actually survives.
   */
  matched_orders as (
    select distinct work_order_id from execution_events where type = 'relay_matched'
  ),
  late_reviews as (
    select distinct e.work_order_id
    from execution_events e
    join latest_proof p on p.work_order_id = e.work_order_id
    where e.type in ('review_sla_breached', 'review_sla_escalated')
      -- A breach from the first review round must not follow a reopened outcome
      -- onto the bundle its second relay collected.
      and e.created_at >= p.created_at
  ),
  partner_first_order as (
    select pilot_partner_id, min(created_at) as first_at
    from work_orders
    where pilot_partner_id is not null
    group by pilot_partner_id
  ),
  partner_windows as (
    select
      f.pilot_partner_id,
      f.first_at,
      -- Subtracting two timestamptz values gives exact elapsed time, so the
      -- window neither moves with the session time zone nor gains an hour
      -- across a DST boundary the way first_at + interval '30 days' would.
      count(*) filter (where o.created_at - f.first_at <= interval '30 days') as orders_in_window
    from partner_first_order f
    join work_orders o on o.pilot_partner_id = f.pilot_partner_id
    group by f.pilot_partner_id, f.first_at
  ),
  order_metrics as (
    select
      count(*) as total_tasks,
      count(*) filter (
        where m.work_order_id is not null or o.status in ('matched', 'review', 'disputed', 'verified')
      ) as matched_tasks,
      count(*) filter (where p.work_order_id is not null) as proof_submitted_tasks,
      count(*) filter (where p.status in ('verified', 'disputed')) as resolved_review_tasks,
      -- The ledger records lateness, never punctuality, so the absence of a
      -- breach event is what an on-time decision looks like.
      count(*) filter (where p.status in ('verified', 'disputed') and l.work_order_id is null) as reviews_within_sla,
      count(*) filter (where b.bid_count >= 2) as competitive_bid_tasks,
      percentile_cont(0.5) within group (
        order by extract(epoch from (b.first_bid_at - o.created_at)) / 60
      ) filter (where b.first_bid_at is not null) as median_first_bid_minutes
    from work_orders o
    left join latest_proof p on p.work_order_id = o.id
    left join first_bid b on b.work_order_id = o.id
    left join matched_orders m on m.work_order_id = o.id
    left join late_reviews l on l.work_order_id = o.id
  ),
  partner_metrics as (
    select
      count(*) as partner_count_with_tasks,
      count(*) filter (where orders_in_window >= 2) as repeat_partners
    from partner_windows
    -- 30-day retention is unanswerable until the 30 days are up. Scoring a
    -- partner who signed last week as a non-repeat is a failure the pilot has
    -- not had time to earn; leaving them out instead means a cohort too young
    -- to measure reports an empty denominator, which the gate reads as
    -- "insufficient" rather than as a 0% it cannot support.
    where now() - first_at >= interval '30 days'
  ),
  checkin_metrics as (
    select
      count(satisfaction) as feedback_count,
      avg(satisfaction)::float8 as average_satisfaction
    from partner_checkins
  ),
  alert_metrics as (
    select count(*) as unresolved_critical_alerts
    from operational_events
    where level = 'critical' and resolved_at is null
  )
  select
    order_metrics.total_tasks,
    order_metrics.matched_tasks,
    order_metrics.proof_submitted_tasks,
    order_metrics.resolved_review_tasks,
    order_metrics.reviews_within_sla,
    order_metrics.competitive_bid_tasks,
    order_metrics.median_first_bid_minutes,
    partner_metrics.partner_count_with_tasks,
    partner_metrics.repeat_partners,
    checkin_metrics.feedback_count,
    checkin_metrics.average_satisfaction,
    alert_metrics.unresolved_critical_alerts
  from order_metrics, partner_metrics, checkin_metrics, alert_metrics
`;

export async function getBetaMetrics(): Promise<BetaMetrics> {
  const { rows } = await db.execute<ScorecardRow>(SCORECARD);
  const row = rows[0];
  const rawMedian = nullableNumber(row?.median_first_bid_minutes);
  return {
    totalTasks: int(row?.total_tasks),
    matchedTasks: int(row?.matched_tasks),
    proofSubmittedTasks: int(row?.proof_submitted_tasks),
    resolvedReviewTasks: int(row?.resolved_review_tasks),
    reviewsWithinSla: int(row?.reviews_within_sla),
    competitiveBidTasks: int(row?.competitive_bid_tasks),
    partnerCountWithTasks: int(row?.partner_count_with_tasks),
    repeatPartners: int(row?.repeat_partners),
    feedbackCount: int(row?.feedback_count),
    averageSatisfaction: nullableNumber(row?.average_satisfaction),
    // Negative latency is not physically meaningful; clamp as the JS version did.
    medianFirstBidMinutes: rawMedian === null ? null : Math.max(0, Math.round(rawMedian)),
    unresolvedCriticalAlerts: int(row?.unresolved_critical_alerts),
  };
}
