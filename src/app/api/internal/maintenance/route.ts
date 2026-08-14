import { getRequestIdentity, hasRole, writeAudit } from "@/lib/auth";
import { runMaintenance } from "@/lib/maintenance";

function hasCronAuthorization(request: Request) {
  const configured = process.env.CERTIFERA_CRON_SECRET || process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization") || "";
  return Boolean(configured && authorization === `Bearer ${configured}`);
}

// The hourly sweep is bounded per run, but each SLA escalation is its own
// transaction, so give the function room beyond the 10s default.
export const maxDuration = 60;

async function handle(request: Request) {
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

/**
 * Vercel Cron invokes its target with GET, so a POST-only route would have
 * returned 405 on every scheduled run and the sweep would never have fired.
 * POST stays for manual admin triggering.
 */
export const GET = handle;
export const POST = handle;
