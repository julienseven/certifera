import { db } from "@/db";
import { payouts, relays, workOrders } from "@/db/schema";
import { resolveLimit } from "@/app/api/_pagination";
import { requireIdentity, writeAudit } from "@/lib/auth";
import { desc, eq } from "drizzle-orm";

/*
 * The whole CSV is assembled in memory before it is sent, so the row count is
 * the response size. The ceiling keeps a full export inside the serverless
 * response budget; a truncated one is never silent, because a short
 * reconciliation file that looks complete is worse than a missing one.
 */
const DEFAULT_ROWS = 5000;
const MAX_ROWS = 20000;

function csvCell(value: unknown) {
  const text = value === null || value === undefined ? "" : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

export async function GET(request: Request) {
  const auth = await requireIdentity(request, { roles: ["admin"] });
  if (!auth.identity) return auth.response;
  const limit = resolveLimit(request, DEFAULT_ROWS, MAX_ROWS);
  const rows = await db
    .select({
      payoutId: payouts.id,
      workOrderRef: workOrders.externalRef,
      workOrderTitle: workOrders.title,
      cohortId: workOrders.pilotCohortId,
      partnerId: workOrders.pilotPartnerId,
      relayHandle: relays.handle,
      grossCents: payouts.grossCents,
      protocolFeeCents: payouts.protocolFeeCents,
      netCents: payouts.netCents,
      payoutStatus: payouts.status,
      provider: payouts.settlementProvider,
      settlementRef: payouts.settlementRef,
      providerEventId: payouts.providerEventId,
      failureReason: payouts.failureReason,
      releasedAt: payouts.releasedAt,
      reconciledAt: payouts.reconciledAt,
      createdAt: payouts.createdAt,
    })
    .from(payouts)
    .innerJoin(workOrders, eq(payouts.workOrderId, workOrders.id))
    .innerJoin(relays, eq(payouts.relayId, relays.id))
    .orderBy(desc(payouts.createdAt))
    .limit(limit);
  const truncated = rows.length === limit;
  const headings = ["payout_id", "work_order_ref", "work_order_title", "cohort_id", "partner_id", "relay", "gross_usd", "protocol_fee_usd", "relay_net_usd", "status", "provider", "settlement_ref", "provider_event_id", "failure_reason", "released_at", "reconciled_at", "created_at"];
  const csv = [headings.join(","), ...rows.map((row) => [
    row.payoutId, row.workOrderRef, row.workOrderTitle, row.cohortId, row.partnerId, row.relayHandle,
    (row.grossCents / 100).toFixed(2), (row.protocolFeeCents / 100).toFixed(2), (row.netCents / 100).toFixed(2),
    row.payoutStatus, row.provider, row.settlementRef, row.providerEventId, row.failureReason,
    row.releasedAt?.toISOString(), row.reconciledAt?.toISOString(), row.createdAt.toISOString(),
  ].map(csvCell).join(","))].join("\n");
  await writeAudit({ actorId: auth.identity.userId, action: "finance_export_downloaded", resourceType: "payout_export", request, data: { rows: rows.length, truncated } });
  return new Response(csv, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="certifera-payout-reconciliation-${new Date().toISOString().slice(0, 10)}.csv"`, "cache-control": "private, no-store", "x-certifera-row-limit": String(limit), "x-certifera-truncated": String(truncated) } });
}
