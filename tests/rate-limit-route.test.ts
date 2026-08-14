import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { db } from "@/db";
import { apiRateLimits } from "@/db/schema";
import { enforceRateLimit, normalizeRateLimitRoute } from "@/lib/auth";
import { and, eq, like } from "drizzle-orm";

/**
 * The rate-limit key is (subject, route, window). If an outcome id survives into
 * `route`, every id opens its own bucket and the per-route ceiling silently
 * multiplies by the number of ids a caller touches — on /review and /settlement
 * that is the payout path.
 */

const subject = `test:${randomUUID()}`;

afterAll(async () => {
  await db.delete(apiRateLimits).where(eq(apiRateLimits.subject, subject));
});

describe("normalizeRateLimitRoute", () => {
  it("collapses a UUID outcome id", () => {
    expect(normalizeRateLimitRoute("/api/requests/11111111-1111-4111-8111-111111111111/review")).toBe("/api/requests/:id/review");
  });

  it("collapses an id that is not a UUID, so a junk id cannot mint a bucket", () => {
    expect(normalizeRateLimitRoute("/api/requests/not-a-uuid/settlement")).toBe("/api/requests/:id/settlement");
  });

  it("keeps distinct sub-routes distinct", () => {
    const review = normalizeRateLimitRoute(`/api/requests/${randomUUID()}/review`);
    const settlement = normalizeRateLimitRoute(`/api/requests/${randomUUID()}/settlement`);
    expect(review).not.toBe(settlement);
  });

  it("leaves routes without an id untouched", () => {
    expect(normalizeRateLimitRoute("/api/requests")).toBe("/api/requests");
    expect(normalizeRateLimitRoute("/api/evidence")).toBe("/api/evidence");
  });

  it("collapses a UUID anywhere in the path, covering routes added later", () => {
    expect(normalizeRateLimitRoute(`/api/relays/${randomUUID()}/heartbeat`)).toBe("/api/relays/:id/heartbeat");
  });
});

describe("enforceRateLimit bucketing", () => {
  it("counts calls against different outcome ids in one shared bucket", async () => {
    const route = normalizeRateLimitRoute(`/api/requests/${randomUUID()}/review`);
    const other = normalizeRateLimitRoute(`/api/requests/${randomUUID()}/review`);
    expect(route).toBe(other);

    const first = await enforceRateLimit({ subject, route, limit: 2 });
    const second = await enforceRateLimit({ subject, route: other, limit: 2 });
    const third = await enforceRateLimit({ subject, route: normalizeRateLimitRoute(`/api/requests/${randomUUID()}/review`), limit: 2 });

    expect(first.allowed).toBe(true);
    expect(second.allowed).toBe(true);
    // Third call across a third distinct id still exhausts the shared ceiling.
    expect(third.allowed).toBe(false);
  });

  it("writes one row per route rather than one per id", async () => {
    const subjectForRows = `test:${randomUUID()}`;
    for (let index = 0; index < 5; index += 1) {
      await enforceRateLimit({ subject: subjectForRows, route: normalizeRateLimitRoute(`/api/requests/${randomUUID()}/activity`), limit: 100 });
    }
    const rows = await db
      .select({ route: apiRateLimits.route })
      .from(apiRateLimits)
      .where(and(eq(apiRateLimits.subject, subjectForRows), like(apiRateLimits.route, "/api/requests/%")));
    expect(rows).toHaveLength(1);
    await db.delete(apiRateLimits).where(eq(apiRateLimits.subject, subjectForRows));
  });
});
