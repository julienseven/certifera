import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { apiKeys, auditLogs, sessions, users } from "@/db/schema";

/**
 * `createSession` / `getSessionIdentity` / `clearSession` all call
 * `cookies()` from `next/headers`, which only works inside Next's
 * request-render scope (see the note in tests/api-lifecycle.test.ts). We
 * mock it with an in-memory jar so those code paths can run for real,
 * against the real database, from a plain Vitest test.
 */
const cookieJar = vi.hoisted(() => new Map<string, { value: string; options: Record<string, unknown> }>());
// Mirrors the private SESSION_COOKIE constant in src/lib/auth.ts. This is the
// literal cookie name a browser would see on the wire, not an implementation
// secret, so hardcoding it here is a black-box assumption, not a white-box one.
const SESSION_COOKIE = "certifera_session";

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => {
      const entry = cookieJar.get(name);
      return entry ? { name, value: entry.value } : undefined;
    },
    set: (name: string, value: string, options: Record<string, unknown> = {}) => {
      if (value === "" || options.maxAge === 0) {
        cookieJar.delete(name);
      } else {
        cookieJar.set(name, { value, options });
      }
    },
  }),
}));

// vi.mock (and the vi.hoisted block it depends on) is hoisted above this
// import by Vitest's transform, so the mocked `next/headers` is in place
// before src/lib/auth.ts is evaluated.
import {
  createApiToken,
  createSession,
  clearSession,
  getApiKeyIdentity,
  getSessionIdentity,
  getRequestIdentity,
  hashPassword,
  verifyPassword,
  hasRole,
  hasScope,
  enforceRateLimit,
  enforceAnonymousRateLimit,
  requireIdentity,
  writeAudit,
  type Identity,
} from "@/lib/auth";

const suffix = randomUUID().slice(0, 8);
const userIds: string[] = [];

async function makeUser(overrides: Partial<typeof users.$inferInsert> = {}) {
  const [user] = await db
    .insert(users)
    .values({
      email: `auth-test-${suffix}-${userIds.length}@certifera.local`,
      passwordHash: "unusable:unusable",
      displayName: "Auth Test User",
      role: "operator",
      status: "active",
      emailVerifiedAt: new Date(),
      ...overrides,
    })
    .returning();
  userIds.push(user.id);
  return user;
}

let activeUser: typeof users.$inferSelect;
let secondUser: typeof users.$inferSelect;
let suspendedUser: typeof users.$inferSelect;
let unverifiedUser: typeof users.$inferSelect;
let unknownRoleUser: typeof users.$inferSelect;
let adminUser: typeof users.$inferSelect;
let scopedUser: typeof users.$inferSelect;
let rateLimitUser: typeof users.$inferSelect;

let normalKeyToken: string;
let scopedKeyToken: string;
let rateLimitKeyToken: string;

beforeAll(async () => {
  activeUser = await makeUser();
  secondUser = await makeUser();
  suspendedUser = await makeUser({ status: "suspended" });
  unverifiedUser = await makeUser({ emailVerifiedAt: null });
  unknownRoleUser = await makeUser({ role: "ghost" });
  adminUser = await makeUser({ role: "admin" });
  scopedUser = await makeUser();
  rateLimitUser = await makeUser();

  const normalKey = createApiToken();
  normalKeyToken = normalKey.token;
  await db.insert(apiKeys).values({ userId: activeUser.id, name: "normal", prefix: normalKey.prefix, tokenHash: normalKey.tokenHash, scopes: ["*"] });

  const scopedKey = createApiToken();
  scopedKeyToken = scopedKey.token;
  await db.insert(apiKeys).values({ userId: scopedUser.id, name: "scoped", prefix: scopedKey.prefix, tokenHash: scopedKey.tokenHash, scopes: ["proofs:write"] });

  const rateLimitKey = createApiToken();
  rateLimitKeyToken = rateLimitKey.token;
  await db.insert(apiKeys).values({ userId: rateLimitUser.id, name: "rate-limit", prefix: rateLimitKey.prefix, tokenHash: rateLimitKey.tokenHash, scopes: ["*"] });
});

afterAll(async () => {
  for (const id of userIds) {
    await db.delete(users).where(eq(users.id, id));
  }
});

function bearer(token: string, url = "http://localhost/api/test") {
  return new Request(url, { headers: { authorization: `Bearer ${token}` } });
}

describe("hashPassword / verifyPassword", () => {
  it("hashes into a salt:derived hex pair", async () => {
    const hash = await hashPassword("correct horse battery staple");
    expect(hash).toMatch(/^[0-9a-f]{32}:[0-9a-f]{128}$/);
  });

  it("verifies the correct password and rejects a wrong one", async () => {
    const hash = await hashPassword("correct horse battery staple");
    expect(await verifyPassword("correct horse battery staple", hash)).toBe(true);
    expect(await verifyPassword("wrong password", hash)).toBe(false);
  });

  it("never stores the password in plaintext", async () => {
    const hash = await hashPassword("correct horse battery staple");
    expect(hash).not.toContain("correct horse battery staple");
  });

  it("rejects a malformed stored hash instead of throwing", async () => {
    expect(await verifyPassword("anything", "not-a-valid-hash")).toBe(false);
    expect(await verifyPassword("anything", "")).toBe(false);
  });
});

describe("createApiToken", () => {
  it("produces a cfr_-prefixed token whose prefix is its first 16 characters", () => {
    const { token, prefix, tokenHash } = createApiToken();
    expect(token.startsWith("cfr_")).toBe(true);
    expect(prefix).toBe(token.slice(0, 16));
    expect(prefix).toHaveLength(16);
    expect(tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(tokenHash).not.toBe(token);
  });

  it("generates a fresh random token on every call", () => {
    const a = createApiToken();
    const b = createApiToken();
    expect(a.token).not.toBe(b.token);
    expect(a.prefix).not.toBe(b.prefix);
    expect(a.tokenHash).not.toBe(b.tokenHash);
  });
});

describe("sessions", () => {
  beforeEach(() => {
    cookieJar.clear();
  });

  // Each test starts from a clean session table for the users it touches, so
  // a raw-row lookup by userId is guaranteed to see exactly the row that
  // test created (createSession only inserts, it never replaces).
  afterEach(async () => {
    await db.delete(sessions).where(inArray(sessions.userId, [activeUser.id, secondUser.id, suspendedUser.id, unverifiedUser.id, unknownRoleUser.id]));
  });

  it("returns null when there is no session cookie", async () => {
    expect(await getSessionIdentity()).toBeNull();
  });

  it("creates a session cookie that is httpOnly, same-site lax, and scoped to /", async () => {
    await createSession(activeUser.id);
    const cookie = cookieJar.get(SESSION_COOKIE);
    expect(cookie).toBeDefined();
    expect(cookie!.options.httpOnly).toBe(true);
    expect(cookie!.options.sameSite).toBe("lax");
    expect(cookie!.options.path).toBe("/");
    // NODE_ENV isn't "production" under the test runner.
    expect(cookie!.options.secure).toBe(false);
    const expires = cookie!.options.expires as Date;
    const days = (expires.getTime() - Date.now()) / (24 * 60 * 60 * 1000);
    expect(days).toBeGreaterThan(13.9);
    expect(days).toBeLessThan(14.1);
  });

  it("never stores the raw session token, only its hash", async () => {
    await createSession(activeUser.id);
    const raw = cookieJar.get(SESSION_COOKIE)!.value;
    const [row] = await db.select().from(sessions).where(eq(sessions.userId, activeUser.id));
    expect(row.tokenHash).not.toBe(raw);
  });

  it("round-trips a real session into a matching identity", async () => {
    await createSession(activeUser.id);
    const identity = (await getSessionIdentity()) as Identity;
    expect(identity).not.toBeNull();
    expect(identity.userId).toBe(activeUser.id);
    expect(identity.email).toBe(activeUser.email);
    expect(identity.role).toBe("operator");
    expect(identity.method).toBe("session");
    expect(identity.scopes).toEqual(["*"]);
  });

  it("rejects an expired session even with a matching cookie", async () => {
    await createSession(activeUser.id);
    await db.update(sessions).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(sessions.userId, activeUser.id));
    expect(await getSessionIdentity()).toBeNull();
  });

  it("denies a session for a suspended account (deny-by-default on status)", async () => {
    await createSession(suspendedUser.id);
    expect(await getSessionIdentity()).toBeNull();
  });

  it("denies a session for an account with an unrecognized role", async () => {
    await createSession(unknownRoleUser.id);
    expect(await getSessionIdentity()).toBeNull();
  });

  it("honors CERTIFERA_EMAIL_VERIFICATION_REQUIRED by denying unverified accounts", async () => {
    process.env.CERTIFERA_EMAIL_VERIFICATION_REQUIRED = "true";
    try {
      await createSession(unverifiedUser.id);
      expect(await getSessionIdentity()).toBeNull();

      cookieJar.clear();
      await createSession(activeUser.id);
      expect(await getSessionIdentity()).not.toBeNull();
    } finally {
      delete process.env.CERTIFERA_EMAIL_VERIFICATION_REQUIRED;
    }
  });

  it("clearSession deletes the DB row and the cookie", async () => {
    await createSession(activeUser.id);
    await clearSession();
    expect(cookieJar.has(SESSION_COOKIE)).toBe(false);
    const [row] = await db.select().from(sessions).where(eq(sessions.userId, activeUser.id));
    expect(row).toBeUndefined();
    expect(await getSessionIdentity()).toBeNull();
  });
});

describe("getApiKeyIdentity", () => {
  it("returns null when there is no bearer token or the wrong scheme is used", async () => {
    expect(await getApiKeyIdentity(new Request("http://localhost/api/test"))).toBeNull();
    expect(await getApiKeyIdentity(new Request("http://localhost/api/test", { headers: { authorization: "Basic xyz" } }))).toBeNull();
  });

  it("returns null for a well-formed token that was never issued", async () => {
    const { token } = createApiToken();
    expect(await getApiKeyIdentity(bearer(token))).toBeNull();
  });

  it("round-trips an issued key into a matching identity and records lastUsedAt", async () => {
    const identity = (await getApiKeyIdentity(bearer(normalKeyToken))) as Identity;
    expect(identity).not.toBeNull();
    expect(identity.userId).toBe(activeUser.id);
    expect(identity.method).toBe("api_key");
    expect(identity.scopes).toEqual(["*"]);

    const [row] = await db.select().from(apiKeys).where(eq(apiKeys.userId, activeUser.id));
    expect(row.lastUsedAt).not.toBeNull();
    expect(row.tokenHash).not.toBe(normalKeyToken);
  });

  it("rejects a token whose suffix was tampered with, even though the prefix still matches a real key", async () => {
    const suffix16 = normalKeyToken.slice(0, 16);
    const tamperedTail = normalKeyToken.slice(16).split("").reverse().join("");
    const tampered = suffix16 + tamperedTail;
    expect(tampered).not.toBe(normalKeyToken);
    expect(await getApiKeyIdentity(bearer(tampered))).toBeNull();
  });

  it("rejects a revoked key", async () => {
    const revoked = createApiToken();
    await db.insert(apiKeys).values({ userId: activeUser.id, name: "revoked", prefix: revoked.prefix, tokenHash: revoked.tokenHash, scopes: ["*"], revokedAt: new Date() });
    expect(await getApiKeyIdentity(bearer(revoked.token))).toBeNull();
  });

  it("rejects an expired key", async () => {
    const expired = createApiToken();
    await db.insert(apiKeys).values({ userId: activeUser.id, name: "expired", prefix: expired.prefix, tokenHash: expired.tokenHash, scopes: ["*"], expiresAt: new Date(Date.now() - 1000) });
    expect(await getApiKeyIdentity(bearer(expired.token))).toBeNull();
  });

  it("denies a key belonging to a suspended user", async () => {
    const key = createApiToken();
    await db.insert(apiKeys).values({ userId: suspendedUser.id, name: "suspended-owner", prefix: key.prefix, tokenHash: key.tokenHash, scopes: ["*"] });
    expect(await getApiKeyIdentity(bearer(key.token))).toBeNull();
  });

  it("carries the key's own scopes rather than defaulting to full access", async () => {
    const identity = (await getApiKeyIdentity(bearer(scopedKeyToken))) as Identity;
    expect(identity.scopes).toEqual(["proofs:write"]);
  });
});

describe("getRequestIdentity", () => {
  beforeEach(() => {
    cookieJar.clear();
  });

  it("prefers a valid API key over a valid session cookie on the same request", async () => {
    await createSession(secondUser.id);
    const identity = (await getRequestIdentity(bearer(normalKeyToken))) as Identity;
    expect(identity.method).toBe("api_key");
    expect(identity.userId).toBe(activeUser.id);
  });

  it("falls back to the session when no API key is presented", async () => {
    await createSession(secondUser.id);
    const identity = (await getRequestIdentity(new Request("http://localhost/api/test"))) as Identity;
    expect(identity.method).toBe("session");
    expect(identity.userId).toBe(secondUser.id);
  });
});

describe("hasRole", () => {
  const base = { userId: "u", email: "a@b.com", displayName: "A", relayId: null, emailVerified: true, mfaEnabled: false, method: "session" as const, scopes: ["*"] };

  it("lets admins through regardless of the allowed list", () => {
    expect(hasRole({ ...base, role: "admin" }, ["reviewer"])).toBe(true);
  });

  it("allows a role that is explicitly listed", () => {
    expect(hasRole({ ...base, role: "reviewer" }, ["reviewer", "operator"])).toBe(true);
  });

  it("denies a role that is not listed (deny-by-default)", () => {
    expect(hasRole({ ...base, role: "relay" }, ["reviewer", "operator"])).toBe(false);
  });
});

describe("hasScope", () => {
  const base = { userId: "u", email: "a@b.com", displayName: "A", role: "operator" as const, relayId: null, emailVerified: true, mfaEnabled: false };

  it("always allows session-authenticated identities regardless of scope", () => {
    expect(hasScope({ ...base, method: "session", scopes: [] }, "requests:write")).toBe(true);
  });

  it("allows an api_key identity holding the wildcard scope", () => {
    expect(hasScope({ ...base, method: "api_key", scopes: ["*"] }, "requests:write")).toBe(true);
  });

  it("allows an api_key identity holding the exact scope", () => {
    expect(hasScope({ ...base, method: "api_key", scopes: ["proofs:write"] }, "proofs:write")).toBe(true);
  });

  it("denies an api_key identity missing the scope (deny-by-default)", () => {
    expect(hasScope({ ...base, method: "api_key", scopes: ["proofs:write"] }, "requests:write")).toBe(false);
    expect(hasScope({ ...base, method: "api_key", scopes: [] }, "requests:write")).toBe(false);
  });
});

describe("enforceRateLimit", () => {
  it("allows requests up to the limit, then denies", async () => {
    const subject = `test-subject-${suffix}-${randomUUID()}`;
    const route = `test-route-${suffix}`;
    const first = await enforceRateLimit({ subject, route, limit: 2 });
    expect(first).toEqual({ allowed: true, remaining: 1, retryAfter: 60 });
    const second = await enforceRateLimit({ subject, route, limit: 2 });
    expect(second).toEqual({ allowed: true, remaining: 0, retryAfter: 60 });
    const third = await enforceRateLimit({ subject, route, limit: 2 });
    expect(third).toEqual({ allowed: false, remaining: 0, retryAfter: 60 });
  });

  it("picks a lower default limit for evidence and settlement/review routes than other routes", async () => {
    const base = `test-route-defaults-${suffix}-${randomUUID()}`;
    const evidence = await enforceRateLimit({ subject: "s1", route: `/api/${base}/evidence` });
    expect(evidence.remaining).toBe(19); // limit 20
    const settlement = await enforceRateLimit({ subject: "s2", route: `/api/${base}/settlement` });
    expect(settlement.remaining).toBe(29); // limit 30
    const generic = await enforceRateLimit({ subject: "s3", route: `/api/${base}/other` });
    expect(generic.remaining).toBe(179); // limit 180
  });
});

describe("enforceAnonymousRateLimit", () => {
  it("scopes the limit per source IP so unrelated callers are unaffected", async () => {
    const bucket = `anon-${suffix}-${randomUUID()}`;
    const reqA = new Request("http://localhost/api/test", { headers: { "x-forwarded-for": "203.0.113.9" } });
    const reqB = new Request("http://localhost/api/test", { headers: { "x-forwarded-for": "198.51.100.4" } });

    expect((await enforceAnonymousRateLimit(reqA, bucket, 1)).allowed).toBe(true);
    expect((await enforceAnonymousRateLimit(reqA, bucket, 1)).allowed).toBe(false);
    // A different IP has its own bucket and is unaffected by A's exhaustion.
    expect((await enforceAnonymousRateLimit(reqB, bucket, 1)).allowed).toBe(true);
  });

  it("takes only the first hop of x-forwarded-for and falls back to x-real-ip, then anonymous", async () => {
    const bucket = `anon-forwarded-${suffix}-${randomUUID()}`;
    const forwarded = new Request("http://localhost/api/test", { headers: { "x-forwarded-for": "203.0.113.9, 70.41.3.18" } });
    const sameFirstHop = new Request("http://localhost/api/test", { headers: { "x-forwarded-for": "203.0.113.9, 9.9.9.9" } });
    expect((await enforceAnonymousRateLimit(forwarded, bucket, 1)).allowed).toBe(true);
    // Same first hop despite a different second hop -> shares the bucket -> denied.
    expect((await enforceAnonymousRateLimit(sameFirstHop, bucket, 1)).allowed).toBe(false);

    const realIpBucket = `anon-realip-${suffix}-${randomUUID()}`;
    const realIp = new Request("http://localhost/api/test", { headers: { "x-real-ip": "8.8.8.8" } });
    expect((await enforceAnonymousRateLimit(realIp, realIpBucket, 1)).allowed).toBe(true);
    expect((await enforceAnonymousRateLimit(realIp, realIpBucket, 1)).allowed).toBe(false);

    const anonBucket = `anon-none-${suffix}-${randomUUID()}`;
    const noHeaders = new Request("http://localhost/api/test");
    expect((await enforceAnonymousRateLimit(noHeaders, anonBucket, 1)).allowed).toBe(true);
    expect((await enforceAnonymousRateLimit(new Request("http://localhost/api/test"), anonBucket, 1)).allowed).toBe(false);
  });
});

describe("requireIdentity", () => {
  beforeEach(() => {
    cookieJar.clear();
  });

  it("401s when there is no credential", async () => {
    const { identity, response } = await requireIdentity(new Request("http://localhost/api/test"));
    expect(identity).toBeNull();
    expect(response!.status).toBe(401);
  });

  it("403s when the identity's role is not allowed (deny-by-default)", async () => {
    const { identity, response } = await requireIdentity(bearer(normalKeyToken, "http://localhost/api/rq-role"), { roles: ["reviewer"] });
    expect(identity).toBeNull();
    expect(response!.status).toBe(403);
  });

  it("lets an admin through a role check even when admin isn't explicitly listed", async () => {
    const adminKey = createApiToken();
    await db.insert(apiKeys).values({ userId: adminUser.id, name: "admin", prefix: adminKey.prefix, tokenHash: adminKey.tokenHash, scopes: ["*"] });
    const { identity, response } = await requireIdentity(bearer(adminKey.token, "http://localhost/api/rq-admin"), { roles: ["reviewer"] });
    expect(response).toBeNull();
    expect(identity!.role).toBe("admin");
  });

  it("403s when the API key is missing the required scope", async () => {
    const { identity, response } = await requireIdentity(bearer(scopedKeyToken, "http://localhost/api/rq-scope"), { scope: "requests:write" });
    expect(identity).toBeNull();
    expect(response!.status).toBe(403);
  });

  it("succeeds and returns the identity when role and scope checks pass", async () => {
    const { identity, response } = await requireIdentity(bearer(scopedKeyToken, "http://localhost/api/rq-ok"), { scope: "proofs:write" });
    expect(response).toBeNull();
    expect(identity!.userId).toBe(scopedUser.id);
  });

  it("429s once the per-user, per-route rate limit is exceeded", async () => {
    // /evidence routes carry a limit of 20 requests/minute (rateLimitForRoute).
    const url = "http://localhost/api/evidence";
    let last: Awaited<ReturnType<typeof requireIdentity>> | undefined;
    for (let i = 0; i < 21; i += 1) {
      last = await requireIdentity(bearer(rateLimitKeyToken, url));
    }
    expect(last!.identity).toBeNull();
    expect(last!.response!.status).toBe(429);
    expect(last!.response!.headers.get("retry-after")).toBe("60");
    expect(last!.response!.headers.get("x-ratelimit-remaining")).toBe("0");
  }, 20_000);
});

describe("writeAudit", () => {
  it("records the actor, action, resource, and payload", async () => {
    const action = `test.audit.${suffix}.${randomUUID()}`;
    await writeAudit({ actorId: activeUser.id, action, resourceType: "test_resource", resourceId: "res-1", data: { foo: "bar" } });
    const [row] = await db.select().from(auditLogs).where(eq(auditLogs.action, action));
    expect(row.actorId).toBe(activeUser.id);
    expect(row.resourceType).toBe("test_resource");
    expect(row.resourceId).toBe("res-1");
    expect(row.data).toEqual({ foo: "bar" });
  });

  it("defaults actorId/resourceId to null and data to {} when omitted", async () => {
    const action = `test.audit.defaults.${suffix}.${randomUUID()}`;
    await writeAudit({ action, resourceType: "test_resource" });
    const [row] = await db.select().from(auditLogs).where(eq(auditLogs.action, action));
    expect(row.actorId).toBeNull();
    expect(row.resourceId).toBeNull();
    expect(row.ipHash).toBeNull();
    expect(row.data).toEqual({});
  });

  it("hashes the client IP deterministically instead of storing it in plaintext", async () => {
    const actionA = `test.audit.ip.a.${suffix}.${randomUUID()}`;
    const actionB = `test.audit.ip.b.${suffix}.${randomUUID()}`;
    const request = new Request("http://localhost/api/test", { headers: { "x-forwarded-for": "203.0.113.5, 70.41.3.18" } });
    await writeAudit({ action: actionA, resourceType: "test_resource", request });
    await writeAudit({ action: actionB, resourceType: "test_resource", request });
    const [rowA] = await db.select().from(auditLogs).where(eq(auditLogs.action, actionA));
    const [rowB] = await db.select().from(auditLogs).where(eq(auditLogs.action, actionB));
    expect(rowA.ipHash).not.toBeNull();
    expect(rowA.ipHash).not.toContain("203.0.113.5");
    expect(rowA.ipHash).toBe(rowB.ipHash); // deterministic for the same IP
  });
});
