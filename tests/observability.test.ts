import { createServer, type IncomingHttpHeaders, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { operationalEvents } from "@/db/schema";
import { observabilityStatus, recordOperationalEvent, reportException } from "@/lib/observability";
import { eq } from "drizzle-orm";

let server: Server;
let serverUrl: string;
let received: Array<{ headers: IncomingHttpHeaders; body: Record<string, unknown> }>;

let savedWebhook: string | undefined;
let savedToken: string | undefined;

beforeAll(async () => {
  server = createServer((req, res) => {
    let raw = "";
    req.on("data", (chunk) => { raw += chunk; });
    req.on("end", () => {
      received.push({ headers: req.headers, body: raw ? JSON.parse(raw) : {} });
      res.writeHead(200);
      res.end();
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as AddressInfo;
  serverUrl = `http://127.0.0.1:${address.port}/hook`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

beforeEach(() => {
  received = [];
  savedWebhook = process.env.CERTIFERA_ALERT_WEBHOOK;
  savedToken = process.env.CERTIFERA_ALERT_WEBHOOK_TOKEN;
  delete process.env.CERTIFERA_ALERT_WEBHOOK;
  delete process.env.CERTIFERA_ALERT_WEBHOOK_TOKEN;
});

afterEach(async () => {
  if (savedWebhook === undefined) delete process.env.CERTIFERA_ALERT_WEBHOOK;
  else process.env.CERTIFERA_ALERT_WEBHOOK = savedWebhook;
  if (savedToken === undefined) delete process.env.CERTIFERA_ALERT_WEBHOOK_TOKEN;
  else process.env.CERTIFERA_ALERT_WEBHOOK_TOKEN = savedToken;
});

async function waitFor(predicate: () => boolean, timeoutMs = 2000) {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) throw new Error("timed out waiting for condition");
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

async function cleanupEvent(id: string) {
  await db.delete(operationalEvents).where(eq(operationalEvents.id, id));
}

describe("observabilityStatus", () => {
  it("reports database-only when no alert webhook is configured", () => {
    expect(observabilityStatus()).toEqual({ alertWebhookConfigured: false, alertProvider: "database-only" });
  });

  it("reports webhook delivery once CERTIFERA_ALERT_WEBHOOK is set", () => {
    process.env.CERTIFERA_ALERT_WEBHOOK = serverUrl;
    expect(observabilityStatus()).toEqual({ alertWebhookConfigured: true, alertProvider: "webhook" });
  });
});

describe("recordOperationalEvent", () => {
  it("persists an operational event with the supplied fields", async () => {
    const event = await recordOperationalEvent({
      level: "warning",
      service: "test-service",
      code: "test_code",
      message: "something worth noting",
      resourceType: "work_order",
      resourceId: "wo-123",
      data: { attempt: 2 },
    });
    if (!event) throw new Error("expected event to be recorded");

    const [row] = await db.select().from(operationalEvents).where(eq(operationalEvents.id, event.id));
    expect(row.level).toBe("warning");
    expect(row.service).toBe("test-service");
    expect(row.code).toBe("test_code");
    expect(row.message).toBe("something worth noting");
    expect(row.resourceType).toBe("work_order");
    expect(row.resourceId).toBe("wo-123");
    expect(row.data).toEqual({ attempt: 2 });
    await cleanupEvent(event.id);
  });

  it("defaults resourceType, resourceId, and data when they are omitted", async () => {
    const event = await recordOperationalEvent({ level: "info", service: "test-service", code: "no_extras", message: "minimal event" });
    if (!event) throw new Error("expected event to be recorded");

    const [row] = await db.select().from(operationalEvents).where(eq(operationalEvents.id, event.id));
    expect(row.resourceType).toBeNull();
    expect(row.resourceId).toBeNull();
    expect(row.data).toEqual({});
    await cleanupEvent(event.id);
  });

  it("truncates overly long messages to 500 characters", async () => {
    const longMessage = "x".repeat(600);
    const event = await recordOperationalEvent({ level: "error", service: "test-service", code: "long_message", message: longMessage });
    if (!event) throw new Error("expected event to be recorded");

    const [row] = await db.select().from(operationalEvents).where(eq(operationalEvents.id, event.id));
    expect(row.message).toHaveLength(500);
    expect(row.message).toBe("x".repeat(500));
    await cleanupEvent(event.id);
  });

  it("does not forward info or warning events even when a webhook is configured", async () => {
    process.env.CERTIFERA_ALERT_WEBHOOK = serverUrl;
    const infoEvent = await recordOperationalEvent({ level: "info", service: "test-service", code: "no_forward_info", message: "should stay local" });
    const warningEvent = await recordOperationalEvent({ level: "warning", service: "test-service", code: "no_forward_warning", message: "should also stay local" });
    if (!infoEvent || !warningEvent) throw new Error("expected events to be recorded");

    // Give any (wrongly) fired request a moment to land before asserting it never did.
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(received).toHaveLength(0);

    await cleanupEvent(infoEvent.id);
    await cleanupEvent(warningEvent.id);
  });

  it("forwards error and critical events to the configured alert webhook", async () => {
    process.env.CERTIFERA_ALERT_WEBHOOK = serverUrl;
    process.env.CERTIFERA_ALERT_WEBHOOK_TOKEN = "test-token";
    const event = await recordOperationalEvent({ level: "critical", service: "test-service", code: "forwarded", message: "page someone" });
    if (!event) throw new Error("expected event to be recorded");

    await waitFor(() => received.length === 1);
    const [request] = received;
    expect(request.headers.authorization).toBe("Bearer test-token");
    expect(request.body.product).toBe("certifera");
    const forwarded = request.body.event as Record<string, unknown>;
    expect(forwarded.id).toBe(event.id);
    expect(forwarded.level).toBe("critical");
    expect(forwarded.code).toBe("forwarded");

    await cleanupEvent(event.id);
  });

  it("keeps the database write intact even when the alert webhook is unreachable (additive guarantee)", async () => {
    process.env.CERTIFERA_ALERT_WEBHOOK = "http://127.0.0.1:1/unreachable";
    const event = await recordOperationalEvent({ level: "error", service: "test-service", code: "webhook_down", message: "db write must survive" });
    expect(event).not.toBeNull();
    if (!event) throw new Error("expected event to be recorded");

    const [row] = await db.select().from(operationalEvents).where(eq(operationalEvents.id, event.id));
    expect(row).toBeDefined();
    expect(row.level).toBe("error");
    expect(row.message).toBe("db write must survive");

    await cleanupEvent(event.id);
  });
});

describe("reportException", () => {
  it("records an error-level event using the Error message", async () => {
    const event = await reportException({ service: "test-service", code: "boom", error: new Error("kaboom"), resourceType: "payout", resourceId: "pay-1" });
    if (!event) throw new Error("expected event to be recorded");

    const [row] = await db.select().from(operationalEvents).where(eq(operationalEvents.id, event.id));
    expect(row.level).toBe("error");
    expect(row.message).toBe("kaboom");
    expect(row.resourceType).toBe("payout");
    expect(row.resourceId).toBe("pay-1");
    await cleanupEvent(event.id);
  });

  it("falls back to a generic message for non-Error values", async () => {
    const event = await reportException({ service: "test-service", code: "boom2", error: "just a string" });
    if (!event) throw new Error("expected event to be recorded");

    const [row] = await db.select().from(operationalEvents).where(eq(operationalEvents.id, event.id));
    expect(row.message).toBe("Unknown application error");
    await cleanupEvent(event.id);
  });
});
