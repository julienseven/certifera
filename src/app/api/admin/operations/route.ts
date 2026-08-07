import { db } from "@/db";
import { maintenanceRuns, operationalEvents, payouts, stripeWebhookEvents, users, workOrders } from "@/db/schema";
import { requireIdentity, writeAudit } from "@/lib/auth";
import { evidenceStorageStatus } from "@/lib/evidence-storage";
import { mailDeliveryStatus } from "@/lib/mailer";
import { observabilityStatus } from "@/lib/observability";
import { and, count, desc, eq, isNull } from "drizzle-orm";

export async function GET(request: Request) {
  const auth = await requireIdentity(request, { roles: ["admin"] });
  if (!auth.identity) return auth.response;
  const [workOrderRows, userRows, payoutRows, unresolvedEvents, latestEvents, latestRuns, latestStripeEvents] = await Promise.all([
    db.select({ status: workOrders.status, total: count() }).from(workOrders).groupBy(workOrders.status),
    db.select({ role: users.role, total: count() }).from(users).groupBy(users.role),
    db.select({ status: payouts.status, total: count() }).from(payouts).groupBy(payouts.status),
    db.select({ total: count() }).from(operationalEvents).where(and(isNull(operationalEvents.resolvedAt), eq(operationalEvents.level, "critical"))),
    db.select().from(operationalEvents).orderBy(desc(operationalEvents.createdAt)).limit(20),
    db.select().from(maintenanceRuns).orderBy(desc(maintenanceRuns.startedAt)).limit(10),
    db.select().from(stripeWebhookEvents).orderBy(desc(stripeWebhookEvents.createdAt)).limit(10),
  ]);
  return Response.json({
    readiness: {
      evidence: evidenceStorageStatus(),
      mail: mailDeliveryStatus(),
      observability: observabilityStatus(),
      cronConfigured: Boolean(process.env.CERTIFERA_CRON_SECRET || process.env.CRON_SECRET),
      mfaEncryptionConfigured: Boolean(process.env.CERTIFERA_FIELD_ENCRYPTION_KEY),
      stripe: { mode: process.env.CERTIFERA_SETTLEMENT_MODE || "sandbox", secretConfigured: Boolean(process.env.CERTIFERA_STRIPE_SECRET_KEY), webhookConfigured: Boolean(process.env.CERTIFERA_STRIPE_WEBHOOK_SECRET) },
    },
    metrics: { workOrders: workOrderRows, users: userRows, payouts: payoutRows, unresolvedCriticalAlerts: unresolvedEvents[0]?.total ?? 0 },
    events: latestEvents,
    maintenanceRuns: latestRuns,
    stripeEvents: latestStripeEvents,
  });
}

export async function PATCH(request: Request) {
  const auth = await requireIdentity(request, { roles: ["admin"] });
  if (!auth.identity) return auth.response;
  try {
    const body = (await request.json()) as { eventId?: unknown; action?: unknown };
    const eventId = typeof body.eventId === "string" ? body.eventId : "";
    const action = typeof body.action === "string" ? body.action : "";
    if (!eventId || action !== "resolve") return Response.json({ error: "Use action=resolve with an operational event ID." }, { status: 400 });
    const [event] = await db.update(operationalEvents).set({ resolvedAt: new Date() }).where(eq(operationalEvents.id, eventId)).returning({ id: operationalEvents.id });
    if (!event) return Response.json({ error: "Operational event not found." }, { status: 404 });
    await writeAudit({ actorId: auth.identity.userId, action: "operational_event_resolved", resourceType: "operational_event", resourceId: event.id, request });
    return Response.json({ ok: true });
  } catch {
    return Response.json({ error: "Could not resolve the operational event." }, { status: 500 });
  }
}
