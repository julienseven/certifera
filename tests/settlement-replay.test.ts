import { createHmac, randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { apiKeys, executionEvents, operationalEvents, payouts, proofBundles, relays, stripeWebhookEvents, users, workOrders } from "@/db/schema";
import { createApiToken } from "@/lib/auth";
import { and, eq } from "drizzle-orm";
import * as lifecycle from "@/lib/lifecycle";
import * as settlement from "@/lib/settlement";

import { PATCH as releasePayout } from "@/app/api/requests/[id]/settlement/route";
import { POST as stripeWebhook } from "@/app/api/webhooks/stripe/route";

/**
 * Replay and ordering on the money path.
 *
 * The race suite covers two callers of the release route. What is covered here
 * is the other two ways the same payout gets touched more than once: Stripe
 * redelivering an event whose first delivery did not finish, and the provider's
 * verdict arriving by webhook while the route that caused it is still running.
 * Neither is a race between two operators, so neither is observable from the
 * release route alone.
 */

const suffix = randomUUID().slice(0, 8);
const webhookSecret = `whsec_replay_${suffix}`;
let relayId: string;
let operatorUserId: string;
let operatorToken: string;
const createdWorkOrders: string[] = [];
const createdEventIds: string[] = [];

function signedWebhook(event: Record<string, unknown>) {
  const payload = JSON.stringify(event);
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature = createHmac("sha256", webhookSecret).update(`${timestamp}.${payload}`).digest("hex");
  return new Request("http://localhost/api/webhooks/stripe", {
    method: "POST",
    headers: { "stripe-signature": `t=${timestamp},v1=${signature}`, "content-type": "application/json" },
    body: payload,
  });
}

function transferEvent(type: string, payoutId: string, extra: Record<string, unknown> = {}) {
  const id = `evt_replay_${randomUUID().slice(0, 12)}`;
  createdEventIds.push(id);
  return { id, type, data: { object: { id: `tr_${randomUUID().slice(0, 12)}`, metadata: { payout_id: payoutId }, ...extra } } };
}

function releaseRequest(workOrderId: string) {
  return releasePayout(
    new Request(`http://localhost/api/requests/${workOrderId}/settlement`, {
      method: "PATCH",
      headers: { authorization: `Bearer ${operatorToken}` },
    }),
    { params: Promise.resolve({ id: workOrderId }) },
  );
}

async function seedPayout(status: string) {
  const [workOrder] = await db
    .insert(workOrders)
    .values({
      externalRef: `settle-replay-${randomUUID().slice(0, 8)}`,
      title: "Settlement replay outcome",
      category: "Infrastructure",
      location: "Test City",
      rewardCents: 10000,
      requester: "test/settlement",
      status: "verified",
      proofRequirements: [],
      selectedRelayId: relayId,
    })
    .returning();
  createdWorkOrders.push(workOrder.id);

  const [proof] = await db
    .insert(proofBundles)
    .values({ workOrderId: workOrder.id, relayId, observation: "Replay proof bundle.", attestationHash: randomUUID(), verificationScore: 90, status: "verified" })
    .returning();

  const [payout] = await db
    .insert(payouts)
    .values({
      workOrderId: workOrder.id,
      proofBundleId: proof.id,
      relayId,
      grossCents: 8000,
      protocolFeeCents: 400,
      netCents: 7600,
      status,
      releaseClaimedAt: status === "releasing" ? new Date() : null,
      releaseAttemptId: status === "releasing" ? randomUUID() : null,
    })
    .returning();

  return { workOrderId: workOrder.id, payoutId: payout.id };
}

function lifecycleEvents(workOrderId: string, type: string) {
  return db.select({ id: executionEvents.id }).from(executionEvents).where(and(eq(executionEvents.workOrderId, workOrderId), eq(executionEvents.type, type)));
}

beforeAll(async () => {
  process.env.CERTIFERA_SETTLEMENT_MODE = "sandbox";
  process.env.CERTIFERA_STRIPE_WEBHOOK_SECRET = webhookSecret;

  const [relay] = await db
    .insert(relays)
    .values({ handle: `settle-replay-relay-${suffix}`, zone: "Test zone", specialty: "replay", coverageCategories: ["Infrastructure"], active: true })
    .returning();
  relayId = relay.id;

  const [operator] = await db
    .insert(users)
    .values({ email: `settle-replay-${suffix}@certifera.local`, passwordHash: "unusable:unusable", displayName: "Replay Operator", role: "operator", status: "active", emailVerifiedAt: new Date() })
    .returning();
  operatorUserId = operator.id;

  const generated = createApiToken();
  operatorToken = generated.token;
  await db.insert(apiKeys).values({ userId: operatorUserId, name: "Settlement replay test", prefix: generated.prefix, tokenHash: generated.tokenHash, scopes: ["*"] });
});

afterAll(async () => {
  for (const id of createdEventIds) await db.delete(stripeWebhookEvents).where(eq(stripeWebhookEvents.stripeEventId, id));
  for (const id of createdWorkOrders) await db.delete(workOrders).where(eq(workOrders.id, id));
  if (operatorUserId) await db.delete(users).where(eq(users.id, operatorUserId));
  if (relayId) await db.delete(relays).where(eq(relays.id, relayId));
});

describe("Stripe webhook redelivery", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("reprocesses a redelivered event whose first delivery never finished", async () => {
    const { workOrderId, payoutId } = await seedPayout("releasing");
    const event = transferEvent("transfer.created", payoutId);

    // The first delivery dies after the receipt is recorded but before the
    // payout is reconciled — a lost connection, a killed lambda, anything that
    // interrupts the handler partway.
    vi.spyOn(lifecycle, "recordLifecycleEvent").mockRejectedValueOnce(new Error("connection terminated"));

    const first = await stripeWebhook(signedWebhook(event));
    expect(first.status).toBe(500);

    const [afterFirst] = await db.select().from(payouts).where(eq(payouts.id, payoutId));
    expect(afterFirst.status).toBe("releasing");

    // Stripe retries a non-2xx. That retry has to actually do the work: the
    // payout is still mid-release and this event is the only thing that says
    // the transfer landed.
    const second = await stripeWebhook(signedWebhook(event));
    expect(second.status).toBe(200);
    await expect(second.json()).resolves.toMatchObject({ reconciled: true });

    const [afterSecond] = await db.select().from(payouts).where(eq(payouts.id, payoutId));
    expect(afterSecond.status).toBe("released");
    expect(afterSecond.providerEventId).toBe(event.id);
    expect(afterSecond.settlementRef).toBe(event.data.object.id);
    expect(await lifecycleEvents(workOrderId, "stripe_transfer_reconciled")).toHaveLength(1);
  });

  it("ignores a redelivery of an event that was fully processed", async () => {
    const { workOrderId, payoutId } = await seedPayout("releasing");
    const event = transferEvent("transfer.created", payoutId);

    const first = await stripeWebhook(signedWebhook(event));
    await expect(first.json()).resolves.toMatchObject({ reconciled: true });
    const [afterFirst] = await db.select().from(payouts).where(eq(payouts.id, payoutId));

    const second = await stripeWebhook(signedWebhook(event));
    await expect(second.json()).resolves.toMatchObject({ duplicate: true });

    // Nothing moved on the replay, and the ledger still names the first landing.
    const [afterSecond] = await db.select().from(payouts).where(eq(payouts.id, payoutId));
    expect(afterSecond.releasedAt?.getTime()).toBe(afterFirst.releasedAt?.getTime());
    expect(afterSecond.reconciledAt?.getTime()).toBe(afterFirst.reconciledAt?.getTime());
    expect(await lifecycleEvents(workOrderId, "stripe_transfer_reconciled")).toHaveLength(1);
  });

  it("processes one of two deliveries that arrive at the same instant", async () => {
    const { workOrderId, payoutId } = await seedPayout("releasing");
    const event = transferEvent("transfer.created", payoutId);

    const responses = await Promise.all([stripeWebhook(signedWebhook(event)), stripeWebhook(signedWebhook(event))]);
    const bodies = await Promise.all(responses.map((response) => response.json()));

    expect(responses.map((response) => response.status)).toEqual([200, 200]);
    expect(bodies.filter((body) => body.reconciled)).toHaveLength(1);
    expect(bodies.filter((body) => body.duplicate)).toHaveLength(1);

    const [row] = await db.select().from(payouts).where(eq(payouts.id, payoutId));
    expect(row.status).toBe("released");
    expect(await lifecycleEvents(workOrderId, "stripe_transfer_reconciled")).toHaveLength(1);
  });
});

describe("provider verdict arriving mid-release", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("does not record a release over a transfer the provider has already failed", async () => {
    const { workOrderId, payoutId } = await seedPayout("authorized");

    // The claim commits before the provider is called, so the payout is
    // reachable by the webhook for the whole duration of the transfer. Firing
    // the failure from inside the provider call puts it exactly there: after the
    // claim, before the release is recorded.
    let failureEventId = "";
    vi.spyOn(settlement, "releaseSettlement").mockImplementation(async (input) => {
      const event = transferEvent("transfer.failed", payoutId, { failure_message: "The destination account cannot receive transfers." });
      failureEventId = event.id;
      const webhook = await stripeWebhook(signedWebhook(event));
      expect(webhook.status).toBe(200);
      return { provider: "sandbox" as const, reference: `cert-sandbox-${input.attemptId.slice(0, 12)}` };
    });

    const response = await releaseRequest(workOrderId);

    // Stripe said the money did not move. Recording "released" on top of that
    // would leave the ledger claiming a relay was paid when it was not, with
    // nothing raised to anyone.
    const [row] = await db.select().from(payouts).where(eq(payouts.id, payoutId));
    expect(row.status).toBe("failed");
    expect(row.failureReason).toContain("cannot receive transfers");
    expect(row.providerEventId).toBe(failureEventId);
    expect(row.releasedAt).toBeNull();

    expect(response.status).toBe(500);
    const alerts = await db
      .select({ level: operationalEvents.level })
      .from(operationalEvents)
      .where(and(eq(operationalEvents.code, "release_recorded_without_claim"), eq(operationalEvents.resourceId, payoutId)));
    expect(alerts).toHaveLength(1);
    expect(alerts[0].level).toBe("critical");
    expect(await lifecycleEvents(workOrderId, "payout_released")).toHaveLength(0);
  });
});
