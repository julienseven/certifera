import { db } from "@/db";
import { relays, workOrders } from "@/db/schema";
import { requireIdentity } from "@/lib/auth";
import { rankDispatchCandidates } from "@/lib/dispatch";
import { eq } from "drizzle-orm";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireIdentity(request, { roles: ["admin", "operator", "reviewer"] });
  if (!auth.identity) return auth.response;
  try {
    const { id } = await context.params;
    const [workOrder] = await db.select({ id: workOrders.id, category: workOrders.category, location: workOrders.location, status: workOrders.status }).from(workOrders).where(eq(workOrders.id, id)).limit(1);
    if (!workOrder) return Response.json({ error: "Outcome request not found." }, { status: 404 });
    const network = await db
      .select({ id: relays.id, handle: relays.handle, zone: relays.zone, specialty: relays.specialty, coverageCategories: relays.coverageCategories, availabilityStatus: relays.availabilityStatus, serviceRadiusKm: relays.serviceRadiusKm, reputation: relays.reputation, lastHeartbeatAt: relays.lastHeartbeatAt })
      .from(relays)
      .where(eq(relays.active, true));
    const candidates = rankDispatchCandidates({ category: workOrder.category, location: workOrder.location, relays: network });
    return Response.json({ request: { id: workOrder.id, category: workOrder.category, location: workOrder.location, status: workOrder.status }, candidates });
  } catch (error) {
    console.error("dispatch preflight failed", error);
    return Response.json({ error: "Could not calculate dispatch coverage." }, { status: 500 });
  }
}
