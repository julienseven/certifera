import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/db";
import { evidenceAssets, relays, users, workOrders } from "@/db/schema";
import { hashPassword } from "@/lib/auth";
import { POST as scanCallback } from "@/app/api/internal/evidence-scan/route";
import { eq, inArray } from "drizzle-orm";

/**
 * The other half of the scan flow.
 *
 * `scanEvidence` gives the scanner 20 seconds and falls back to "pending" when
 * it cannot get a verdict in that window. Nothing resolved a pending row, so
 * with scan gating on — the documented production setting — a slow scan blocked
 * that outcome's proof submission permanently.
 */
const suffix = randomUUID().slice(0, 8);
const SECRET = `scan-secret-${suffix}`;

let relayId: string;
let userId: string;
let workOrderId: string;
const assetIds: string[] = [];

function callback(body: unknown, authorization: string | null = `Bearer ${SECRET}`) {
  return new Request("http://localhost/api/internal/evidence-scan", {
    method: "POST",
    headers: { "content-type": "application/json", ...(authorization ? { authorization } : {}) },
    body: JSON.stringify(body),
  });
}

/** Seeds an upload sitting at whatever scan status the case needs. */
async function seedAsset(scanStatus: string, sha256 = randomUUID().replaceAll("-", "")) {
  const [asset] = await db
    .insert(evidenceAssets)
    .values({
      workOrderId,
      relayId,
      uploadedByUserId: userId,
      originalName: "proof.jpg",
      contentType: "image/jpeg",
      storageProvider: "database",
      contentBase64: "",
      byteSize: 12,
      sha256,
      scanStatus,
    })
    .returning({ id: evidenceAssets.id, sha256: evidenceAssets.sha256 });
  assetIds.push(asset.id);
  return asset;
}

beforeAll(async () => {
  process.env.CERTIFERA_SCAN_CALLBACK_SECRET = SECRET;
  const [relay] = await db.insert(relays).values({ handle: `scan-callback-${suffix}`, zone: "test-zone", specialty: "inspection" }).returning();
  relayId = relay.id;
  const [user] = await db
    .insert(users)
    .values({
      email: `scan-callback-${suffix}@certifera.local`,
      passwordHash: await hashPassword("correct horse battery staple"),
      displayName: "Scan Callback Relay User",
      role: "relay",
      status: "active",
      relayId,
      emailVerifiedAt: new Date(),
    })
    .returning();
  userId = user.id;
  const [order] = await db
    .insert(workOrders)
    .values({
      externalRef: `scan-callback-${suffix}`,
      title: "Scan callback",
      category: "inspection",
      location: "test-zone",
      rewardCents: 1000,
      requester: "scan-callback-test",
      proofRequirements: ["photo"],
      status: "matched",
      selectedRelayId: relayId,
    })
    .returning();
  workOrderId = order.id;
});

afterAll(async () => {
  delete process.env.CERTIFERA_SCAN_CALLBACK_SECRET;
  if (assetIds.length) await db.delete(evidenceAssets).where(inArray(evidenceAssets.id, assetIds));
  await db.delete(workOrders).where(eq(workOrders.id, workOrderId));
  await db.delete(users).where(eq(users.id, userId));
  await db.delete(relays).where(eq(relays.id, relayId));
});

describe("evidence scan callback", () => {
  it("clears a pending upload so its proof can be submitted", async () => {
    const asset = await seedAsset("pending");
    const response = await scanCallback(callback({ assetId: asset.id, sha256: asset.sha256, clean: true }));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, applied: true, scanStatus: "validated" });

    const [row] = await db.select().from(evidenceAssets).where(eq(evidenceAssets.id, asset.id)).limit(1);
    expect(row.scanStatus).toBe("validated");
    expect(row.scannedAt).not.toBeNull();
  });

  it("records a rejection", async () => {
    const asset = await seedAsset("pending");
    await scanCallback(callback({ assetId: asset.id, sha256: asset.sha256, clean: false }));

    const [row] = await db.select().from(evidenceAssets).where(eq(evidenceAssets.id, asset.id)).limit(1);
    expect(row.scanStatus).toBe("rejected");
  });

  it("will not let a redelivered verdict reopen an asset it already settled", async () => {
    const asset = await seedAsset("pending");
    await scanCallback(callback({ assetId: asset.id, sha256: asset.sha256, clean: false }));
    // A scanner retrying a delivery it never saw acknowledged must not be able
    // to talk a rejected file back into being usable.
    const replay = await scanCallback(callback({ assetId: asset.id, sha256: asset.sha256, clean: true }));

    expect(await replay.json()).toMatchObject({ ok: true, applied: false });
    const [row] = await db.select().from(evidenceAssets).where(eq(evidenceAssets.id, asset.id)).limit(1);
    expect(row.scanStatus).toBe("rejected");
  });

  it("will not resolve an asset with a verdict computed for a different file", async () => {
    const asset = await seedAsset("pending");
    const response = await scanCallback(callback({ assetId: asset.id, sha256: randomUUID().replaceAll("-", ""), clean: true }));

    expect(await response.json()).toMatchObject({ applied: false });
    const [row] = await db.select().from(evidenceAssets).where(eq(evidenceAssets.id, asset.id)).limit(1);
    expect(row.scanStatus).toBe("pending");
  });

  it("refuses a caller without the exact secret", async () => {
    const asset = await seedAsset("pending");
    const body = { assetId: asset.id, sha256: asset.sha256, clean: true };

    expect((await scanCallback(callback(body, null))).status).toBe(401);
    expect((await scanCallback(callback(body, `Bearer ${SECRET.slice(0, -1)}X`))).status).toBe(401);
    expect((await scanCallback(callback(body, `Bearer ${SECRET.slice(0, -1)}`))).status).toBe(401);

    const [row] = await db.select().from(evidenceAssets).where(eq(evidenceAssets.id, asset.id)).limit(1);
    expect(row.scanStatus).toBe("pending");
  });

  it("rejects a callback that does not carry a verdict", async () => {
    const asset = await seedAsset("pending");
    expect((await scanCallback(callback({ assetId: asset.id, sha256: asset.sha256 }))).status).toBe(400);
    expect((await scanCallback(callback({ assetId: asset.id, sha256: asset.sha256, clean: "yes" }))).status).toBe(400);
  });
});
