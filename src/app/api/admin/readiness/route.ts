import { db } from "@/db";
import { deploymentChecks } from "@/db/schema";
import { requireIdentity, writeAudit } from "@/lib/auth";
import { getProductionReadiness, manualReadinessChecks } from "@/lib/readiness";
import { eq } from "drizzle-orm";

const manualKeys = new Set<string>(manualReadinessChecks.map(([key]) => key));

export async function GET(request: Request) {
  const auth = await requireIdentity(request, { roles: ["admin"] });
  if (!auth.identity) return auth.response;
  return Response.json(await getProductionReadiness());
}

export async function PATCH(request: Request) {
  const auth = await requireIdentity(request, { roles: ["admin"] });
  if (!auth.identity) return auth.response;
  try {
    const body = (await request.json()) as { checkKey?: unknown; status?: unknown; note?: unknown };
    const checkKey = typeof body.checkKey === "string" ? body.checkKey : "";
    const status = typeof body.status === "string" ? body.status : "";
    const note = typeof body.note === "string" ? body.note.trim().slice(0, 1000) : "";
    if (!manualKeys.has(checkKey)) return Response.json({ error: "This readiness check is not manually attestable." }, { status: 400 });
    if (status !== "passed" && status !== "pending" && status !== "blocked") return Response.json({ error: "Status must be passed, pending, or blocked." }, { status: 400 });
    if (status === "passed" && note.length < 12) return Response.json({ error: "Passing a launch check requires an evidence note of at least 12 characters." }, { status: 400 });
    const [existing] = await db.select().from(deploymentChecks).where(eq(deploymentChecks.checkKey, checkKey)).limit(1);
    if (existing) {
      await db.update(deploymentChecks).set({ status, note, verifiedByUserId: status === "passed" ? auth.identity.userId : null, verifiedAt: status === "passed" ? new Date() : null, updatedAt: new Date() }).where(eq(deploymentChecks.id, existing.id));
    } else {
      await db.insert(deploymentChecks).values({ checkKey, status, note, verifiedByUserId: status === "passed" ? auth.identity.userId : null, verifiedAt: status === "passed" ? new Date() : null });
    }
    await writeAudit({ actorId: auth.identity.userId, action: "readiness_check_updated", resourceType: "deployment_check", resourceId: checkKey, request, data: { status } });
    return Response.json(await getProductionReadiness());
  } catch (error) {
    console.error("readiness update failed", error);
    return Response.json({ error: "Could not update the readiness check." }, { status: 500 });
  }
}
