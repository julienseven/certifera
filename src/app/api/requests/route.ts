import { db } from "@/db";
import { pilotCohorts, pilotPartners, relays, workOrders } from "@/db/schema";
import { decodeCursor, encodeCursor, resolveLimit } from "@/app/api/_pagination";
import { requireIdentity, writeAudit } from "@/lib/auth";
import { partnerBelongsToCohort } from "@/lib/cohort";
import { recordLifecycleEvent } from "@/lib/lifecycle";
import { ensureSandboxData } from "@/lib/sandbox";
import { and, desc, eq, sql } from "drizzle-orm";

const DEFAULT_REQUESTS = 100;
const MAX_REQUESTS = 500;

const categories = new Set(["Infrastructure", "Field verification", "Climate data", "Delivery"]);
const defaultRequirements: Record<string, string[]> = {
  Infrastructure: ["Geo-stamped exterior photos", "Asset identifier capture", "Time + location attestation"],
  "Field verification": ["Geo-stamped proof image", "Observed condition", "Time + location attestation"],
  "Climate data": ["Sensor or site image", "Identifier capture", "Time + location attestation"],
  Delivery: ["Recipient handoff proof", "Package label capture", "Time + location attestation"],
};

function stringValue(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

export async function GET(request: Request) {
  const auth = await requireIdentity(request);
  if (!auth.identity) return auth.response;
  try {
    await ensureSandboxData();
    const url = new URL(request.url);
    const limit = resolveLimit(request, DEFAULT_REQUESTS, MAX_REQUESTS);
    const cursor = decodeCursor(url.searchParams.get("cursor"));
    if (cursor === "invalid") return Response.json({ error: "Use the cursor returned by the previous page of requests." }, { status: 400 });
    // An unfiltered feed cannot use work_orders_status_created_at_idx; passing
    // ?status= narrows it to an index scan instead of a full-table top-N sort.
    const status = (url.searchParams.get("status") || "").trim().slice(0, 20);
    const filters = [
      ...(status ? [eq(workOrders.status, status)] : []),
      ...(cursor ? [sql`(${workOrders.createdAt}, ${workOrders.id}) < (${cursor.createdAt}, ${cursor.id}::uuid)`] : []),
    ];
    const rows = await db
      .select({
        id: workOrders.id,
        externalRef: workOrders.externalRef,
        title: workOrders.title,
        category: workOrders.category,
        location: workOrders.location,
        rewardCents: workOrders.rewardCents,
        requester: workOrders.requester,
        pilotPartnerId: workOrders.pilotPartnerId,
        pilotCohortId: workOrders.pilotCohortId,
        status: workOrders.status,
        proofRequirements: workOrders.proofRequirements,
        selectedRelayId: workOrders.selectedRelayId,
        disputeReason: workOrders.disputeReason,
        executionDueAt: workOrders.executionDueAt,
        reviewDueAt: workOrders.reviewDueAt,
        slaStatus: workOrders.slaStatus,
        createdAt: workOrders.createdAt,
        relayHandle: relays.handle,
        relayZone: relays.zone,
        relayReputation: relays.reputation,
      })
      .from(workOrders)
      .leftJoin(relays, eq(workOrders.selectedRelayId, relays.id))
      .where(filters.length ? and(...filters) : undefined)
      .orderBy(desc(workOrders.createdAt), desc(workOrders.id))
      .limit(limit);

    const nextCursor = rows.length === limit ? encodeCursor(rows[rows.length - 1]) : null;
    return Response.json({ requests: rows, nextCursor });
  } catch (error) {
    console.error("request feed failed", error);
    return Response.json({ error: "The request feed is temporarily unavailable." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = await requireIdentity(request, { roles: ["operator", "admin"], scope: "requests:write" });
  if (!auth.identity) return auth.response;
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const title = stringValue(body.title, 100);
    const location = stringValue(body.location, 100);
    const pilotPartnerId = stringValue(body.pilotPartnerId, 64) || null;
    const pilotCohortId = stringValue(body.pilotCohortId, 64) || null;
    let requester = auth.identity.method === "api_key" ? `agent/${auth.identity.email}` : `operator/${auth.identity.email}`;
    const category = stringValue(body.category, 40) || "Field verification";
    const rewardDollars = Number(body.reward);

    if (title.length < 5) {
      return Response.json({ error: "Use a task title with at least five characters." }, { status: 400 });
    }
    if (location.length < 3) {
      return Response.json({ error: "Add the city or service location." }, { status: 400 });
    }
    if (!categories.has(category)) {
      return Response.json({ error: "Choose a supported task category." }, { status: 400 });
    }
    if (!Number.isFinite(rewardDollars) || rewardDollars < 25 || rewardDollars > 10000) {
      return Response.json({ error: "Set a reward between $25 and $10,000." }, { status: 400 });
    }
    if (pilotCohortId && !pilotPartnerId) {
      return Response.json({ error: "Choose an enrolled pilot partner when funding a cohort task." }, { status: 400 });
    }
    if (pilotPartnerId) {
      const [partner] = await db.select({ requesterAlias: pilotPartners.requesterAlias, status: pilotPartners.status, contractStatus: pilotPartners.contractStatus }).from(pilotPartners).where(eq(pilotPartners.id, pilotPartnerId)).limit(1);
      if (!partner || partner.status !== "active" || partner.contractStatus !== "signed") {
        return Response.json({ error: "Pilot partner must be active with a signed agreement before funding requests." }, { status: 400 });
      }
      if (pilotCohortId) {
        const [cohort] = await db.select({ status: pilotCohorts.status, taskCategory: pilotCohorts.taskCategory }).from(pilotCohorts).where(eq(pilotCohorts.id, pilotCohortId)).limit(1);
        if (!cohort || cohort.status !== "active") return Response.json({ error: "Pilot cohort must be active before funding its tasks." }, { status: 400 });
        if (cohort.taskCategory !== category) return Response.json({ error: "Task category must match the active pilot cohort." }, { status: 400 });
        if (!(await partnerBelongsToCohort(pilotCohortId, pilotPartnerId))) return Response.json({ error: "Pilot partner is not enrolled in this cohort." }, { status: 400 });
      }
      requester = `partner/${partner.requesterAlias}`;
    }

    const workOrder = await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(workOrders)
        .values({
          externalRef: `cert-${crypto.randomUUID().slice(0, 8)}`,
          title,
          category,
          location,
          rewardCents: Math.round(rewardDollars * 100),
          requester,
          pilotPartnerId,
          pilotCohortId,
          status: "open",
          proofRequirements: defaultRequirements[category],
        })
        .returning();

      await recordLifecycleEvent(tx, {
        workOrderId: created.id,
        type: "request_funded",
        actor: requester,
        summary: `Funded ${created.title} with a ${rewardDollars.toFixed(2)} reward cap.`,
        data: { rewardCents: created.rewardCents, category: created.category },
      });
      return created;
    });

    await writeAudit({ actorId: auth.identity.userId, action: "request_created", resourceType: "work_order", resourceId: workOrder.id, request, data: { rewardCents: workOrder.rewardCents } });
    return Response.json({ request: workOrder }, { status: 201 });
  } catch (error) {
    console.error("request create failed", error);
    return Response.json({ error: "Could not create the request. Please try again." }, { status: 500 });
  }
}
