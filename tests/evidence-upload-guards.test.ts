import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

const { sendMock, s3ClientMock, writeAuditMock } = vi.hoisted(() => ({
  sendMock: vi.fn(),
  s3ClientMock: vi.fn(),
  writeAuditMock: vi.fn(),
}));

vi.mock("@aws-sdk/client-s3", () => {
  class FakeCommand {
    input: Record<string, unknown>;
    constructor(input: Record<string, unknown>) {
      this.input = input;
    }
  }
  return {
    S3Client: s3ClientMock.mockImplementation(function FakeS3Client(this: { send: typeof sendMock }) {
      this.send = sendMock;
    }),
    PutObjectCommand: class extends FakeCommand {},
    GetObjectCommand: class extends FakeCommand {},
    DeleteObjectCommand: class extends FakeCommand {},
  };
});

// The upload route writes an audit row after the asset row commits. Only that
// one export is swapped; requireIdentity still resolves real credentials.
vi.mock("@/lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth")>();
  return { ...actual, writeAudit: (...args: Parameters<typeof actual.writeAudit>) => writeAuditMock(...args) };
});

import { db } from "@/db";
import { apiKeys, evidenceAssets, relays, users, workOrders } from "@/db/schema";
import { createApiToken } from "@/lib/auth";
import { and, eq } from "drizzle-orm";

import { POST as uploadEvidence } from "@/app/api/evidence/route";
import { POST as submitProof } from "@/app/api/requests/[id]/proof/route";

/**
 * The upload route is the only door private evidence comes through, so its
 * guards are the whole of the product's evidence integrity story: a declared
 * size ceiling, a scan gate that proof submission depends on, a compensating
 * delete for a failed insert, and an error path that must not describe the
 * storage backend to the caller.
 */

const suffix = randomUUID().slice(0, 8);
const MAX_BYTES = 8 * 1024 * 1024;

// A minimal but structurally valid JFIF header, so the signature check passes.
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xff, 0xd9]);

const ENV_KEYS = ["CERTIFERA_EVIDENCE_STORAGE", "CERTIFERA_S3_BUCKET", "CERTIFERA_S3_REGION", "CERTIFERA_EVIDENCE_SCAN_REQUIRED", "CERTIFERA_MALWARE_SCAN_WEBHOOK"];

let relayId: string;
let relayToken: string;
let workOrderId: string;
const userIds: string[] = [];

function uploadRequest(init: { headers?: Record<string, string> } = {}) {
  const form = new FormData();
  form.set("workOrderId", workOrderId);
  form.set("file", new Blob([JPEG], { type: "image/jpeg" }), "evidence.jpg");
  return new Request("http://localhost/api/evidence", {
    method: "POST",
    body: form,
    headers: { authorization: `Bearer ${relayToken}`, ...(init.headers || {}) },
  });
}

beforeAll(async () => {
  const [relay] = await db
    .insert(relays)
    .values({ handle: `guard-${suffix}`, zone: "Test zone", specialty: "evidence guards", coverageCategories: ["Infrastructure"], active: true })
    .returning();
  relayId = relay.id;

  const [relayUser] = await db
    .insert(users)
    .values({ email: `guard-${suffix}@certifera.local`, passwordHash: "unusable:unusable", displayName: "Guard relay", role: "relay", status: "active", relayId, emailVerifiedAt: new Date() })
    .returning();
  userIds.push(relayUser.id);

  const generated = createApiToken();
  relayToken = generated.token;
  await db.insert(apiKeys).values({ userId: relayUser.id, name: "Evidence guards", prefix: generated.prefix, tokenHash: generated.tokenHash, scopes: ["proofs:write"] });

  const [workOrder] = await db
    .insert(workOrders)
    .values({
      externalRef: `guard-${suffix}`,
      title: "Evidence guard outcome",
      category: "Infrastructure",
      location: "Test City",
      rewardCents: 25000,
      requester: "operator/guard-test",
      status: "matched",
      selectedRelayId: relayId,
      proofRequirements: [],
    })
    .returning();
  workOrderId = workOrder.id;
});

afterEach(async () => {
  for (const key of ENV_KEYS) delete process.env[key];
  // clearMocks only clears recorded calls, so an implementation set by one test
  // would otherwise stay installed for the rest of the file.
  sendMock.mockReset();
  writeAuditMock.mockReset();
  await db.delete(evidenceAssets).where(eq(evidenceAssets.workOrderId, workOrderId));
});

afterAll(async () => {
  await db.delete(workOrders).where(eq(workOrders.id, workOrderId));
  for (const id of userIds) await db.delete(users).where(eq(users.id, id));
  await db.delete(relays).where(eq(relays.id, relayId));
});

describe("evidence upload size ceiling", () => {
  it("refuses a body larger than the ceiling without reading it", async () => {
    // The 8 MB check runs on the parsed file, which is after formData() has
    // already pulled the whole body into memory. A caller with a valid relay
    // key could therefore make the process buffer an arbitrary payload before
    // being told the payload was too large.
    const request = uploadRequest({ headers: { "content-length": String(64 * 1024 * 1024) } });
    const response = await uploadEvidence(request);

    expect(response.status).toBe(413);
    expect(request.bodyUsed).toBe(false);
  });

  it("still accepts a body whose declared length covers the ceiling plus the multipart envelope", async () => {
    const request = uploadRequest({ headers: { "content-length": String(MAX_BYTES + 1024) } });
    const response = await uploadEvidence(request);
    expect(response.status).toBe(201);
  });
});

describe("evidence upload failure reporting", () => {
  it("does not describe the storage backend to the caller when storage fails", async () => {
    // Selecting S3 without a bucket makes the storage client throw a message
    // naming the configuration it wanted. Returning error.message verbatim
    // handed that, and any Postgres constraint text, to the uploading relay.
    process.env.CERTIFERA_EVIDENCE_STORAGE = "s3";

    const response = await uploadEvidence(uploadRequest());
    expect(response.status).toBe(500);
    const { error } = await response.json();
    expect(error).toBe("Could not securely store the evidence file.");
    expect(error).not.toContain("CERTIFERA_S3_BUCKET");
  });
});

describe("evidence bytes outlive a failed audit write", () => {
  it("keeps the stored object when the asset row committed and only the audit write failed", async () => {
    // The compensating delete exists for a failed insert. Wrapping the audit
    // write in the same try made a transient audit failure destroy the object
    // behind an asset row that had already committed: a live row whose sha256
    // attests to bytes nobody can read again.
    process.env.CERTIFERA_EVIDENCE_STORAGE = "s3";
    process.env.CERTIFERA_S3_BUCKET = "certifera-evidence";
    process.env.CERTIFERA_S3_REGION = "us-east-1";
    sendMock.mockResolvedValue({});
    writeAuditMock.mockRejectedValue(new Error("audit log unavailable"));

    const response = await uploadEvidence(uploadRequest());
    expect(response.status).toBe(500);

    const [asset] = await db.select().from(evidenceAssets).where(eq(evidenceAssets.workOrderId, workOrderId)).limit(1);
    expect(asset).toBeDefined();
    const deletes = sendMock.mock.calls.filter((call) => call[0].constructor.name === "DeleteObjectCommand");
    expect(deletes).toEqual([]);
  });
});

describe("scan gating over the real routes", () => {
  it("blocks proof submission for an asset the scanner never cleared", async () => {
    process.env.CERTIFERA_EVIDENCE_SCAN_REQUIRED = "true";

    const uploaded = await uploadEvidence(uploadRequest());
    expect(uploaded.status).toBe(201);
    const { asset } = await uploaded.json();
    expect(asset.scanStatus).toBe("pending");

    const proofResponse = await submitProof(
      new Request(`http://localhost/api/requests/${workOrderId}/proof`, {
        method: "POST",
        headers: { authorization: `Bearer ${relayToken}`, "content-type": "application/json" },
        body: JSON.stringify({ observation: "Field observation long enough to pass validation.", evidenceAssetId: asset.id, relayId }),
      }),
      { params: Promise.resolve({ id: workOrderId }) },
    );
    expect(proofResponse.status).toBe(409);

    const [row] = await db
      .select({ id: evidenceAssets.id })
      .from(evidenceAssets)
      .where(and(eq(evidenceAssets.id, asset.id), eq(evidenceAssets.scanStatus, "validated")))
      .limit(1);
    expect(row).toBeUndefined();

    // And the block lifts once the scanner answers, which is the half that did
    // not exist: "pending" had no exit, so this 409 used to be permanent for
    // every upload the scanner was too slow to clear.
    const previousSecret = process.env.CERTIFERA_SCAN_CALLBACK_SECRET;
    process.env.CERTIFERA_SCAN_CALLBACK_SECRET = `guard-scan-${suffix}`;
    try {
      const { POST: scanCallback } = await import("@/app/api/internal/evidence-scan/route");
      const applied = await scanCallback(
        new Request("http://localhost/api/internal/evidence-scan", {
          method: "POST",
          headers: { authorization: `Bearer guard-scan-${suffix}`, "content-type": "application/json" },
          body: JSON.stringify({ assetId: asset.id, sha256: asset.sha256, clean: true }),
        }),
      );
      expect(await applied.json()).toMatchObject({ applied: true, scanStatus: "validated" });

      const afterScan = await submitProof(
        new Request(`http://localhost/api/requests/${workOrderId}/proof`, {
          method: "POST",
          headers: { authorization: `Bearer ${relayToken}`, "content-type": "application/json" },
          body: JSON.stringify({ observation: "Field observation long enough to pass validation.", evidenceAssetId: asset.id, relayId }),
        }),
        { params: Promise.resolve({ id: workOrderId }) },
      );
      expect(afterScan.status).toBe(201);
    } finally {
      if (previousSecret === undefined) delete process.env.CERTIFERA_SCAN_CALLBACK_SECRET;
      else process.env.CERTIFERA_SCAN_CALLBACK_SECRET = previousSecret;
    }
  });
});
