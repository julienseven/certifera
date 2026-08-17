import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/db";
import { apiKeys, users } from "@/db/schema";
import { createApiToken } from "@/lib/auth";
import { GET as getRecommendations } from "@/app/api/admin/recommendations/route";
import { eq } from "drizzle-orm";

/**
 * The recommendations route reads the same metrics the scorecard reports. It
 * used to get them by calling its own HTTP endpoint and forwarding only the
 * caller's cookie, which meant an operator holding an API key — the documented
 * way to reach this API — authenticated at the outer route and then failed to
 * authenticate at the inner one, and the whole thing came back as a 500.
 */

const suffix = randomUUID().slice(0, 8);
const adminEmail = `recs-admin-${suffix}@certifera.local`;
let adminToken: string;
let adminUserId: string;

beforeAll(async () => {
  const [admin] = await db
    .insert(users)
    .values({ email: adminEmail, passwordHash: "unusable:unusable", displayName: "Recs Admin", role: "admin", status: "active", emailVerifiedAt: new Date() })
    .returning();
  adminUserId = admin.id;
  const generated = createApiToken();
  adminToken = generated.token;
  await db.insert(apiKeys).values({ userId: adminUserId, name: "Recommendations test", prefix: generated.prefix, tokenHash: generated.tokenHash, scopes: ["*"] });
});

afterAll(async () => {
  await db.delete(apiKeys).where(eq(apiKeys.userId, adminUserId));
  await db.delete(users).where(eq(users.id, adminUserId));
});

describe("beta recommendations", () => {
  it("serves a token-authenticated caller", async () => {
    const response = await getRecommendations(
      new Request("http://localhost/api/admin/recommendations", { headers: { authorization: `Bearer ${adminToken}` } }),
    );
    expect(response.status).toBe(200);
    const payload = (await response.json()) as { recommendations: { priority: string; title: string }[] };
    expect(Array.isArray(payload.recommendations)).toBe(true);
  });
});
