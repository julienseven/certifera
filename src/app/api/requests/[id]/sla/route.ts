import { db } from "@/db";
import { workOrders } from "@/db/schema";
import { requireIdentity, writeAudit } from "@/lib/auth";
import { forbidden, resolveOutcomeAccess } from "@/lib/authz";
import { escalateOverdueSla, getSlaSnapshot } from "@/lib/sla";
import { eq } from "drizzle-orm";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireIdentity(request);
  if (!auth.identity) return auth.response;
  try {
    const { id } = await context.params;
    const [workOrder] = await db
      .select({ status: workOrders.status, executionDueAt: workOrders.executionDueAt, reviewDueAt: workOrders.reviewDueAt, slaStatus: workOrders.slaStatus })
      .from(workOrders)
      .where(eq(workOrders.id, id))
      .limit(1);
    if (!workOrder) return Response.json({ error: "This request no longer exists." }, { status: 404 });
    // Timing commitments are not commercially sensitive, but they still belong
    // to an outcome, so the same stake test applies as everywhere else.
    const access = await resolveOutcomeAccess(auth.identity, id);
    if (!access.canView) return forbidden();
    return Response.json({ sla: getSlaSnapshot(workOrder) });
  } catch (error) {
    console.error("sla lookup failed", error);
    return Response.json({ error: "The SLA status is temporarily unavailable." }, { status: 500 });
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireIdentity(request, { roles: ["operator", "admin"] });
  if (!auth.identity) return auth.response;
  try {
    const { id } = await context.params;
    const result = await escalateOverdueSla(id, `operator/${auth.identity.email}`);
    if (!result.ok) return Response.json({ error: result.error }, { status: result.status });
    await writeAudit({ actorId: auth.identity.userId, action: "sla_escalated", resourceType: "work_order", resourceId: id, request, data: { action: result.action, slaStatus: result.slaStatus } });
    return Response.json({ result });
  } catch (error) {
    console.error("sla escalation failed", error);
    return Response.json({ error: "Could not escalate the SLA. Please try again." }, { status: 500 });
  }
}
