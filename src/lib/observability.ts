import { db } from "@/db";
import { operationalEvents } from "@/db/schema";

export type OperationalLevel = "info" | "warning" | "error" | "critical";

export async function recordOperationalEvent(input: {
  level: OperationalLevel;
  service: string;
  code: string;
  message: string;
  resourceType?: string | null;
  resourceId?: string | null;
  data?: Record<string, string | number | boolean | null>;
}) {
  try {
    const [event] = await db.insert(operationalEvents).values({
      level: input.level,
      service: input.service,
      code: input.code,
      message: input.message.slice(0, 500),
      resourceType: input.resourceType ?? null,
      resourceId: input.resourceId ?? null,
      data: input.data ?? {},
    }).returning({ id: operationalEvents.id, createdAt: operationalEvents.createdAt });

    const alertWebhook = process.env.CERTIFERA_ALERT_WEBHOOK;
    if (alertWebhook && (input.level === "error" || input.level === "critical")) {
      void fetch(alertWebhook, {
        method: "POST",
        headers: { "content-type": "application/json", ...(process.env.CERTIFERA_ALERT_WEBHOOK_TOKEN ? { authorization: `Bearer ${process.env.CERTIFERA_ALERT_WEBHOOK_TOKEN}` } : {}) },
        body: JSON.stringify({ product: "certifera", event: { ...input, id: event.id, occurredAt: event.createdAt.toISOString() } }),
        signal: AbortSignal.timeout(5_000),
      }).catch(() => undefined);
    }
    return event;
  } catch (error) {
    console.error("operational event write failed", error);
    return null;
  }
}

export async function reportException(input: {
  service: string;
  code: string;
  error: unknown;
  resourceType?: string | null;
  resourceId?: string | null;
  data?: Record<string, string | number | boolean | null>;
}) {
  const message = input.error instanceof Error ? input.error.message : "Unknown application error";
  return recordOperationalEvent({
    level: "error",
    service: input.service,
    code: input.code,
    message,
    resourceType: input.resourceType,
    resourceId: input.resourceId,
    data: input.data,
  });
}

export function observabilityStatus() {
  return { alertWebhookConfigured: Boolean(process.env.CERTIFERA_ALERT_WEBHOOK), alertProvider: process.env.CERTIFERA_ALERT_WEBHOOK ? "webhook" : "database-only" };
}
