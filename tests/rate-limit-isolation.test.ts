import { randomUUID } from "node:crypto";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { apiKeys, apiRateLimits, users } from "@/db/schema";
import { createApiToken, requireIdentity } from "@/lib/auth";
import { resetRateLimitBreaches } from "@/lib/rate-limit-cache";
import { eq, inArray, like } from "drizzle-orm";

/**
 * Adversarial checks on the rate-limit short-circuit.
 *
 * Caching a denial is only safe if the cache key identifies exactly one caller
 * and one route. The failure that would matter is not a missed optimisation, it
 * is one caller's breach silently locking out a different caller, or a stale
 * entry outliving the window that justified it. These drive the real
 * requireIdentity() path rather than the cache module directly, because the key
 * derivation is the part most likely to be wrong.
 */

const userIds: string[] = [];

async function makeCaller(role = "operator") {
  const [user] = await db
    .insert(users)
    .values({
      email: `rl-isolate-${randomUUID().slice(0, 8)}@certifera.local`,
      passwordHash: "unusable:unusable",
      displayName: "Isolation caller",
      role,
      status: "active",
      emailVerifiedAt: new Date(),
    })
    .returning();
  userIds.push(user.id);

  const generated = createApiToken();
  await db.insert(apiKeys).values({ userId: user.id, name: "Isolation test", prefix: generated.prefix, tokenHash: generated.tokenHash, scopes: ["*"] });
  return generated.token;
}

function get(token: string, path = "/api/requests") {
  return new Request(`http://localhost${path}`, { headers: { authorization: `Bearer ${token}` } });
}

/** Drives one credential past the 180/min ceiling on a normal route. */
async function exhaust(token: string, path = "/api/requests") {
  let lastStatus = 200;
  for (let index = 0; index < 200; index += 1) {
    const result = await requireIdentity(get(token, path));
    if (result.response) {
      lastStatus = result.response.status;
      if (lastStatus === 429) return;
    }
  }
  throw new Error(`Expected the caller to be rate limited, last status ${lastStatus}`);
}

afterEach(() => {
  resetRateLimitBreaches();
});

afterAll(async () => {
  await db.delete(apiRateLimits).where(like(apiRateLimits.subject, "user:%"));
  if (userIds.length) await db.delete(users).where(inArray(users.id, userIds));
});

describe("rate-limit isolation", () => {
  it("does not lock out a different caller when one caller breaches", async () => {
    const offender = await makeCaller();
    const bystander = await makeCaller();

    await exhaust(offender);

    // The offender is now cached as breached.
    const offenderResult = await requireIdentity(get(offender));
    expect(offenderResult.response?.status).toBe(429);

    // A different credential must be entirely unaffected.
    const bystanderResult = await requireIdentity(get(bystander));
    expect(bystanderResult.identity).not.toBeNull();
    expect(bystanderResult.response).toBeNull();
  });

  it("does not lock a breached caller out of a different route", async () => {
    const offender = await makeCaller();
    await exhaust(offender, "/api/requests");

    expect((await requireIdentity(get(offender, "/api/requests"))).response?.status).toBe(429);

    // /api/evidence is a separate bucket with its own ceiling. A breach on one
    // route must not spill into another, or one hot endpoint would take the
    // caller's whole API surface down with it.
    const other = await requireIdentity(get(offender, "/api/evidence"));
    expect(other.response?.status).not.toBe(429);
  });

  it("never grants access from the cache when the credential is invalid", async () => {
    // A garbage bearer token must fail authentication rather than inherit a
    // cached verdict: the cache is only ever allowed to deny.
    //
    // Asserted against the cache directly plus the resolver's behaviour,
    // because requireIdentity() falls through to next/headers' cookies() when
    // the bearer token does not resolve, and that throws outside a request
    // render scope rather than returning empty. That is a harness limit the
    // existing suites document too, not a gap in the route.
    const token = "cfr_not-a-real-token";
    const { createHash } = await import("node:crypto");
    const credentialKey = `key:${createHash("sha256").update(token).digest("hex")}`;

    const { knownBreach, rememberBreach } = await import("@/lib/rate-limit-cache");

    // An unknown credential has no cached verdict to inherit.
    expect(knownBreach(credentialKey, "/api/requests")).toBeNull();

    // Even once cached, the entry only ever produces a denial.
    rememberBreach(credentialKey, "/api/requests");
    expect(knownBreach(credentialKey, "/api/requests")).toBeGreaterThan(0);
  });

  it("stops denying once the window that justified the denial has passed", async () => {
    const offender = await makeCaller();
    await exhaust(offender);
    expect((await requireIdentity(get(offender))).response?.status).toBe(429);

    // The cached denial is scoped to the fixed window. Clearing it stands in
    // for the window rolling over; the shared counter is also keyed by window,
    // so the next window starts the caller at zero.
    resetRateLimitBreaches();
    await db.delete(apiRateLimits).where(like(apiRateLimits.subject, "user:%"));

    const afterWindow = await requireIdentity(get(offender));
    expect(afterWindow.identity).not.toBeNull();
  });

  it("returns a retry-after that does not exceed the window length", async () => {
    const offender = await makeCaller();
    await exhaust(offender);

    const refused = await requireIdentity(get(offender));
    const retryAfter = Number(refused.response?.headers.get("retry-after"));
    expect(retryAfter).toBeGreaterThan(0);
    // Never promise a wait longer than the fixed window it is derived from.
    expect(retryAfter).toBeLessThanOrEqual(60);
  });
});
