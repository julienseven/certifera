import { db } from "@/db";
import { executionEvents, payouts, relays, reputationEvents, workOrders } from "@/db/schema";
import { decodeCursor, encodeCursor, resolveLimit } from "@/app/api/_pagination";
import { requireIdentity } from "@/lib/auth";
import { forbidden, resolveOutcomeAccess } from "@/lib/authz";
import { and, desc, eq, sql } from "drizzle-orm";

const DEFAULT_EVENTS = 100;
const MAX_EVENTS = 500;
// One reputation event per review decision on this outcome; a dispute/reopen
// loop is the only way to accumulate more, so a flat cap needs no cursor.
const MAX_REPUTATION_EVENTS = 100;

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireIdentity(request);
  if (!auth.identity) return auth.response;
  try {
    const { id } = await context.params;
    const limit = resolveLimit(request, DEFAULT_EVENTS, MAX_EVENTS);
    const cursor = decodeCursor(new URL(request.url).searchParams.get("cursor"));
    if (cursor === "invalid") return Response.json({ error: "Use the cursor returned by the previous page of activity." }, { status: 400 });
    const [workOrder] = await db.select({ id: workOrders.id }).from(workOrders).where(eq(workOrders.id, id)).limit(1);
    if (!workOrder) return Response.json({ error: "This request no longer exists." }, { status: 404 });

    // The lifecycle is visible to anyone with a stake in this outcome, but the
    // payout instruction is the selected relay's private economics: gross, fee,
    // and net. It used to be returned to any authenticated caller, so a rival
    // relay could read what the winner was paid.
    const access = await resolveOutcomeAccess(auth.identity, id);
    if (!access.canView) return forbidden();

    const [events, payout, reputation] = await Promise.all([
      db
        .select({
          id: executionEvents.id,
          type: executionEvents.type,
          actor: executionEvents.actor,
          summary: executionEvents.summary,
          data: executionEvents.data,
          createdAt: executionEvents.createdAt,
        })
        .from(executionEvents)
        .where(cursor
          ? and(
              eq(executionEvents.workOrderId, id),
              sql`(${executionEvents.createdAt}, ${executionEvents.id}) < (${cursor.createdAt}, ${cursor.id}::uuid)`,
            )
          : eq(executionEvents.workOrderId, id))
        .orderBy(desc(executionEvents.createdAt), desc(executionEvents.id))
        .limit(limit),
      db
        .select({
          id: payouts.id,
          grossCents: payouts.grossCents,
          protocolFeeCents: payouts.protocolFeeCents,
          netCents: payouts.netCents,
          status: payouts.status,
          settlementRef: payouts.settlementRef,
          providerEventId: payouts.providerEventId,
          failureReason: payouts.failureReason,
          reconciledAt: payouts.reconciledAt,
          releasedAt: payouts.releasedAt,
          createdAt: payouts.createdAt,
          relayHandle: relays.handle,
        })
        .from(payouts)
        .innerJoin(relays, eq(payouts.relayId, relays.id))
        .where(eq(payouts.workOrderId, id))
        .limit(1),
      db
        .select({
          id: reputationEvents.id,
          delta: reputationEvents.delta,
          reason: reputationEvents.reason,
          createdAt: reputationEvents.createdAt,
          relayHandle: relays.handle,
        })
        .from(reputationEvents)
        .innerJoin(relays, eq(reputationEvents.relayId, relays.id))
        .where(eq(reputationEvents.workOrderId, id))
        .orderBy(desc(reputationEvents.createdAt))
        .limit(MAX_REPUTATION_EVENTS),
    ]);

    const nextCursor = events.length === limit ? encodeCursor(events[events.length - 1]) : null;
    return Response.json({
      events,
      nextCursor,
      payout: access.canViewCommercials ? payout[0] || null : null,
      reputation,
    });
  } catch (error) {
    console.error("activity feed failed", error);
    return Response.json({ error: "The lifecycle activity is temporarily unavailable." }, { status: 500 });
  }
}
