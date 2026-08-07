import { getRequestIdentity, hasRole, writeAudit } from "@/lib/auth";
import { runMaintenance } from "@/lib/maintenance";

function hasCronAuthorization(request: Request) {
  const configured = process.env.CERTIFERA_CRON_SECRET || process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization") || "";
  return Boolean(configured && authorization === `Bearer ${configured}`);
}

export async function POST(request: Request) {
  const cronAuthorized = hasCronAuthorization(request);
  const identity = cronAuthorized ? null : await getRequestIdentity(request);
  if (!cronAuthorized && (!identity || !hasRole(identity, ["admin"]))) {
    return Response.json({ error: "Maintenance requires an admin session or CRON secret." }, { status: 401 });
  }
  try {
    const result = await runMaintenance(cronAuthorized ? "cron" : `admin/${identity?.email}`);
    if (identity) await writeAudit({ actorId: identity.userId, action: "maintenance_run", resourceType: "system", resourceId: result.runId, request, data: { overdueChecked: result.overdueChecked } });
    return Response.json({ ok: true, result });
  } catch (error) {
    console.error("maintenance run failed", error);
    return Response.json({ error: "Maintenance execution failed." }, { status: 500 });
  }
}
