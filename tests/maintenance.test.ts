import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/db";
import {
  apiKeys,
  apiRateLimits,
  emailVerificationTokens,
  maintenanceRuns,
  passwordResetTokens,
  relayBids,
  relays,
  sessions,
  users,
  workOrders,
} from "@/db/schema";
import { runMaintenance } from "@/lib/maintenance";
import { eq } from "drizzle-orm";

/**
 * Exercises runMaintenance() over the real database: it should reopen an
 * execution that missed its SLA window, escalate a review that missed its
 * window, and clear expired sessions/tokens/rate-limit windows/demo keys —
 * as documented in docs/README.md's "Reliability and maintenance" section.
 */

const suffix = randomUUID().slice(0, 8);
const hourMs = 60 * 60 * 1000;

let relayId: string;
let userId: string;
let executionOrderId: string;
let reviewOrderId: string;
let selectedBidId: string;
let validSessionId: string;
let validVerificationId: string;
let validResetId: string;
let expiredRateLimitId: string;
let freshRateLimitId: string;
let unexpiredDemoKeyId: string;
let expiredNamedKeyId: string;

beforeAll(async () => {
  const [relay] = await db
    .insert(relays)
    .values({
      handle: `maint-relay-${suffix}`,
      zone: "Test zone",
      specialty: "maintenance test",
      coverageCategories: ["Infrastructure"],
      availabilityStatus: "available",
      onboardingStatus: "approved",
      active: true,
      reputation: 50,
    })
    .returning();
  relayId = relay.id;

  const [user] = await db
    .insert(users)
    .values({
      email: `maint-user-${suffix}@certifera.local`,
      passwordHash: "unusable:unusable",
      displayName: "Maintenance Test User",
      role: "operator",
      status: "active",
    })
    .returning();
  userId = user.id;

  const [executionOrder] = await db
    .insert(workOrders)
    .values({
      externalRef: `maint-exec-${suffix}`,
      title: "Overdue execution",
      category: "Infrastructure",
      location: "Test City",
      rewardCents: 8000,
      requester: "Maintenance test",
      status: "matched",
      proofRequirements: ["photo"],
      selectedRelayId: relayId,
      executionDueAt: new Date(Date.now() - hourMs),
      reviewDueAt: null,
      slaStatus: "on_track",
    })
    .returning();
  executionOrderId = executionOrder.id;

  const [bid] = await db
    .insert(relayBids)
    .values({ workOrderId: executionOrderId, relayId, quoteCents: 8000, etaMinutes: 45, status: "selected" })
    .returning();
  selectedBidId = bid.id;

  const [reviewOrder] = await db
    .insert(workOrders)
    .values({
      externalRef: `maint-review-${suffix}`,
      title: "Overdue review",
      category: "Infrastructure",
      location: "Test City",
      rewardCents: 6000,
      requester: "Maintenance test",
      status: "review",
      proofRequirements: ["photo"],
      selectedRelayId: relayId,
      executionDueAt: null,
      reviewDueAt: new Date(Date.now() - hourMs),
      slaStatus: "on_track",
    })
    .returning();
  reviewOrderId = reviewOrder.id;

  await db.insert(sessions).values({ userId, tokenHash: `expired-session-${suffix}`, expiresAt: new Date(Date.now() - hourMs) });
  const [validSession] = await db.insert(sessions).values({ userId, tokenHash: `valid-session-${suffix}`, expiresAt: new Date(Date.now() + hourMs) }).returning();
  validSessionId = validSession.id;

  await db.insert(emailVerificationTokens).values({ userId, tokenHash: `expired-verify-${suffix}`, expiresAt: new Date(Date.now() - hourMs) });
  const [validVerification] = await db.insert(emailVerificationTokens).values({ userId, tokenHash: `valid-verify-${suffix}`, expiresAt: new Date(Date.now() + hourMs) }).returning();
  validVerificationId = validVerification.id;

  await db.insert(passwordResetTokens).values({ userId, tokenHash: `expired-reset-${suffix}`, expiresAt: new Date(Date.now() - hourMs) });
  const [validReset] = await db.insert(passwordResetTokens).values({ userId, tokenHash: `valid-reset-${suffix}`, expiresAt: new Date(Date.now() + hourMs) }).returning();
  validResetId = validReset.id;

  const [expiredRateLimit] = await db
    .insert(apiRateLimits)
    .values({ subject: `maint-subject-${suffix}`, route: "/api/test", windowStart: new Date(Date.now() - 3 * hourMs), count: 5 })
    .returning();
  expiredRateLimitId = expiredRateLimit.id;
  const [freshRateLimit] = await db
    .insert(apiRateLimits)
    .values({ subject: `maint-subject-fresh-${suffix}`, route: "/api/test", windowStart: new Date(), count: 1 })
    .returning();
  freshRateLimitId = freshRateLimit.id;

  await db.insert(apiKeys).values({ userId, name: "Demo (auto-issued)", prefix: `demoexp${suffix}`, tokenHash: `demo-expired-hash-${suffix}`, expiresAt: new Date(Date.now() - hourMs) });
  const [unexpiredDemoKey] = await db
    .insert(apiKeys)
    .values({ userId, name: "Demo (auto-issued)", prefix: `demovld${suffix}`, tokenHash: `demo-valid-hash-${suffix}`, expiresAt: new Date(Date.now() + hourMs) })
    .returning();
  unexpiredDemoKeyId = unexpiredDemoKey.id;
  // Same expiry as the deleted demo key, but a different name — must survive the sweep,
  // proving the delete is scoped to auto-issued demo keys and not just "any expired key".
  const [expiredNamedKey] = await db
    .insert(apiKeys)
    .values({ userId, name: "Not a demo key", prefix: `namedexp${suffix}`, tokenHash: `named-expired-hash-${suffix}`, expiresAt: new Date(Date.now() - hourMs) })
    .returning();
  expiredNamedKeyId = expiredNamedKey.id;
});

afterAll(async () => {
  await db.delete(workOrders).where(eq(workOrders.id, executionOrderId));
  await db.delete(workOrders).where(eq(workOrders.id, reviewOrderId));
  await db.delete(apiRateLimits).where(eq(apiRateLimits.id, freshRateLimitId));
  await db.delete(apiRateLimits).where(eq(apiRateLimits.id, expiredRateLimitId)); // defensive, in case the sweep never ran
  await db.delete(users).where(eq(users.id, userId)); // cascades sessions/tokens/api keys
  await db.delete(relays).where(eq(relays.id, relayId));
});

describe("scheduled maintenance", () => {
  it("reopens overdue execution, escalates overdue review, and clears expired auth/session/rate-limit state", async () => {
    const result = await runMaintenance(`test-${suffix}`);

    expect(result.overdueChecked).toBeGreaterThanOrEqual(2);
    expect(result.executionReopened).toBeGreaterThanOrEqual(1);
    expect(result.reviewEscalated).toBeGreaterThanOrEqual(1);
    expect(result.expiredSessionsDeleted).toBeGreaterThanOrEqual(1);
    expect(result.expiredVerificationTokensDeleted).toBeGreaterThanOrEqual(1);
    expect(result.expiredResetTokensDeleted).toBeGreaterThanOrEqual(1);
    expect(result.expiredRateWindowsDeleted).toBeGreaterThanOrEqual(1);
    expect(result.expiredDemoKeysDeleted).toBeGreaterThanOrEqual(1);

    const [executionOrder] = await db.select().from(workOrders).where(eq(workOrders.id, executionOrderId));
    expect(executionOrder.status).toBe("open");
    expect(executionOrder.selectedRelayId).toBeNull();
    expect(executionOrder.executionDueAt).toBeNull();
    expect(executionOrder.reviewDueAt).toBeNull();
    expect(executionOrder.slaStatus).toBe("execution_breached");

    const [bid] = await db.select().from(relayBids).where(eq(relayBids.id, selectedBidId));
    expect(bid.status).toBe("expired");

    const [reviewOrder] = await db.select().from(workOrders).where(eq(workOrders.id, reviewOrderId));
    expect(reviewOrder.status).toBe("review");
    expect(reviewOrder.slaStatus).toBe("review_breached");

    const remainingSessions = await db.select().from(sessions).where(eq(sessions.userId, userId));
    expect(remainingSessions.map((session) => session.id)).toEqual([validSessionId]);

    const remainingVerification = await db.select().from(emailVerificationTokens).where(eq(emailVerificationTokens.userId, userId));
    expect(remainingVerification.map((token) => token.id)).toEqual([validVerificationId]);

    const remainingResets = await db.select().from(passwordResetTokens).where(eq(passwordResetTokens.userId, userId));
    expect(remainingResets.map((token) => token.id)).toEqual([validResetId]);

    const remainingExpiredWindow = await db.select().from(apiRateLimits).where(eq(apiRateLimits.id, expiredRateLimitId));
    expect(remainingExpiredWindow).toHaveLength(0);
    const remainingFreshWindow = await db.select().from(apiRateLimits).where(eq(apiRateLimits.id, freshRateLimitId));
    expect(remainingFreshWindow).toHaveLength(1);

    const remainingKeys = await db.select().from(apiKeys).where(eq(apiKeys.userId, userId));
    expect(remainingKeys.map((key) => key.id).sort()).toEqual([unexpiredDemoKeyId, expiredNamedKeyId].sort());

    const [run] = await db.select().from(maintenanceRuns).where(eq(maintenanceRuns.id, result.runId));
    expect(run.status).toBe("completed");
    expect(run.result).toMatchObject({
      overdueChecked: result.overdueChecked,
      executionReopened: result.executionReopened,
      reviewEscalated: result.reviewEscalated,
    });
    expect(run.finishedAt).not.toBeNull();
  });
});
