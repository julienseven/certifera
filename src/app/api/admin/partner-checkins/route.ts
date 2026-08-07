import { db } from "@/db";
import { partnerCheckins, pilotPartners, workOrders } from "@/db/schema";
import { requireIdentity, writeAudit } from "@/lib/auth";
import { desc, eq } from "drizzle-orm";

export async function GET(request: Request) {
  const auth = await requireIdentity(request, { roles: ["admin", "operator"] });
  if (!auth.identity) return auth.response;
  const checkins = await db
    .select({
      id: partnerCheckins.id,
      partnerId: partnerCheckins.partnerId,
      partnerName: pilotPartners.name,
      requesterAlias: pilotPartners.requesterAlias,
      workOrderId: partnerCheckins.workOrderId,
      externalRef: workOrders.externalRef,
      satisfaction: partnerCheckins.satisfaction,
      riskLevel: partnerCheckins.riskLevel,
      feedback: partnerCheckins.feedback,
      nextAction: partnerCheckins.nextAction,
      createdAt: partnerCheckins.createdAt,
    })
    .from(partnerCheckins)
    .innerJoin(pilotPartners, eq(partnerCheckins.partnerId, pilotPartners.id))
    .leftJoin(workOrders, eq(partnerCheckins.workOrderId, workOrders.id))
    .orderBy(desc(partnerCheckins.createdAt))
    .limit(100);
  return Response.json({ checkins });
}

export async function POST(request: Request) {
  const auth = await requireIdentity(request, { roles: ["admin", "operator"] });
  if (!auth.identity) return auth.response;
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const partnerId = typeof body.partnerId === "string" ? body.partnerId : "";
    const workOrderId = typeof body.workOrderId === "string" && body.workOrderId ? body.workOrderId : null;
    const satisfactionRaw = body.satisfaction === "" || body.satisfaction === undefined ? null : Number(body.satisfaction);
    const satisfaction = satisfactionRaw === null ? null : Number.isInteger(satisfactionRaw) && satisfactionRaw >= 1 && satisfactionRaw <= 5 ? satisfactionRaw : Number.NaN;
    const riskLevel = typeof body.riskLevel === "string" ? body.riskLevel : "low";
    const feedback = typeof body.feedback === "string" ? body.feedback.trim().slice(0, 2000) : "";
    const nextAction = typeof body.nextAction === "string" ? body.nextAction.trim().slice(0, 500) : "";
    if (!partnerId || !["low", "medium", "high"].includes(riskLevel) || !feedback || Number.isNaN(satisfaction)) return Response.json({ error: "Provide partner, valid risk level, feedback, and optional satisfaction from 1 to 5." }, { status: 400 });
    const [partner] = await db.select({ id: pilotPartners.id }).from(pilotPartners).where(eq(pilotPartners.id, partnerId)).limit(1);
    if (!partner) return Response.json({ error: "Pilot partner not found." }, { status: 404 });
    if (workOrderId) {
      const [workOrder] = await db.select({ id: workOrders.id, pilotPartnerId: workOrders.pilotPartnerId }).from(workOrders).where(eq(workOrders.id, workOrderId)).limit(1);
      if (!workOrder || workOrder.pilotPartnerId !== partnerId) return Response.json({ error: "Selected task does not belong to this pilot partner." }, { status: 400 });
    }
    const [checkin] = await db.insert(partnerCheckins).values({ partnerId, ownerUserId: auth.identity.userId, workOrderId, satisfaction, riskLevel, feedback, nextAction }).returning();
    await writeAudit({ actorId: auth.identity.userId, action: "partner_checkin_recorded", resourceType: "partner_checkin", resourceId: checkin.id, request, data: { partnerId, riskLevel, satisfaction } });
    return Response.json({ checkin }, { status: 201 });
  } catch (error) {
    console.error("partner checkin failed", error);
    return Response.json({ error: "Could not record the partner check-in." }, { status: 500 });
  }
}
