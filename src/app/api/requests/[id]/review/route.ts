import { db } from "@/db";
import { payouts, proofBundles, relayBids, relays, reputationEvents, workOrders } from "@/db/schema";
import { requireIdentity, writeAudit } from "@/lib/auth";
import { calculatePayout, recordLifecycleEvent, REPUTATION_DISPUTE_PENALTY, REPUTATION_REWARD } from "@/lib/lifecycle";
import { ensureSandboxData } from "@/lib/sandbox";
import { and, desc, eq } from "drizzle-orm";

function compactString(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

type ReviewResult =
  | {
      ok: true;
      requestStatus: "verified" | "disputed" | "open";
      proofStatus: "verified" | "disputed" | null;
      payout?: { id: string; netCents: number; status: string };
      reputationDelta?: number;
    }
  | { ok: false; error: string; httpStatus: number };

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireIdentity(request, { roles: ["operator", "reviewer", "admin"] });
  if (!auth.identity) return auth.response;
  try {
    await ensureSandboxData();
    const { id } = await context.params;
    const body = (await request.json()) as Record<string, unknown>;
    const decision = compactString(body.decision, 20);
    const note = compactString(body.note, 500);

    if (decision !== "approve" && decision !== "dispute" && decision !== "reopen") {
      return Response.json({ error: "Choose approve, dispute, or reopen." }, { status: 400 });
    }
    if (note.length < 12) {
      return Response.json({ error: "Add a review note with at least 12 characters." }, { status: 400 });
    }

    const result = await db.transaction(async (tx): Promise<ReviewResult> => {
      const [workOrder] = await tx.select().from(workOrders).where(eq(workOrders.id, id)).limit(1);
      if (!workOrder) return { ok: false, error: "This request no longer exists.", httpStatus: 404 };

      if (decision === "reopen") {
        if (workOrder.status !== "disputed") {
          return { ok: false, error: "Only a disputed request can return to the bid market.", httpStatus: 409 };
        }
        await tx
          .update(workOrders)
          .set({
            status: "open",
            selectedRelayId: null,
            disputeReason: null,
            executionDueAt: null,
            reviewDueAt: null,
            slaStatus: "reopened",
            updatedAt: new Date(),
          })
          .where(eq(workOrders.id, id));
        await recordLifecycleEvent(tx, {
          workOrderId: id,
          type: "market_reopened",
          actor: "operator/console",
          summary: "Reopened the outcome for a new relay bidding round after dispute review.",
          data: { previousStatus: "disputed" },
        });
        return { ok: true, requestStatus: "open", proofStatus: null };
      }

      if (workOrder.status !== "review") {
        return { ok: false, error: "This request is not awaiting a review decision.", httpStatus: 409 };
      }

      const reviewLate = Boolean(workOrder.reviewDueAt && new Date() > workOrder.reviewDueAt);
      const [proof] = await tx
        .select()
        .from(proofBundles)
        .where(eq(proofBundles.workOrderId, id))
        .orderBy(desc(proofBundles.createdAt))
        .limit(1);
      if (!proof || proof.status !== "pending_review" || !proof.relayId) {
        return { ok: false, error: "No pending proof bundle exists for review.", httpStatus: 409 };
      }

      const [relay] = await tx.select().from(relays).where(eq(relays.id, proof.relayId)).limit(1);
      if (!relay) return { ok: false, error: "The proof relay could not be found.", httpStatus: 409 };

      const selectedBid = decision === "approve"
        ? (await tx
            .select()
            .from(relayBids)
            .where(and(eq(relayBids.workOrderId, id), eq(relayBids.status, "selected")))
            .limit(1))[0]
        : null;
      if (decision === "approve" && !selectedBid) {
        return { ok: false, error: "The selected quote is missing, so payout cannot be authorized.", httpStatus: 409 };
      }

      const nextStatus = decision === "approve" ? "verified" : "disputed";
      if (reviewLate) {
        await recordLifecycleEvent(tx, {
          workOrderId: id,
          type: "review_sla_breached",
          actor: "liveness/engine",
          summary: "The operator review decision was recorded after the review commitment window.",
          data: { reviewDueAt: workOrder.reviewDueAt?.toISOString() || null },
        });
      }
      const [updatedWorkOrder] = await tx
        .update(workOrders)
        .set({
          status: nextStatus,
          disputeReason: decision === "dispute" ? note : null,
          reviewDueAt: null,
          slaStatus: decision === "approve" ? "settled" : "disputed",
          updatedAt: new Date(),
        })
        .where(and(eq(workOrders.id, id), eq(workOrders.status, "review")))
        .returning();
      if (!updatedWorkOrder) {
        return { ok: false, error: "This request was already reviewed. Refresh and try again.", httpStatus: 409 };
      }
      await tx
        .update(proofBundles)
        .set({ status: nextStatus, reviewerNote: note, reviewedAt: new Date() })
        .where(eq(proofBundles.id, proof.id));

      if (decision === "dispute") {
        const newReputation = Math.max(0, relay.reputation + REPUTATION_DISPUTE_PENALTY);
        const actualDelta = newReputation - relay.reputation;
        await tx.update(relays).set({ reputation: newReputation }).where(eq(relays.id, relay.id));
        await tx.insert(reputationEvents).values({
          relayId: relay.id,
          workOrderId: id,
          delta: actualDelta,
          reason: "Proof bundle disputed during operator review.",
        });
        await recordLifecycleEvent(tx, {
          workOrderId: id,
          type: "proof_disputed",
          actor: "operator/console",
          summary: `Opened a dispute and held settlement. ${relay.handle} reputation changed by ${actualDelta}.`,
          data: { proofId: proof.id, relayId: relay.id, reputationDelta: actualDelta },
        });
        return { ok: true, requestStatus: "disputed", proofStatus: "disputed", reputationDelta: actualDelta };
      }

      if (!selectedBid) {
        return { ok: false, error: "The selected quote is missing, so payout cannot be authorized.", httpStatus: 409 };
      }
      const payoutAmounts = calculatePayout(selectedBid.quoteCents);
      const [payout] = await tx
        .insert(payouts)
        .values({
          workOrderId: id,
          proofBundleId: proof.id,
          relayId: relay.id,
          ...payoutAmounts,
          status: "authorized",
        })
        .returning();

      const newReputation = Math.min(1000, relay.reputation + REPUTATION_REWARD);
      const actualDelta = newReputation - relay.reputation;
      await tx.update(relays).set({ reputation: newReputation }).where(eq(relays.id, relay.id));
      await tx.insert(reputationEvents).values({
        relayId: relay.id,
        workOrderId: id,
        delta: actualDelta,
        reason: "Approved proof bundle and payout authorized.",
      });
      await recordLifecycleEvent(tx, {
        workOrderId: id,
        type: "proof_approved",
        actor: "operator/console",
        summary: `Approved proof and authorized a $${(payout.netCents / 100).toFixed(2)} relay payout.`,
        data: { proofId: proof.id, payoutId: payout.id, relayId: relay.id, netCents: payout.netCents, reputationDelta: actualDelta },
      });
      await recordLifecycleEvent(tx, {
        workOrderId: id,
        type: "payout_authorized",
        actor: "settlement/engine",
        summary: `Created payout instruction ${payout.id.slice(0, 8)} for ${relay.handle}.`,
        data: { payoutId: payout.id, grossCents: payout.grossCents, feeCents: payout.protocolFeeCents, netCents: payout.netCents },
      });

      return {
        ok: true,
        requestStatus: "verified",
        proofStatus: "verified",
        payout: { id: payout.id, netCents: payout.netCents, status: payout.status },
        reputationDelta: actualDelta,
      };
    });

    if (!result.ok) return Response.json({ error: result.error }, { status: result.httpStatus });
    await writeAudit({ actorId: auth.identity.userId, action: `proof_${decision}`, resourceType: "work_order", resourceId: id, request, data: { requestStatus: result.requestStatus } });
    return Response.json(result);
  } catch (error) {
    console.error("proof review failed", error);
    return Response.json({ error: "Could not record the review decision. Please try again." }, { status: 500 });
  }
}
