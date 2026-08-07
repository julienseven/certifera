import { db } from "@/db";
import { payouts, relays, workOrders } from "@/db/schema";
import { requireIdentity, writeAudit } from "@/lib/auth";
import { recordLifecycleEvent } from "@/lib/lifecycle";
import { reportException } from "@/lib/observability";
import { ensureSandboxData } from "@/lib/sandbox";
import { releaseSettlement } from "@/lib/settlement";
import { and, eq } from "drizzle-orm";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireIdentity(request, { roles: ["operator", "admin"] });
  if (!auth.identity) return auth.response;
  try {
    await ensureSandboxData();
    const { id } = await context.params;
    const [candidate] = await db
      .select({
        workOrderStatus: workOrders.status,
        payout: payouts,
        stripeAccountId: relays.stripeAccountId,
      })
      .from(workOrders)
      .innerJoin(payouts, eq(payouts.workOrderId, workOrders.id))
      .innerJoin(relays, eq(payouts.relayId, relays.id))
      .where(eq(workOrders.id, id))
      .limit(1);
    if (!candidate) return Response.json({ error: "No authorized payout exists for this request." }, { status: 409 });
    if (candidate.workOrderStatus !== "verified") return Response.json({ error: "Payout can only release after proof approval." }, { status: 409 });
    if (candidate.payout.status === "released") return Response.json({ error: "This payout has already been released." }, { status: 409 });
    if (candidate.payout.status !== "authorized") return Response.json({ error: "This payout is not in a releasable state." }, { status: 409 });

    const settlement = await releaseSettlement({
      payoutId: candidate.payout.id,
      workOrderId: id,
      netCents: candidate.payout.netCents,
      stripeAccountId: candidate.stripeAccountId,
    });

    const result = await db.transaction(async (tx) => {
      const [released] = await tx
        .update(payouts)
        .set({ status: "released", settlementProvider: settlement.provider, settlementRef: settlement.reference, releasedAt: new Date() })
        .where(and(eq(payouts.id, candidate.payout.id), eq(payouts.status, "authorized")))
        .returning();
      if (!released) return null;
      await recordLifecycleEvent(tx, {
        workOrderId: id,
        type: "payout_released",
        actor: `settlement/${settlement.provider}`,
        summary: `Released $${(released.netCents / 100).toFixed(2)} to the selected relay through ${settlement.provider} settlement.`,
        data: { payoutId: released.id, netCents: released.netCents, settlementRef: settlement.reference, provider: settlement.provider },
      });
      return released;
    });
    if (!result) return Response.json({ error: "Payout was released concurrently. Refresh the settlement record." }, { status: 409 });
    await writeAudit({ actorId: auth.identity.userId, action: "payout_released", resourceType: "payout", resourceId: result.id, request, data: { provider: settlement.provider, netCents: result.netCents } });
    return Response.json({ payout: result });
  } catch (error) {
    console.error("settlement release failed", error);
    await reportException({ service: "settlement", code: "payout_release_failed", error, resourceType: "work_order" });
    return Response.json({ error: error instanceof Error ? error.message : "Could not release the payout instruction." }, { status: 500 });
  }
}
