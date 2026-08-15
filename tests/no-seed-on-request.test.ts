import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/db";
import { apiKeys, relays, users, workOrders } from "@/db/schema";
import { createApiToken } from "@/lib/auth";
import { eq, inArray, like } from "drizzle-orm";

import { GET as listRequests } from "@/app/api/requests/route";
import { GET as listRelays } from "@/app/api/relays/route";

/**
 * Behavioural counterpart to sandbox-not-in-request-path.test.ts.
 *
 * That test asserts no route imports the seed, which is the regression guard.
 * This one serves actual requests and then looks at the tables, because the
 * property that matters to production is not "the import is absent" but "no
 * demonstration row appears as a result of ordinary API traffic".
 */

const SANDBOX_HANDLES = ["northstar-07", "atlas-field", "gridline-2"];
const suffix = randomUUID().slice(0, 8);

let operatorUserId: string;
let operatorToken: string;

function withAuth(token: string, init: RequestInit = {}) {
  return { ...init, headers: { authorization: `Bearer ${token}`, ...(init.headers || {}) } };
}

async function sandboxFootprint() {
  const [seededRelays, seededOrders] = await Promise.all([
    db.select({ handle: relays.handle }).from(relays).where(inArray(relays.handle, SANDBOX_HANDLES)),
    db.select({ id: workOrders.id }).from(workOrders).where(like(workOrders.externalRef, "sandbox-%")),
  ]);
  return { relays: seededRelays.length, orders: seededOrders.length };
}

async function clearSandboxRows() {
  const orders = await db.select({ id: workOrders.id }).from(workOrders).where(like(workOrders.externalRef, "sandbox-%"));
  for (const order of orders) await db.delete(workOrders).where(eq(workOrders.id, order.id));
  await db.delete(relays).where(inArray(relays.handle, SANDBOX_HANDLES));
}

beforeAll(async () => {
  await clearSandboxRows();

  const [operator] = await db
    .insert(users)
    .values({
      email: `no-seed-${suffix}@certifera.local`,
      passwordHash: "unusable:unusable",
      displayName: "No Seed Operator",
      role: "operator",
      status: "active",
      emailVerifiedAt: new Date(),
    })
    .returning();
  operatorUserId = operator.id;

  const generated = createApiToken();
  operatorToken = generated.token;
  await db.insert(apiKeys).values({
    userId: operatorUserId,
    name: "No seed test",
    prefix: generated.prefix,
    tokenHash: generated.tokenHash,
    scopes: ["*"],
  });
});

afterAll(async () => {
  if (operatorUserId) await db.delete(users).where(eq(users.id, operatorUserId));
  await clearSandboxRows();
});

describe("serving requests never seeds demonstration data", () => {
  it("leaves the tables untouched across the routes that used to seed", async () => {
    // vitest runs with NODE_ENV=test, which is exactly the condition under
    // which the old gate seeded by default. If seeding were still reachable,
    // these calls would create it.
    expect(process.env.NODE_ENV).not.toBe("production");
    expect(await sandboxFootprint()).toEqual({ relays: 0, orders: 0 });

    const requestsResponse = await listRequests(new Request("http://localhost/api/requests", withAuth(operatorToken)));
    expect(requestsResponse.status).toBe(200);

    const relaysResponse = await listRelays(new Request("http://localhost/api/relays", withAuth(operatorToken)));
    expect(relaysResponse.status).toBe(200);

    expect(await sandboxFootprint()).toEqual({ relays: 0, orders: 0 });
  });

  it("still serves those routes correctly with no demonstration data present", async () => {
    const response = await listRequests(new Request("http://localhost/api/requests", withAuth(operatorToken)));
    expect(response.status).toBe(200);
    // The route must work on an unseeded database rather than depending on the
    // seed having run as a side effect of an earlier request.
    await expect(response.json()).resolves.toHaveProperty("requests");
  });
});
