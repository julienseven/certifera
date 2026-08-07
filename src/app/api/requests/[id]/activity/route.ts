import { db } from "@/db";
import { executionEvents, payouts, relays, reputationEvents, workOrders } from "@/db/schema";
import { requireIdentity } from "@/lib/auth";
import { ensureSandboxData } from "@/lib/sandbox";
import { desc, eq } from "drizzle-orm";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireIdentity(request);
  if (!auth.identity) return auth.response;
  try {
    await ensureSandboxData();
    const { id } = await context.params;
    const [workOrder] = await db.select({ id: workOrders.id }).from(workOrders).where(eq(workOrders.id, id)).limit(1);
    if (!workOrder) return Response.json({ error: "This request no longer exists." }, { status: 404 });

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
        .where(eq(executionEvents.workOrderId, id))
        .orderBy(desc(executionEvents.createdAt)),
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
        .orderBy(desc(reputationEvents.createdAt)),
    ]);

    return Response.json({ events, payout: payout[0] || null, reputation });
  } catch (error) {
    console.error("activity feed failed", error);
    return Response.json({ error: "The lifecycle activity is temporarily unavailable." }, { status: 500 });
  }
}
