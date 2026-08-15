import { db } from "@/db";
import { relayBids, relays, workOrders } from "@/db/schema";
import { resolveLimit } from "@/app/api/_pagination";
import { hasRole, requireIdentity, writeAudit } from "@/lib/auth";
import { forbidden, resolveOutcomeAccess } from "@/lib/authz";
import { calculateExecutionDueAt, recordLifecycleEvent } from "@/lib/lifecycle";
import { and, asc, eq } from "drizzle-orm";

// One open bid per relay per outcome, so the book is bounded by roster size —
// which is still unbounded over time. Cheapest quotes first, so the truncated
// tail is the part an operator would never select anyway.
const DEFAULT_BIDS = 100;
const MAX_BIDS = 500;

function stringValue(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

async function findWorkOrder(id: string) {
  const [workOrder] = await db.select().from(workOrders).where(eq(workOrders.id, id)).limit(1);
  return workOrder;
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireIdentity(request);
  if (!auth.identity) return auth.response;
  try {
    const { id } = await context.params;
    const workOrder = await findWorkOrder(id);
    if (!workOrder) return Response.json({ error: "This request no longer exists." }, { status: 404 });

    // The book is the market's private information. An operator runs the
    // market and sees all of it; a relay sees only its own quote, because the
    // competing quotes and ETAs here are exactly what a rival would use to
    // underbid. Previously any authenticated caller received the whole book.
    const access = await resolveOutcomeAccess(auth.identity, id);
    if (!access.canView) return forbidden();

    const visibility = access.canViewCommercials
      ? eq(relayBids.workOrderId, id)
      : and(eq(relayBids.workOrderId, id), eq(relayBids.relayId, access.relayId!));

    const bids = await db
      .select({
        id: relayBids.id,
        workOrderId: relayBids.workOrderId,
        relayId: relayBids.relayId,
        quoteCents: relayBids.quoteCents,
        etaMinutes: relayBids.etaMinutes,
        note: relayBids.note,
        status: relayBids.status,
        createdAt: relayBids.createdAt,
        relayHandle: relays.handle,
        relayZone: relays.zone,
        relaySpecialty: relays.specialty,
        relayReputation: relays.reputation,
      })
      .from(relayBids)
      .innerJoin(relays, eq(relayBids.relayId, relays.id))
      .where(visibility)
      .orderBy(asc(relayBids.quoteCents), asc(relayBids.etaMinutes))
      .limit(resolveLimit(request, DEFAULT_BIDS, MAX_BIDS));

    return Response.json({ bids });
  } catch (error) {
    console.error("bid feed failed", error);
    return Response.json({ error: "The bid book is temporarily unavailable." }, { status: 500 });
  }
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireIdentity(request, { roles: ["relay", "admin"], scope: "requests:write" });
  if (!auth.identity) return auth.response;
  try {
    const { id } = await context.params;
    const body = (await request.json()) as Record<string, unknown>;
    const relayId = stringValue(body.relayId, 64);
    const quoteDollars = Number(body.quote);
    const etaMinutes = Number(body.etaMinutes);
    const note = stringValue(body.note, 280);

    const workOrder = await findWorkOrder(id);
    if (!workOrder) return Response.json({ error: "This request no longer exists." }, { status: 404 });
    if (workOrder.status !== "open") {
      return Response.json({ error: "Bids close once a relay has been selected." }, { status: 409 });
    }
    if (!relayId) return Response.json({ error: "Choose an active relay." }, { status: 400 });
    if (!Number.isFinite(quoteDollars) || quoteDollars < 25 || quoteDollars > workOrder.rewardCents / 100) {
      return Response.json({ error: `Quote between $25 and ${Math.floor(workOrder.rewardCents / 100)}.` }, { status: 400 });
    }
    if (!Number.isInteger(etaMinutes) || etaMinutes < 15 || etaMinutes > 1440) {
      return Response.json({ error: "Delivery ETA must be between 15 minutes and 24 hours." }, { status: 400 });
    }
    if (note.length < 8) return Response.json({ error: "Add a short note explaining this bid." }, { status: 400 });

    const [relay] = await db.select().from(relays).where(and(eq(relays.id, relayId), eq(relays.active, true))).limit(1);
    if (!relay) return Response.json({ error: "Choose an active relay from the network." }, { status: 400 });
    if (!hasRole(auth.identity, ["admin"]) && auth.identity.relayId !== relay.id) {
      return Response.json({ error: "Relay accounts can only quote as their linked relay profile." }, { status: 403 });
    }

    const [existing] = await db
      .select()
      .from(relayBids)
      .where(and(eq(relayBids.workOrderId, id), eq(relayBids.relayId, relayId)))
      .limit(1);

    const quoteCents = Math.round(quoteDollars * 100);
    const result = await db.transaction(async (tx) => {
      if (existing) {
        const [bid] = await tx
          .update(relayBids)
          .set({ quoteCents, etaMinutes, note, status: "open" })
          .where(eq(relayBids.id, existing.id))
          .returning();
        await recordLifecycleEvent(tx, {
          workOrderId: id,
          type: "bid_revised",
          actor: relay.handle,
          summary: `Revised quote to $${(quoteCents / 100).toFixed(2)} with a ${etaMinutes}-minute ETA.`,
          data: { relayId, quoteCents, etaMinutes },
        });
        return { bid, updated: true };
      }

      const [bid] = await tx
        .insert(relayBids)
        .values({ workOrderId: id, relayId, quoteCents, etaMinutes, note, status: "open" })
        .returning();
      await recordLifecycleEvent(tx, {
        workOrderId: id,
        type: "bid_placed",
        actor: relay.handle,
        summary: `Quoted $${(quoteCents / 100).toFixed(2)} with a ${etaMinutes}-minute ETA.`,
        data: { relayId, quoteCents, etaMinutes },
      });
      return { bid, updated: false };
    });

    await writeAudit({ actorId: auth.identity.userId, action: result.updated ? "bid_revised" : "bid_placed", resourceType: "relay_bid", resourceId: result.bid.id, request, data: { workOrderId: id, relayId, quoteCents } });
    return Response.json(result, { status: result.updated ? 200 : 201 });
  } catch (error) {
    console.error("bid create failed", error);
    return Response.json({ error: "Could not place the relay bid. Please try again." }, { status: 500 });
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireIdentity(request, { roles: ["operator", "admin"] });
  if (!auth.identity) return auth.response;
  try {
    const { id } = await context.params;
    const body = (await request.json()) as Record<string, unknown>;
    const bidId = stringValue(body.bidId, 64);
    if (!bidId) return Response.json({ error: "Choose a bid to select." }, { status: 400 });

    const result = await db.transaction(async (tx) => {
      const [workOrder] = await tx.select().from(workOrders).where(eq(workOrders.id, id)).limit(1);
      if (!workOrder) return { error: "This request no longer exists.", status: 404 } as const;
      if (workOrder.status !== "open") return { error: "This request is no longer accepting bids.", status: 409 } as const;

      const [bid] = await tx
        .select()
        .from(relayBids)
        .where(and(eq(relayBids.id, bidId), eq(relayBids.workOrderId, id)))
        .limit(1);
      if (!bid || bid.status !== "open") return { error: "That bid is no longer available.", status: 409 } as const;

      await tx
        .update(relayBids)
        .set({ status: "rejected" })
        .where(and(eq(relayBids.workOrderId, id), eq(relayBids.status, "open")));
      await tx.update(relayBids).set({ status: "selected" }).where(eq(relayBids.id, bid.id));
      const executionDueAt = calculateExecutionDueAt(bid.etaMinutes);
      const [updatedRequest] = await tx
        .update(workOrders)
        .set({ status: "matched", selectedRelayId: bid.relayId, executionDueAt, reviewDueAt: null, slaStatus: "on_track", updatedAt: new Date() })
        .where(eq(workOrders.id, id))
        .returning();
      const [selectedRelay] = await tx.select().from(relays).where(eq(relays.id, bid.relayId)).limit(1);
      await recordLifecycleEvent(tx, {
        workOrderId: id,
        type: "relay_matched",
        actor: "operator/console",
        summary: `Selected ${selectedRelay?.handle || "relay"} at $${(bid.quoteCents / 100).toFixed(2)} with a ${bid.etaMinutes}-minute ETA.`,
        data: { relayId: bid.relayId, quoteCents: bid.quoteCents, etaMinutes: bid.etaMinutes, executionDueAt: executionDueAt.toISOString() },
      });

      return { request: updatedRequest, bid } as const;
    });

    if ("error" in result) return Response.json({ error: result.error }, { status: result.status });
    await writeAudit({ actorId: auth.identity.userId, action: "relay_selected", resourceType: "relay_bid", resourceId: result.bid.id, request, data: { workOrderId: id, relayId: result.bid.relayId, quoteCents: result.bid.quoteCents } });
    return Response.json(result);
  } catch (error) {
    console.error("bid selection failed", error);
    return Response.json({ error: "Could not select this relay. Please try again." }, { status: 500 });
  }
}
