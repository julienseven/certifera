import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { cookies } from "next/headers";
import { eq, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { apiKeys, apiRateLimits, auditLogs, sessions, users } from "@/db/schema";
import { knownBreach, rememberBreach } from "@/lib/rate-limit-cache";

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

/**
 * `db.execute` bypasses drizzle's column mapping, and its driver config parses
 * timestamps back as the raw wire string rather than a Date — so the timestamp
 * columns are typed as they actually arrive. The verification and MFA stamps
 * are only tested for presence; `lockedUntil` is the one that gets parsed back
 * to a Date before it is compared.
 */
type UserColumns = Pick<typeof users.$inferSelect, "id" | "email" | "displayName" | "role" | "status" | "relayId"> & {
  emailVerifiedAt: string | null;
  mfaEnabledAt: string | null;
  lockedUntil: string | null;
};
type IdentityRow = UserColumns & { rateCount: number };
type ApiKeyRow = IdentityRow & { scopes: string[] };

function identityFromUser(user: UserColumns, method: Identity["method"], scopes: string[] = ["*"]): Identity | null {
  if (!roles.includes(user.role as Role) || user.status !== "active") return null;
  // A locked account is locked to every credential type, not just to the
  // sign-in form. Only the login route consulted this, so a caller already
  // holding a session or an API key could keep a guessing loop running against
  // an account login had already shut — notably against DELETE /api/auth/mfa,
  // where the prize is the second factor.
  if (user.lockedUntil && new Date(user.lockedUntil) > new Date()) return null;
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

/** Aliased to the camelCase `identityFromUser` reads, since these come back off a raw statement. */
const userColumns = sql`u.id, u.email, u.display_name AS "displayName", u.role, u.status, u.relay_id AS "relayId", u.email_verified_at AS "emailVerifiedAt", u.mfa_enabled_at AS "mfaEnabledAt", u.locked_until AS "lockedUntil"`;

type RateLimitBump = { route: string; windowStart: Date; now: Date };

/**
 * Charges the caller's rate-limit window inside the statement that resolves the
 * credential, rather than in a second one after it.
 *
 * The bucket key is (subject, route, window) and `subject` is derived from the
 * user the credential resolved to, so the two cannot be issued in parallel — on
 * a pooler that made every authenticated request pay two serialized round trips
 * before any real work started. A data-modifying CTE gets the same ordering for
 * one round trip: Postgres runs it exactly once and to completion, and it reads
 * the credential CTE's output, so it charges precisely the requests that
 * authenticated. The upsert is cross-joined back in rather than read as a
 * subquery, so a row can never come back carrying an uncounted request.
 *
 * `count = count + 1` is evaluated under the row lock ON CONFLICT takes, so
 * overlapping requests serialize on the bucket instead of losing increments.
 */
function rateLimitBump(bump: RateLimitBump | null) {
  if (!bump) return { cte: sql``, count: sql`0`, from: sql`identity` };
  return {
    cte: sql`, bumped AS (
      INSERT INTO ${apiRateLimits} (subject, route, window_start, count, updated_at)
      SELECT 'user:' || identity.id::text, ${bump.route}::text, ${bump.windowStart}::timestamptz, 1, ${bump.now}::timestamptz FROM identity
      ON CONFLICT (subject, route, window_start) DO UPDATE SET count = ${apiRateLimits.count} + 1, updated_at = ${bump.now}::timestamptz
      RETURNING count
    )`,
    count: sql`bumped.count`,
    from: sql`identity, bumped`,
  };
}

function identityStatement(credential: SQL, bump: RateLimitBump | null, extraCte: SQL = sql``) {
  const rate = rateLimitBump(bump);
  return sql`WITH identity AS (${credential})${extraCte}${rate.cte} SELECT identity.*, ${rate.count} AS "rateCount" FROM ${rate.from}`;
}

/**
 * Refreshed at most once a minute per key. It only feeds the "last used" column
 * of the key list, and writing it on every request turned each key into a hot
 * row: one update per request, all of it WAL and dead tuples for a display
 * value nobody reads at that resolution.
 */
const API_KEY_TOUCH_MS = 60_000;

function bearerToken(request: Request) {
  const authorization = request.headers.get("authorization") || "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  return token.startsWith("cfr_") ? token : "";
}

/**
 * The token hash is matched in the predicate rather than compared in JS after
 * the row comes back, which is how the session path has always worked. It has
 * to be: the rate-limit bump above rides on this CTE producing a row, so any
 * second opinion held in JS would let the two disagree and charge nothing for a
 * request that authenticated. Nothing is given up by moving it — the compared
 * value is a sha256 digest, so matching it byte-prefix-first tells an attacker
 * how many digest bytes they got right, and reaching the next byte still means
 * finding a token that hashes to a chosen prefix.
 *
 * `prefix` stays in the predicate because it is the unique index; token_hash is
 * not indexed and on its own would scan.
 */
async function resolveApiKey(token: string, bump: RateLimitBump | null) {
  const now = bump?.now ?? new Date();
  const statement = identityStatement(
    sql`
      SELECT ${userColumns}, k.id AS "keyId", k.scopes
      FROM ${apiKeys} k
      JOIN ${users} u ON u.id = k.user_id
      WHERE k.prefix = ${token.slice(0, 16)}::text
        AND k.token_hash = ${hashValue(token)}::text
        AND k.revoked_at IS NULL
        AND (k.expires_at IS NULL OR k.expires_at > ${now}::timestamptz)
      LIMIT 1
    `,
    bump,
    sql`, touched AS (
      UPDATE ${apiKeys} SET last_used_at = ${now}::timestamptz
      WHERE id = (SELECT "keyId" FROM identity)
        AND (last_used_at IS NULL OR last_used_at < ${new Date(now.getTime() - API_KEY_TOUCH_MS)}::timestamptz)
    )`,
  );
  const { rows } = await db.execute<ApiKeyRow>(statement);
  return rows[0] ?? null;
}

async function resolveSession(rawToken: string, bump: RateLimitBump | null) {
  const now = bump?.now ?? new Date();
  const statement = identityStatement(
    sql`
      SELECT ${userColumns}
      FROM ${sessions} s
      JOIN ${users} u ON u.id = s.user_id
      WHERE s.token_hash = ${hashValue(rawToken)}::text AND s.expires_at > ${now}::timestamptz
      LIMIT 1
    `,
    bump,
  );
  const { rows } = await db.execute<IdentityRow>(statement);
  return rows[0] ?? null;
}

async function resolveIdentity(request: Request, bump: RateLimitBump | null): Promise<{ identity: Identity | null; rateCount: number }> {
  const token = bearerToken(request);
  if (token) {
    const row = await resolveApiKey(token, bump);
    if (row) {
      const identity = identityFromUser(row, "api_key", row.scopes);
      if (identity) return { identity, rateCount: row.rateCount };
    }
  }
  const cookieStore = await cookies();
  const rawToken = cookieStore.get(SESSION_COOKIE)?.value;
  if (!rawToken) return { identity: null, rateCount: 0 };
  const row = await resolveSession(rawToken, bump);
  if (!row) return { identity: null, rateCount: 0 };
  const identity = identityFromUser(row, "session");
  return identity ? { identity, rateCount: row.rateCount } : { identity: null, rateCount: 0 };
}

export async function getSessionIdentity(): Promise<Identity | null> {
  const cookieStore = await cookies();
  const rawToken = cookieStore.get(SESSION_COOKIE)?.value;
  if (!rawToken) return null;
  const row = await resolveSession(rawToken, null);
  return row ? identityFromUser(row, "session") : null;
}

export async function getApiKeyIdentity(request: Request): Promise<Identity | null> {
  const token = bearerToken(request);
  if (!token) return null;
  const row = await resolveApiKey(token, null);
  return row ? identityFromUser(row, "api_key", row.scopes) : null;
}

export async function getRequestIdentity(request: Request): Promise<Identity | null> {
  return (await resolveIdentity(request, null)).identity;
}

export function hasRole(identity: Identity, allowed: Role[]) {
  return identity.role === "admin" || allowed.includes(identity.role);
}

export function hasScope(identity: Identity, scope: string) {
  return identity.method === "session" || identity.scopes.includes("*") || identity.scopes.includes(scope);
}

const UUID_SEGMENT = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Collapses resource identifiers in a path to a fixed placeholder.
 *
 * The rate-limit key is (subject, route, window). Using the raw pathname put the
 * outcome id inside `route`, so every distinct id opened its own bucket: the
 * documented 30/min ceiling on /review and /settlement was really 30/min *per
 * outcome*, and a caller holding N outcomes got N x 30. It also grew
 * api_rate_limits by one row per user per outcome per minute rather than per
 * user per route per minute.
 *
 * Segment 3 of /api/requests/... is always an id, including when a caller sends
 * something that is not a UUID — normalising positionally as well as by shape
 * means a junk id cannot mint a fresh bucket on its way to a 404.
 */
export function normalizeRateLimitRoute(pathname: string) {
  const segments = pathname.split("/");
  if (segments[1] === "api" && segments[2] === "requests" && segments.length > 3 && segments[3]) {
    segments[3] = ":id";
  }
  return segments.map((segment) => (UUID_SEGMENT.test(segment) ? ":id" : segment)).join("/");
}

function requestRoute(request: Request) {
  return normalizeRateLimitRoute(new URL(request.url).pathname);
}

function rateLimitForRoute(route: string) {
  if (route.includes("/evidence")) return 20;
  if (route.includes("/settlement") || route.includes("/review")) return 30;
  return 180;
}

export async function enforceRateLimit(input: { subject: string; route: string; limit?: number }) {
  const now = Date.now();
  const limit = input.limit ?? rateLimitForRoute(input.route);

  // Already refused in this window: the count only rises, so the shared counter
  // cannot produce a different answer, and querying it again would buy a row
  // lock on the hot bucket purely to be told the same thing.
  const cached = knownBreach(input.subject, input.route, now);
  if (cached !== null) return { allowed: false, remaining: 0, retryAfter: cached };

  const windowStart = new Date(Math.floor(now / 60_000) * 60_000);
  const [row] = await db
    .insert(apiRateLimits)
    .values({ subject: input.subject, route: input.route, windowStart, count: 1, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: [apiRateLimits.subject, apiRateLimits.route, apiRateLimits.windowStart],
      set: { count: sql`${apiRateLimits.count} + 1`, updatedAt: new Date() },
    })
    .returning({ count: apiRateLimits.count });
  const allowed = row.count <= limit;
  if (!allowed) rememberBreach(input.subject, input.route, now);
  return { allowed, remaining: Math.max(0, limit - row.count), retryAfter: 60 };
}

export async function enforceAnonymousRateLimit(request: Request, bucket: string, limit: number) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "anonymous";
  return enforceRateLimit({ subject: `ip:${hashValue(forwarded)}`, route: `auth:${bucket}`, limit });
}

/**
 * Identifies the caller for the in-process breach cache, before the credential
 * has been resolved to a user.
 *
 * Hashed, never raw: this key lives in a long-lived in-memory map, and a
 * process dump or accidental log of it must not yield a usable token or session
 * cookie. Returns null for an unauthenticated request, which has no stable
 * identity to cache against and is refused by resolveIdentity anyway.
 */
function rateLimitCredentialKey(request: Request) {
  const token = bearerToken(request);
  if (token) return `key:${hashValue(token)}`;
  const cookie = request.headers.get("cookie") || "";
  const match = cookie.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([^;]+)`));
  return match?.[1] ? `session:${hashValue(decodeURIComponent(match[1]))}` : null;
}

export async function requireIdentity(request: Request, options: { roles?: Role[]; scope?: string } = {}) {
  const now = new Date();
  const route = requestRoute(request);

  // Refused already in this window? Then say so without resolving the
  // credential or charging the bucket. The counter only rises, so the shared
  // answer cannot differ, and this is the request pattern that otherwise makes
  // an abusive caller as expensive to serve as a legitimate one.
  //
  // Keyed on the presented credential rather than the resolved user, since the
  // point is to answer before doing the lookup that would resolve it.
  const credentialKey = rateLimitCredentialKey(request);
  if (credentialKey) {
    const cached = knownBreach(credentialKey, route, now.getTime());
    if (cached !== null) {
      return {
        identity: null,
        response: Response.json(
          { error: "Rate limit exceeded. Please retry shortly." },
          { status: 429, headers: { "retry-after": String(cached), "x-ratelimit-remaining": "0" } },
        ),
      };
    }
  }

  const { identity, rateCount } = await resolveIdentity(request, { route, windowStart: new Date(Math.floor(now.getTime() / 60_000) * 60_000), now });
  if (!identity) return { identity: null, response: Response.json({ error: "Authentication is required." }, { status: 401 }) };
  if (options.roles && !hasRole(identity, options.roles)) {
    return { identity: null, response: Response.json({ error: "You do not have permission for this action." }, { status: 403 }) };
  }
  if (options.scope && !hasScope(identity, options.scope)) {
    return { identity: null, response: Response.json({ error: "This API key does not include the required scope." }, { status: 403 }) };
  }
  // The window was charged while the credential was resolved, so a caller
  // hammering a route their role or scope does not cover now spends its own
  // budget doing it. That is stricter than before and only reachable with the
  // caller's own credential, which is the direction to err in.
  const limit = rateLimitForRoute(route);
  if (rateCount > limit) {
    // Remembered so the next request from this credential is refused without
    // resolving it or touching the bucket again: a caller past its limit should
    // not keep costing the database a locked write per request.
    if (credentialKey) rememberBreach(credentialKey, route, now.getTime());
    return {
      identity: null,
      response: Response.json(
        { error: "Rate limit exceeded. Please retry shortly." },
        { status: 429, headers: { "retry-after": "60", "x-ratelimit-remaining": String(Math.max(0, limit - rateCount)) } },
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
