import { db } from "@/db";
import { relayBids, workOrders } from "@/db/schema";
import { hasRole, type Identity } from "@/lib/auth";
import { and, eq } from "drizzle-orm";

/**
 * Resource-level authorization for a single outcome.
 *
 * Role checks answer "what kind of actor is this?". They cannot answer "should
 * this actor see *this* outcome?", and every route that needed the second
 * question was answering it ad hoc or not at all. The bid book asked only for
 * an authenticated caller and then returned every competing quote and ETA for
 * an outcome, so any relay could read the market it was bidding into. The
 * activity feed did the same with payout economics.
 *
 * These helpers are the one place that decides, so a new route gets the same
 * answer as an existing one rather than re-deriving it.
 */

/** Staff see every outcome: running the market is the job. */
export function isStaff(identity: Identity) {
  return hasRole(identity, ["admin", "operator", "reviewer"]);
}

export type OutcomeAccess = {
  /** The caller may see that this outcome exists and follow its lifecycle. */
  canView: boolean;
  /** The caller may see commercially sensitive detail: competing quotes, payout economics. */
  canViewCommercials: boolean;
  /** The relay this caller acts as, when it is a relay account. */
  relayId: string | null;
  /** True when this caller's relay is the one selected to execute. */
  isSelectedRelay: boolean;
};

/**
 * Resolves what one identity may see of one outcome.
 *
 * A relay's stake in an outcome is either being selected for it or having bid
 * on it. That is deliberately narrow: an open outcome is public to relays so
 * they can bid, but its *book* is not, or the market would be transparent to
 * exactly the parties competing in it.
 */
export async function resolveOutcomeAccess(identity: Identity, workOrderId: string): Promise<OutcomeAccess> {
  if (isStaff(identity)) {
    return { canView: true, canViewCommercials: true, relayId: identity.relayId, isSelectedRelay: false };
  }

  const relayId = identity.relayId;
  if (!relayId) {
    // An identity with no relay profile and no staff role has no stake at all.
    return { canView: false, canViewCommercials: false, relayId: null, isSelectedRelay: false };
  }

  const [workOrder] = await db
    .select({ selectedRelayId: workOrders.selectedRelayId, status: workOrders.status })
    .from(workOrders)
    .where(eq(workOrders.id, workOrderId))
    .limit(1);
  if (!workOrder) {
    return { canView: false, canViewCommercials: false, relayId, isSelectedRelay: false };
  }

  const isSelectedRelay = workOrder.selectedRelayId === relayId;
  if (isSelectedRelay) {
    // The selected relay is a counterparty to this outcome: it needs its own
    // payout economics and the lifecycle that produced them.
    return { canView: true, canViewCommercials: true, relayId, isSelectedRelay: true };
  }

  const [ownBid] = await db
    .select({ id: relayBids.id })
    .from(relayBids)
    .where(and(eq(relayBids.workOrderId, workOrderId), eq(relayBids.relayId, relayId)))
    .limit(1);

  // Bidding on an outcome earns visibility of the outcome, never of the book:
  // that is the information a competitor would use to underbid.
  const hasStake = Boolean(ownBid) || workOrder.status === "open";
  return { canView: hasStake, canViewCommercials: false, relayId, isSelectedRelay: false };
}

/** Standard refusal, worded so it does not confirm what the caller was probing for. */
export function forbidden() {
  return Response.json({ error: "You do not have access to this request." }, { status: 403 });
}
