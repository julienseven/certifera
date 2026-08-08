import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { cookies } from "next/headers";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { apiKeys, apiRateLimits, auditLogs, sessions, users } from "@/db/schema";

const scrypt = promisify(scryptCallback);
const SESSION_COOKIE = "certifera_session";
const SESSION_DAYS = 14;

export const roles = ["admin", "operator", "reviewer", "relay"] as const;
export type Role = (typeof roles)[number];

export type Identity = {
  userId: string;
  email: string;
  displayName: string;
  role: Role;
  relayId: string | null;
  emailVerified: boolean;
  mfaEnabled: boolean;
  method: "session" | "api_key";
  scopes: string[];
};

function hashValue(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const derived = (await scrypt(password, salt, 64)) as Buffer;
  return `${salt}:${derived.toString("hex")}`;
}

export async function verifyPassword(password: string, storedHash: string) {
  const [salt, hash] = storedHash.split(":");
  if (!salt || !hash) return false;
  const derived = (await scrypt(password, salt, 64)) as Buffer;
  const expected = Buffer.from(hash, "hex");
  return expected.length === derived.length && timingSafeEqual(expected, derived);
}

export async function createSession(userId: string) {
  const rawToken = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await db.insert(sessions).values({ userId, tokenHash: hashValue(rawToken), expiresAt });
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, rawToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}

export async function clearSession() {
  const cookieStore = await cookies();
  const rawToken = cookieStore.get(SESSION_COOKIE)?.value;
  if (rawToken) await db.delete(sessions).where(eq(sessions.tokenHash, hashValue(rawToken)));
  cookieStore.set(SESSION_COOKIE, "", { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 0 });
}

function identityFromUser(user: typeof users.$inferSelect, method: Identity["method"], scopes: string[] = ["*"]): Identity | null {
  if (!roles.includes(user.role as Role) || user.status !== "active") return null;
  if (process.env.CERTIFERA_EMAIL_VERIFICATION_REQUIRED === "true" && !user.emailVerifiedAt) return null;
  return {
    userId: user.id,
    email: user.email,
    displayName: user.displayName,
    role: user.role as Role,
    relayId: user.relayId,
    emailVerified: Boolean(user.emailVerifiedAt),
    mfaEnabled: Boolean(user.mfaEnabledAt),
    method,
    scopes,
  };
}

export async function getSessionIdentity(): Promise<Identity | null> {
  const cookieStore = await cookies();
  const rawToken = cookieStore.get(SESSION_COOKIE)?.value;
  if (!rawToken) return null;
  const [row] = await db
    .select({ user: users })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(and(eq(sessions.tokenHash, hashValue(rawToken)), gt(sessions.expiresAt, new Date())))
    .limit(1);
  return row ? identityFromUser(row.user, "session") : null;
}

export async function getApiKeyIdentity(request: Request): Promise<Identity | null> {
  const authorization = request.headers.get("authorization") || "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  if (!token.startsWith("cfr_")) return null;
  const prefix = token.slice(0, 16);
  const [row] = await db
    .select({ key: apiKeys, user: users })
    .from(apiKeys)
    .innerJoin(users, eq(apiKeys.userId, users.id))
    .where(and(eq(apiKeys.prefix, prefix), isNull(apiKeys.revokedAt)))
    .limit(1);
  if (!row || row.key.tokenHash !== hashValue(token) || (row.key.expiresAt && row.key.expiresAt < new Date())) return null;
  const identity = identityFromUser(row.user, "api_key", row.key.scopes);
  if (!identity) return null;
  await db.update(apiKeys).set({ lastUsedAt: new Date() }).where(eq(apiKeys.id, row.key.id));
  return identity;
}

export async function getRequestIdentity(request: Request): Promise<Identity | null> {
  return (await getApiKeyIdentity(request)) || getSessionIdentity();
}

export function hasRole(identity: Identity, allowed: Role[]) {
  return identity.role === "admin" || allowed.includes(identity.role);
}

export function hasScope(identity: Identity, scope: string) {
  return identity.method === "session" || identity.scopes.includes("*") || identity.scopes.includes(scope);
}

function requestRoute(request: Request) {
  return new URL(request.url).pathname;
}

function rateLimitForRoute(route: string) {
  if (route.includes("/evidence")) return 20;
  if (route.includes("/settlement") || route.includes("/review")) return 30;
  return 180;
}

export async function enforceRateLimit(input: { subject: string; route: string; limit?: number }) {
  const windowStart = new Date(Math.floor(Date.now() / 60_000) * 60_000);
  const limit = input.limit ?? rateLimitForRoute(input.route);
  const [row] = await db
    .insert(apiRateLimits)
    .values({ subject: input.subject, route: input.route, windowStart, count: 1, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: [apiRateLimits.subject, apiRateLimits.route, apiRateLimits.windowStart],
      set: { count: sql`${apiRateLimits.count} + 1`, updatedAt: new Date() },
    })
    .returning({ count: apiRateLimits.count });
  return { allowed: row.count <= limit, remaining: Math.max(0, limit - row.count), retryAfter: 60 };
}

export async function enforceAnonymousRateLimit(request: Request, bucket: string, limit: number) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "anonymous";
  return enforceRateLimit({ subject: `ip:${hashValue(forwarded)}`, route: `auth:${bucket}`, limit });
}

export async function requireIdentity(request: Request, options: { roles?: Role[]; scope?: string } = {}) {
  const identity = await getRequestIdentity(request);
  if (!identity) return { identity: null, response: Response.json({ error: "Authentication is required." }, { status: 401 }) };
  if (options.roles && !hasRole(identity, options.roles)) {
    return { identity: null, response: Response.json({ error: "You do not have permission for this action." }, { status: 403 }) };
  }
  if (options.scope && !hasScope(identity, options.scope)) {
    return { identity: null, response: Response.json({ error: "This API key does not include the required scope." }, { status: 403 }) };
  }
  const rate = await enforceRateLimit({ subject: `user:${identity.userId}`, route: requestRoute(request) });
  if (!rate.allowed) {
    return {
      identity: null,
      response: Response.json(
        { error: "Rate limit exceeded. Please retry shortly." },
        { status: 429, headers: { "retry-after": String(rate.retryAfter), "x-ratelimit-remaining": String(rate.remaining) } },
      ),
    };
  }
  return { identity, response: null };
}

export function createApiToken() {
  const secret = randomBytes(30).toString("base64url");
  const token = `cfr_${secret}`;
  return { token, prefix: token.slice(0, 16), tokenHash: hashValue(token) };
}

export async function writeAudit(input: {
  actorId?: string | null;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  request?: Request;
  data?: Record<string, string | number | boolean | null>;
}) {
  const forwarded = input.request?.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || input.request?.headers.get("x-real-ip") || "";
  await db.insert(auditLogs).values({
    actorId: input.actorId ?? null,
    action: input.action,
    resourceType: input.resourceType,
    resourceId: input.resourceId ?? null,
    ipHash: forwarded ? hashValue(forwarded) : null,
    data: input.data ?? {},
  });
}
