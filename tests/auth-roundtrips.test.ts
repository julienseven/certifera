import { randomUUID } from "node:crypto";
import { and, eq, like } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db, pool } from "@/db";
import { apiKeys, apiRateLimits, users } from "@/db/schema";

/**
 * requireIdentity() runs before every authenticated handler, so its statement
 * count is added to every API request. On a serverless deployment behind a
 * connection pooler each statement is its own 10-30ms network round trip, and
 * they are serialized: identity lookup, then the api_keys touch, then the
 * rate-limit upsert.
 *
 * These lock the preamble to a single round trip while keeping the properties
 * that make the limiter trustworthy: it is decided before the handler runs, it
 * never undercounts under concurrency, and it shares one bucket per route.
 */

const cookieJar = vi.hoisted(() => new Map<string, string>());
const SESSION_COOKIE = "certifera_session";

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => {
      const value = cookieJar.get(name);
      return value === undefined ? undefined : { name, value };
    },
    set: (name: string, value: string, options: Record<string, unknown> = {}) => {
      if (value === "" || options.maxAge === 0) cookieJar.delete(name);
      else cookieJar.set(name, value);
    },
  }),
}));

import { createApiToken, createSession, enforceRateLimit, requireIdentity } from "@/lib/auth";

/** Counts statements issued through the shared pool while `run` executes. */
async function countQueries(run: () => Promise<unknown>) {
  const original = pool.query.bind(pool);
  let count = 0;
  (pool as unknown as { query: unknown }).query = (...args: unknown[]) => {
    count += 1;
    return (original as (...a: unknown[]) => unknown)(...args);
  };
  try {
    await run();
  } finally {
    (pool as unknown as { query: unknown }).query = original;
  }
  return count;
}

const suffix = randomUUID().slice(0, 8);
let user: typeof users.$inferSelect;
let keyToken: string;
let keyId: string;

async function bucketCount(subject: string, routePattern: string) {
  const rows = await db
    .select({ count: apiRateLimits.count })
    .from(apiRateLimits)
    .where(and(eq(apiRateLimits.subject, subject), like(apiRateLimits.route, routePattern)));
  return { rows: rows.length, total: rows.reduce((sum, row) => sum + row.count, 0) };
}

beforeAll(async () => {
  [user] = await db
    .insert(users)
    .values({
      email: `roundtrip-${suffix}@certifera.local`,
      passwordHash: "unusable:unusable",
      displayName: "Round Trip",
      role: "operator",
      status: "active",
      emailVerifiedAt: new Date(),
    })
    .returning();

  const key = createApiToken();
  keyToken = key.token;
  const [inserted] = await db.insert(apiKeys).values({ userId: user.id, name: "roundtrip", prefix: key.prefix, tokenHash: key.tokenHash, scopes: ["*"] }).returning();
  keyId = inserted.id;
});

afterAll(async () => {
  await db.delete(apiRateLimits).where(eq(apiRateLimits.subject, `user:${user.id}`));
  await db.delete(users).where(eq(users.id, user.id));
});

beforeEach(() => {
  cookieJar.clear();
});

function bearer(url: string) {
  return new Request(url, { headers: { authorization: `Bearer ${keyToken}` } });
}

describe("requireIdentity round trips", () => {
  it("resolves an API key and charges the rate limit in one statement", async () => {
    const url = `http://localhost/api/roundtrip-key-${randomUUID()}`;
    // Warm the api_keys touch so the measured call is the steady-state one.
    await requireIdentity(bearer(url));
    const statements = await countQueries(async () => {
      const auth = await requireIdentity(bearer(url));
      expect(auth.identity!.userId).toBe(user.id);
    });
    expect(statements).toBe(1);
  });

  it("resolves a session cookie and charges the rate limit in one statement", async () => {
    await createSession(user.id);
    const url = `http://localhost/api/roundtrip-session-${randomUUID()}`;
    const statements = await countQueries(async () => {
      const auth = await requireIdentity(new Request(url));
      expect(auth.identity!.method).toBe("session");
    });
    expect(statements).toBe(1);
  });
});

describe("rate limiting stays exact", () => {
  it("counts every allowed request exactly once", async () => {
    const url = `http://localhost/api/roundtrip-exact-${randomUUID()}`;
    const route = new URL(url).pathname;
    for (let index = 0; index < 5; index += 1) {
      await requireIdentity(bearer(url));
    }
    expect(await bucketCount(`user:${user.id}`, route)).toEqual({ rows: 1, total: 5 });
  });

  it("never undercounts when requests overlap", async () => {
    const url = `http://localhost/api/roundtrip-concurrent-${randomUUID()}`;
    const route = new URL(url).pathname;
    await Promise.all(Array.from({ length: 12 }, () => requireIdentity(bearer(url))));
    expect((await bucketCount(`user:${user.id}`, route)).total).toBe(12);
  });

  it("blocks the handler: the 429 is returned by requireIdentity itself", async () => {
    const url = `http://localhost/api/roundtrip-evidence-${randomUUID()}/evidence`;
    let last: Awaited<ReturnType<typeof requireIdentity>> | undefined;
    for (let index = 0; index < 21; index += 1) {
      last = await requireIdentity(bearer(url));
    }
    expect(last!.identity).toBeNull();
    expect(last!.response!.status).toBe(429);
    expect(last!.response!.headers.get("retry-after")).toBe("60");
  }, 30_000);

  it("normalizes the route it charges, so distinct outcome ids share one bucket", async () => {
    for (let index = 0; index < 4; index += 1) {
      await requireIdentity(bearer(`http://localhost/api/requests/${randomUUID()}/review`));
    }
    const rows = await db
      .select({ route: apiRateLimits.route, count: apiRateLimits.count })
      .from(apiRateLimits)
      .where(and(eq(apiRateLimits.subject, `user:${user.id}`), like(apiRateLimits.route, "/api/requests/%/review")));
    expect(rows).toEqual([{ route: "/api/requests/:id/review", count: 4 }]);
  });

  it("charges nothing for a credential that does not authenticate", async () => {
    const url = `http://localhost/api/roundtrip-forged-${randomUUID()}`;
    const route = new URL(url).pathname;
    // Same prefix as a real key, tampered secret: the bump hangs off the row the
    // credential resolves to, so a third party cannot drain someone else's bucket.
    const forged = keyToken.slice(0, 16) + keyToken.slice(16).split("").reverse().join("");
    const auth = await requireIdentity(new Request(url, { headers: { authorization: `Bearer ${forged}` } }));
    expect(auth.response!.status).toBe(401);
    expect(await bucketCount(`user:${user.id}`, route)).toEqual({ rows: 0, total: 0 });
  });

  it("shares its bucket key with enforceRateLimit", async () => {
    const url = `http://localhost/api/roundtrip-shared-${randomUUID()}`;
    const route = new URL(url).pathname;
    await requireIdentity(bearer(url));
    const direct = await enforceRateLimit({ subject: `user:${user.id}`, route, limit: 180 });
    // 180 is the default ceiling requireIdentity applied, so a shared bucket
    // means the second call sees the first one's count.
    expect(direct.remaining).toBe(178);
  });
});

describe("apiKeys.lastUsedAt", () => {
  it("records first use", async () => {
    const [row] = await db.select({ lastUsedAt: apiKeys.lastUsedAt }).from(apiKeys).where(eq(apiKeys.id, keyId));
    expect(row.lastUsedAt).not.toBeNull();
  });

  it("does not rewrite the row on every request", async () => {
    const url = `http://localhost/api/roundtrip-touch-${randomUUID()}`;
    await requireIdentity(bearer(url));
    const [before] = await db.select({ lastUsedAt: apiKeys.lastUsedAt }).from(apiKeys).where(eq(apiKeys.id, keyId));
    await requireIdentity(bearer(url));
    const [after] = await db.select({ lastUsedAt: apiKeys.lastUsedAt }).from(apiKeys).where(eq(apiKeys.id, keyId));
    expect(after.lastUsedAt!.getTime()).toBe(before.lastUsedAt!.getTime());
  });

  it("does not deadlock when two keys of one user refresh and share a bucket", async () => {
    // The touch and the bump write two different tables in one statement. Two
    // keys owned by the same user take different api_keys rows but the same
    // api_rate_limits row, which is the only shape that could order the locks
    // against each other.
    const second = createApiToken();
    await db.insert(apiKeys).values({ userId: user.id, name: "roundtrip-second", prefix: second.prefix, tokenHash: second.tokenHash, scopes: ["*"] });
    await db.update(apiKeys).set({ lastUsedAt: new Date(Date.now() - 10 * 60_000) }).where(eq(apiKeys.userId, user.id));

    const url = `http://localhost/api/roundtrip-locks-${randomUUID()}`;
    const requests = Array.from({ length: 12 }, (_, index) =>
      requireIdentity(new Request(url, { headers: { authorization: `Bearer ${index % 2 === 0 ? keyToken : second.token}` } })),
    );
    for (const auth of await Promise.all(requests)) {
      expect(auth.identity!.userId).toBe(user.id);
    }
    expect((await bucketCount(`user:${user.id}`, new URL(url).pathname)).total).toBe(12);
  });

  it("refreshes a stale timestamp", async () => {
    const stale = new Date(Date.now() - 10 * 60_000);
    await db.update(apiKeys).set({ lastUsedAt: stale }).where(eq(apiKeys.id, keyId));
    await requireIdentity(bearer(`http://localhost/api/roundtrip-stale-${randomUUID()}`));
    const [row] = await db.select({ lastUsedAt: apiKeys.lastUsedAt }).from(apiKeys).where(eq(apiKeys.id, keyId));
    expect(row.lastUsedAt!.getTime()).toBeGreaterThan(stale.getTime());
  });
});
