import { Readable } from "node:stream";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { sendMock, s3ClientMock } = vi.hoisted(() => ({
  sendMock: vi.fn(),
  s3ClientMock: vi.fn(),
}));

vi.mock("@aws-sdk/client-s3", () => {
  class FakeCommand {
    input: Record<string, unknown>;
    constructor(input: Record<string, unknown>) {
      this.input = input;
    }
  }
  return {
    S3Client: s3ClientMock.mockImplementation(function FakeS3Client(this: { send: typeof sendMock }, config: unknown) {
      this.send = sendMock;
      (this as unknown as { config: unknown }).config = config;
    }),
    PutObjectCommand: class extends FakeCommand {},
    GetObjectCommand: class extends FakeCommand {},
    DeleteObjectCommand: class extends FakeCommand {},
  };
});

import {
  deletePrivateEvidence,
  evidenceStorageStatus,
  readPrivateEvidence,
  scanEvidence,
  storePrivateEvidence,
} from "@/lib/evidence-storage";

const ENV_KEYS = [
  "CERTIFERA_EVIDENCE_STORAGE",
  "CERTIFERA_S3_BUCKET",
  "CERTIFERA_S3_REGION",
  "CERTIFERA_S3_ENDPOINT",
  "CERTIFERA_S3_FORCE_PATH_STYLE",
  "CERTIFERA_S3_ACCESS_KEY_ID",
  "CERTIFERA_S3_SECRET_ACCESS_KEY",
  "CERTIFERA_MALWARE_SCAN_WEBHOOK",
  "CERTIFERA_MALWARE_SCAN_TOKEN",
  "CERTIFERA_EVIDENCE_SCAN_REQUIRED",
];

function clearEnv() {
  for (const key of ENV_KEYS) delete process.env[key];
}

beforeEach(() => {
  clearEnv();
  sendMock.mockReset();
  s3ClientMock.mockClear();
});
afterEach(() => {
  clearEnv();
});

describe("storePrivateEvidence", () => {
  it("defaults to database storage, inlining the bytes as base64", async () => {
    const bytes = Buffer.from("evidence-bytes");
    const result = await storePrivateEvidence({ assetId: "asset-1", bytes, contentType: "image/jpeg", sha256: "abc" });
    expect(result).toEqual({ provider: "database", storageKey: null, contentBase64: bytes.toString("base64") });
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("writes to S3 with server-side encryption and a sharded key when configured", async () => {
    process.env.CERTIFERA_EVIDENCE_STORAGE = "s3";
    process.env.CERTIFERA_S3_BUCKET = "certifera-evidence";
    process.env.CERTIFERA_S3_REGION = "us-east-1";
    sendMock.mockResolvedValue({});

    const bytes = Buffer.from("jpeg-bytes");
    const result = await storePrivateEvidence({ assetId: "abcdef12-3456", bytes, contentType: "image/jpeg", sha256: "deadbeef" });

    expect(result.provider).toBe("s3");
    expect(result.contentBase64).toBeNull();
    expect(result.storageKey).toBe("evidence/ab/abcdef12-3456");
    expect(sendMock).toHaveBeenCalledTimes(1);
    const command = sendMock.mock.calls[0][0];
    expect(command.input).toMatchObject({
      Bucket: "certifera-evidence",
      Key: "evidence/ab/abcdef12-3456",
      ContentType: "image/jpeg",
      ServerSideEncryption: "AES256",
      Metadata: { sha256: "deadbeef", product: "certifera" },
    });
  });

  it("refuses S3 storage when the bucket or region is not configured", async () => {
    process.env.CERTIFERA_EVIDENCE_STORAGE = "s3";
    await expect(storePrivateEvidence({ assetId: "x", bytes: Buffer.from("a"), contentType: "image/png", sha256: "s" })).rejects.toThrow(
      "S3 evidence storage requires CERTIFERA_S3_BUCKET and CERTIFERA_S3_REGION.",
    );
    expect(sendMock).not.toHaveBeenCalled();
  });
});

describe("readPrivateEvidence", () => {
  it("decodes base64 content for database-stored evidence", async () => {
    const original = Buffer.from("hello evidence");
    const buffer = await readPrivateEvidence({ storageProvider: "database", storageKey: null, contentBase64: original.toString("base64") });
    expect(buffer.equals(original)).toBe(true);
  });

  it("throws when a database-stored asset has no payload", async () => {
    await expect(readPrivateEvidence({ storageProvider: "database", storageKey: null, contentBase64: null })).rejects.toThrow(
      "Evidence payload is missing from database storage.",
    );
  });

  it("throws when an S3-stored asset has no storage key", async () => {
    await expect(readPrivateEvidence({ storageProvider: "s3", storageKey: null, contentBase64: null })).rejects.toThrow(
      "Evidence storage key is missing.",
    );
  });

  it("streams a Node Readable object body back into a Buffer", async () => {
    process.env.CERTIFERA_S3_BUCKET = "certifera-evidence";
    process.env.CERTIFERA_S3_REGION = "us-east-1";
    const original = Buffer.from("streamed-bytes");
    sendMock.mockResolvedValue({ Body: Readable.from([original]) });

    const buffer = await readPrivateEvidence({ storageProvider: "s3", storageKey: "evidence/ab/asset-1", contentBase64: null });
    expect(buffer.equals(original)).toBe(true);
    const command = sendMock.mock.calls[0][0];
    expect(command.input).toMatchObject({ Bucket: "certifera-evidence", Key: "evidence/ab/asset-1" });
  });

  it("reads a web-stream style body via transformToByteArray", async () => {
    process.env.CERTIFERA_S3_BUCKET = "certifera-evidence";
    process.env.CERTIFERA_S3_REGION = "us-east-1";
    const original = Buffer.from("web-stream-bytes");
    sendMock.mockResolvedValue({ Body: { transformToByteArray: async () => new Uint8Array(original) } });

    const buffer = await readPrivateEvidence({ storageProvider: "s3", storageKey: "evidence/ab/asset-2", contentBase64: null });
    expect(buffer.equals(original)).toBe(true);
  });

  it("throws when the object body cannot be read in any known shape", async () => {
    process.env.CERTIFERA_S3_BUCKET = "certifera-evidence";
    process.env.CERTIFERA_S3_REGION = "us-east-1";
    sendMock.mockResolvedValue({ Body: null });

    await expect(readPrivateEvidence({ storageProvider: "s3", storageKey: "evidence/ab/asset-3", contentBase64: null })).rejects.toThrow(
      "Evidence object could not be read from object storage.",
    );
  });
});

describe("deletePrivateEvidence", () => {
  it("is a no-op for database-stored evidence", async () => {
    await deletePrivateEvidence({ storageProvider: "database", storageKey: null });
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("is a no-op for an S3 record missing its storage key", async () => {
    await deletePrivateEvidence({ storageProvider: "s3", storageKey: null });
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("removes the object from S3 when a storage key is present", async () => {
    process.env.CERTIFERA_S3_BUCKET = "certifera-evidence";
    process.env.CERTIFERA_S3_REGION = "us-east-1";
    sendMock.mockResolvedValue({});
    await deletePrivateEvidence({ storageProvider: "s3", storageKey: "evidence/ab/asset-1" });
    expect(sendMock).toHaveBeenCalledTimes(1);
    const command = sendMock.mock.calls[0][0];
    expect(command.input).toMatchObject({ Bucket: "certifera-evidence", Key: "evidence/ab/asset-1" });
  });
});

describe("scanEvidence", () => {
  const input = { bytes: Buffer.from("scan-me"), fileName: "evidence.jpg", contentType: "image/jpeg", sha256: "abc123" };

  it("validates immediately when no scanner is configured and scanning is not required", async () => {
    const result = await scanEvidence(input);
    expect(result).toEqual({ status: "validated" });
  });

  it("leaves evidence pending when scanning is required but no scanner is configured", async () => {
    process.env.CERTIFERA_EVIDENCE_SCAN_REQUIRED = "true";
    const result = await scanEvidence(input);
    expect(result).toEqual({ status: "pending" });
  });

  it("validates when the configured scanner reports the file clean", async () => {
    process.env.CERTIFERA_MALWARE_SCAN_WEBHOOK = "https://scan.example/webhook";
    process.env.CERTIFERA_MALWARE_SCAN_TOKEN = "scan-token";
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ clean: true }) });
    vi.stubGlobal("fetch", fetchMock);

    const result = await scanEvidence(input);
    expect(result).toEqual({ status: "validated" });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://scan.example/webhook",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ authorization: "Bearer scan-token", "content-type": "application/json" }),
      }),
    );
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body).toMatchObject({ fileName: "evidence.jpg", contentType: "image/jpeg", sha256: "abc123", contentBase64: input.bytes.toString("base64") });
    vi.unstubAllGlobals();
  });

  it("rejects when the configured scanner reports the file unclean", async () => {
    process.env.CERTIFERA_MALWARE_SCAN_WEBHOOK = "https://scan.example/webhook";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ clean: false }) }));
    const result = await scanEvidence(input);
    expect(result).toEqual({ status: "rejected" });
    vi.unstubAllGlobals();
  });

  it("falls back to pending (when required) if the scanner responds with an error status", async () => {
    process.env.CERTIFERA_MALWARE_SCAN_WEBHOOK = "https://scan.example/webhook";
    process.env.CERTIFERA_EVIDENCE_SCAN_REQUIRED = "true";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) }));
    const result = await scanEvidence(input);
    expect(result).toEqual({ status: "pending" });
    vi.unstubAllGlobals();
  });

  it("falls back to validated (when not required) if the scanner response body is not JSON", async () => {
    process.env.CERTIFERA_MALWARE_SCAN_WEBHOOK = "https://scan.example/webhook";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => { throw new Error("bad json"); } }));
    const result = await scanEvidence(input);
    expect(result).toEqual({ status: "validated" });
    vi.unstubAllGlobals();
  });
});

describe("evidenceStorageStatus", () => {
  it("does not report database storage as production-configured", () => {
    // Database storage is a development fallback that base64-encodes whole
    // files into Postgres. Reporting it as "configured" told the readiness
    // check the deployment was ready while evidence accumulated in the primary
    // database, its backups, and its WAL.
    expect(evidenceStorageStatus()).toEqual({ provider: "database", configured: false, scanRequired: false, scannerConfigured: false });
  });

  it("reports S3 storage as unconfigured until bucket and region are both set", () => {
    process.env.CERTIFERA_EVIDENCE_STORAGE = "s3";
    expect(evidenceStorageStatus().configured).toBe(false);
    process.env.CERTIFERA_S3_BUCKET = "certifera-evidence";
    expect(evidenceStorageStatus().configured).toBe(false);
    process.env.CERTIFERA_S3_REGION = "us-east-1";
    expect(evidenceStorageStatus().configured).toBe(true);
  });

  it("reports scan requirement and scanner configuration independently", () => {
    process.env.CERTIFERA_EVIDENCE_SCAN_REQUIRED = "true";
    process.env.CERTIFERA_MALWARE_SCAN_WEBHOOK = "https://scan.example/webhook";
    expect(evidenceStorageStatus()).toMatchObject({ scanRequired: true, scannerConfigured: true });
  });
});
