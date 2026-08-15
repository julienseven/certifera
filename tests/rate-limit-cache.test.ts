import { randomUUID } from "node:crypto";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { db, pool } from "@/db";
import { apiKeys, apiRateLimits, users } from "@/db/schema";
import { createApiToken, enforceRateLimit, requireIdentity } from "@/lib/auth";
import { knownBreach, rememberBreach, resetRateLimitBreaches, trackedBreachCount, windowEndsAt } from "@/lib/rate-limit-cache";
import { eq, inArray, like } from "drizzle-orm";

/**
 * A caller past its limit used to cost the database exactly as much as a caller
 * being served: every rejected request still took a row lock on the hot
 * (subject, route, window) bucket and wrote to it. With a small connection
 * pool, one abusive caller could degrade everyone else while being refused.
 *
 * The fix caches the database's own denial until the window rolls over. These
 * tests assert the two things that makes true: that repeat offenders stop
 * issuing queries, and that the cache can only ever deny, never grant.
 */

const subjects: string[] = [];
const userIds: string[] = [];

/** Counts statements issued through the shared pool while `run` executes. */
async function countQueries(run: () => Promise<unknown>) {
  const original = pool.query.bind(pool);
  let count = 0;
  (pool as any).query = (...args: unknown[]) => {
    count += 1;
    return (original as any)(...args);
  };
  try {
    await run();
  } finally {
    (pool as any).query = original;
  }
  return count;
}

function newSubject() {
  const subject = `test:${randomUUID()}`;
  subjects.push(subject);
  return subject;
}

afterEach(() => {
  resetRateLimitBreaches();
});

afterAll(async () => {
  if (subjects.length) await db.delete(apiRateLimits).where(inArray(apiRateLimits.subject, subjects));
  await db.delete(apiRateLimits).where(like(apiRateLimits.subject, "key:%"));
  for (const id of userIds) await db.delete(users).where(eq(users.id, id));
});

describe("breach cache", () => {
  it("reports no breach for a subject the database has not refused", () => {
    expect(knownBreach("subject", "/api/requests")).toBeNull();
  });

  it("repeats a denial until the window rolls over, then forgets it", () => {
    const now = Date.now();
    rememberBreach("subject", "/api/requests", now);

    expect(knownBreach("subject", "/api/requests", now)).toBeGreaterThan(0);
    // One millisecond before the window boundary the denial still stands.
    expect(knownBreach("subject", "/api/requests", windowEndsAt(now) - 1)).toBeGreaterThan(0);
    // At the boundary the caller gets a fresh budget.
    expect(knownBreach("subject", "/api/requests", windowEndsAt(now))).toBeNull();
  });

  it("keeps denials separate per route, so one hot route cannot block another", () => {
    const now = Date.now();
    rememberBreach("subject", "/api/evidence", now);
    expect(knownBreach("subject", "/api/evidence", now)).toBeGreaterThan(0);
    expect(knownBreach("subject", "/api/requests", now)).toBeNull();
  });

  it("bounds how many breaches it will track", () => {
    const now = Date.now();
    for (let index = 0; index < 10_050; index += 1) rememberBreach(`subject-${index}`, "/api/requests", now);
    expect(trackedBreachCount()).toBeLessThanOrEqual(10_000);
  });
});

describe("enforceRateLimit", () => {
  it("stops querying the database once a subject is over its limit", async () => {
    const subject = newSubject();
    const route = "auth:test";

    // Spend the budget. Each of these must reach the shared counter.
    const spend = await countQueries(async () => {
      for (let index = 0; index < 3; index += 1) await enforceRateLimit({ subject, route, limit: 2 });
    });
    expect(spend).toBeGreaterThanOrEqual(3);

    // Now refused, and refusal must cost nothing.
    const afterBreach = await countQueries(async () => {
      for (let index = 0; index < 5; index += 1) {
        const result = await enforceRateLimit({ subject, route, limit: 2 });
        expect(result.allowed).toBe(false);
        expect(result.retryAfter).toBeGreaterThan(0);
      }
    });
    expect(afterBreach).toBe(0);
  });

  it("never grants access from cache alone", async () => {
    const subject = newSubject();
    const route = "auth:test";

    // A cold cache must still consult the shared counter rather than assuming
    // the caller is under its limit.
    const queries = await countQueries(() => enforceRateLimit({ subject, route, limit: 5 }));
    expect(queries).toBeGreaterThan(0);
  });

  it("still allows a caller under its limit", async () => {
    const subject = newSubject();
    const first = await enforceRateLimit({ subject, route: "auth:test", limit: 5 });
    expect(first).toMatchObject({ allowed: true });
    expect(first.remaining).toBe(4);
  });
});

describe("requireIdentity", () => {
  it("refuses a known-breached credential without resolving it", async () => {
    const [user] = await db
      .insert(users)
      .values({
        email: `ratelimit-${randomUUID().slice(0, 8)}@certifera.local`,
        passwordHash: "unusable:unusable",
        displayName: "Rate Limit User",
        role: "operator",
        status: "active",
        emailVerifiedAt: new Date(),
      })
      .returning();
    userIds.push(user.id);

    const generated = createApiToken();
    await db.insert(apiKeys).values({ userId: user.id, name: "Rate limit test", prefix: generated.prefix, tokenHash: generated.tokenHash, scopes: ["*"] });

    const makeRequest = () =>
      new Request("http://localhost/api/requests", { headers: { authorization: `Bearer ${generated.token}` } });

    // Warm path: resolving the credential necessarily queries.
    const allowed = await requireIdentity(makeRequest());
    expect(allowed.identity).not.toBeNull();

    // Simulate the database having refused this credential for this window.
    const route = "/api/requests";
    const { createHash } = await import("node:crypto");
    rememberBreach(`key:${createHash("sha256").update(generated.token).digest("hex")}`, route);

    const queries = await countQueries(async () => {
      const refused = await requireIdentity(makeRequest());
      expect(refused.identity).toBeNull();
      expect(refused.response?.status).toBe(429);
      // The retry-after must reflect the remaining window, not a fixed guess.
      expect(Number(refused.response?.headers.get("retry-after"))).toBeGreaterThan(0);
    });

    // The credential was never looked up and the bucket was never charged.
    expect(queries).toBe(0);
  });
});
