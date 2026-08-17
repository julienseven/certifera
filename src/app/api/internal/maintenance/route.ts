import { timingSafeEqual } from "node:crypto";
import { getRequestIdentity, hasRole, writeAudit } from "@/lib/auth";
import { runMaintenance } from "@/lib/maintenance";
import { reportException } from "@/lib/observability";

function hasCronAuthorization(request: Request) {
  const configured = process.env.CERTIFERA_CRON_SECRET || process.env.CRON_SECRET;
  if (!configured) return false;
  // Compared in constant time: this is a bearer secret, and `===` on strings
  // stops at the first byte that differs.
  const presented = Buffer.from(request.headers.get("authorization") || "");
  const expected = Buffer.from(`Bearer ${configured}`);
  return presented.length === expected.length && timingSafeEqual(presented, expected);
}

// The hourly sweep is bounded per run, but each SLA escalation is its own
// transaction, so give the function room beyond the 10s default.
export const maxDuration = 60;

async function handle(request: Request) {
  const cronAuthorized = hasCronAuthorization(request);
  // A GET is whatever an attacker can make a browser fetch — a link, an image,
  // a prefetch — and the session cookie is same-site lax, so a top-level
  // navigation still carries an admin's credential to it. The scheduler proves
  // itself with a header nobody can make a browser send, so it keeps GET; the
  // ambient-credential path is restricted to the verb the console already uses.
  const identity = cronAuthorized || request.method !== "POST" ? null : await getRequestIdentity(request);
  if (!cronAuthorized && (!identity || !hasRole(identity, ["admin"]))) {
    return Response.json({ error: "Maintenance requires an admin session or CRON secret." }, { status: 401 });
  }
  try {
    const result = await runMaintenance(cronAuthorized ? "cron" : `admin/${identity?.email}`);
    if (identity) await writeAudit({ actorId: identity.userId, action: "maintenance_run", resourceType: "system", resourceId: result.runId, request, data: { overdueChecked: result.overdueChecked } });
    return Response.json({ ok: true, result });
  } catch (error) {
    // Reported, not just logged. A console line goes to the platform's log
    // stream, which nobody reads on a schedule — this sweep failed hourly for
    // two days on a missing column and the only trace was a red workflow. The
    // operational event is what the alert webhook and the Operations Center
    // read, and a sweep that is not running means SLA breaches are not being
    // escalated at all.
    await reportException({ service: "maintenance", code: "maintenance_run_failed", error, resourceType: "system" });
    return Response.json({ error: "Maintenance execution failed." }, { status: 500 });
  }
}

/**
 * Vercel Cron invokes its target with GET, so a POST-only route would have
 * returned 405 on every scheduled run and the sweep would never have fired.
 * POST stays for manual admin triggering — and is the only verb that accepts a
 * session, per the note above.
 */
export const GET = handle;
export const POST = handle;
