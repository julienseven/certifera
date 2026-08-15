import { db } from "@/db";
import { requireIdentity } from "@/lib/auth";
import { evaluateLaunchGates } from "@/lib/beta";
import { getProductionReadiness } from "@/lib/readiness";
import { sql } from "drizzle-orm";

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
 * The scans this replaces were the memory ceiling on this route: every count
 * below is now computed in the database and bounded by the index, not by how
 * much of work_orders / relay_bids / proof_bundles fits in one lambda.
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
      work_order_id, status, reviewed_at
    from proof_bundles
    order by work_order_id, created_at desc, id desc
  ),
  first_bid as (
    select work_order_id, min(created_at) as first_bid_at, count(*) as bid_count
    from relay_bids
    group by work_order_id
  ),
  partner_tasks as (
    select pilot_partner_id, count(*) as task_count
    from work_orders
    where pilot_partner_id is not null
    group by pilot_partner_id
  ),
  order_metrics as (
    select
      count(*) as total_tasks,
      count(*) filter (where o.status in ('matched', 'review', 'disputed', 'verified')) as matched_tasks,
      count(*) filter (where p.work_order_id is not null) as proof_submitted_tasks,
      count(*) filter (where p.status in ('verified', 'disputed')) as resolved_review_tasks,
      count(*) filter (
        where p.status in ('verified', 'disputed')
          and p.reviewed_at is not null
          and o.review_due_at is not null
          and p.reviewed_at <= o.review_due_at
      ) as reviews_within_sla,
      count(*) filter (where b.bid_count >= 2) as competitive_bid_tasks,
      percentile_cont(0.5) within group (
        order by extract(epoch from (b.first_bid_at - o.created_at)) / 60
      ) filter (where b.first_bid_at is not null) as median_first_bid_minutes
    from work_orders o
    left join latest_proof p on p.work_order_id = o.id
    left join first_bid b on b.work_order_id = o.id
  ),
  partner_metrics as (
    select
      count(*) as partner_count_with_tasks,
      count(*) filter (where task_count >= 2) as repeat_partners
    from partner_tasks
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

export async function GET(request: Request) {
  const auth = await requireIdentity(request, { roles: ["admin", "operator"] });
  if (!auth.identity) return auth.response;
  const [{ rows }, readiness] = await Promise.all([db.execute<ScorecardRow>(SCORECARD), getProductionReadiness()]);
  const row = rows[0];
  const rawMedian = nullableNumber(row?.median_first_bid_minutes);
  const metrics = {
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
  // Kept as an explicit `false` rather than dropped: existing clients read this
  // field, and the honest answer is now "these describe the whole pilot".
  return Response.json({ metrics, readiness, sampled: false, gates: evaluateLaunchGates(metrics, readiness.ready) });
}
