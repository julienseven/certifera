import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { Readable } from "node:stream";
import { recordOperationalEvent } from "@/lib/observability";

export type EvidenceStorageProvider = "database" | "s3";

type StoredEvidence = {
  provider: EvidenceStorageProvider;
  storageKey: string | null;
  contentBase64: string | null;
};

/**
 * Where evidence bytes live.
 *
 * "database" base64-encodes the whole file into a Postgres row, which inflates
 * an 8 MB upload to ~11 MB of text and carries it into every backup, every WAL
 * segment, and every replica. It exists so a developer can run the product
 * without object storage credentials, and it is not a production strategy.
 *
 * Production is required to set "s3" (enforced by lib/env at startup), so the
 * remaining default here only ever applies to development and preview.
 */
function storageProvider(): EvidenceStorageProvider {
  const configured = process.env.CERTIFERA_EVIDENCE_STORAGE;
  if (configured === "s3") return "s3";
  if (configured === "database") return "database";
  // Inferred rather than silently falling back to the heavier option: a
  // deployment that configured a bucket clearly meant to use it.
  return process.env.CERTIFERA_S3_BUCKET && process.env.CERTIFERA_S3_REGION ? "s3" : "database";
}

function configuredS3Client() {
  const bucket = process.env.CERTIFERA_S3_BUCKET;
  const region = process.env.CERTIFERA_S3_REGION;
  if (!bucket || !region) throw new Error("S3 evidence storage requires CERTIFERA_S3_BUCKET and CERTIFERA_S3_REGION.");
  return {
    bucket,
    client: new S3Client({
      region,
      endpoint: process.env.CERTIFERA_S3_ENDPOINT || undefined,
      forcePathStyle: process.env.CERTIFERA_S3_FORCE_PATH_STYLE === "true",
      credentials: process.env.CERTIFERA_S3_ACCESS_KEY_ID && process.env.CERTIFERA_S3_SECRET_ACCESS_KEY
        ? { accessKeyId: process.env.CERTIFERA_S3_ACCESS_KEY_ID, secretAccessKey: process.env.CERTIFERA_S3_SECRET_ACCESS_KEY }
        : undefined,
    }),
  };
}

export async function storePrivateEvidence(input: { assetId: string; bytes: Buffer; contentType: string; sha256: string }): Promise<StoredEvidence> {
  const provider = storageProvider();
  if (provider === "database") return { provider, storageKey: null, contentBase64: input.bytes.toString("base64") };

  const { client, bucket } = configuredS3Client();
  const key = `evidence/${input.assetId.slice(0, 2)}/${input.assetId}`;
  await client.send(new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: input.bytes,
    ContentType: input.contentType,
    ServerSideEncryption: "AES256",
    Metadata: { sha256: input.sha256, product: "certifera" },
  }));
  return { provider, storageKey: key, contentBase64: null };
}

async function streamToBuffer(body: unknown) {
  if (body instanceof Readable) {
    const chunks: Buffer[] = [];
    for await (const chunk of body) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    return Buffer.concat(chunks);
  }
  if (body && typeof body === "object" && "transformToByteArray" in body && typeof body.transformToByteArray === "function") {
    return Buffer.from(await body.transformToByteArray());
  }
  throw new Error("Evidence object could not be read from object storage.");
}

export async function readPrivateEvidence(asset: { storageProvider: string; storageKey: string | null; contentBase64: string | null }) {
  if (asset.storageProvider !== "s3") {
    if (!asset.contentBase64) throw new Error("Evidence payload is missing from database storage.");
    return Buffer.from(asset.contentBase64, "base64");
  }
  if (!asset.storageKey) throw new Error("Evidence storage key is missing.");
  const { client, bucket } = configuredS3Client();
  const object = await client.send(new GetObjectCommand({ Bucket: bucket, Key: asset.storageKey }));
  return streamToBuffer(object.Body);
}

export async function deletePrivateEvidence(asset: { storageProvider: string; storageKey: string | null }) {
  if (asset.storageProvider !== "s3" || !asset.storageKey) return;
  const { client, bucket } = configuredS3Client();
  await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: asset.storageKey }));
}

/**
 * How long the upload request will wait on the scanner.
 *
 * The call carries the whole file base64-encoded, so it is not fast, but it is
 * synchronous with a relay's upload and cannot be allowed to run long.
 */
const SCAN_TIMEOUT_MS = 20_000;

export async function scanEvidence(input: { bytes: Buffer; fileName: string; contentType: string; sha256: string }) {
  const scannerUrl = process.env.CERTIFERA_MALWARE_SCAN_WEBHOOK;
  const scanRequired = process.env.CERTIFERA_EVIDENCE_SCAN_REQUIRED === "true";
  if (!scannerUrl) return scanRequired ? { status: "pending" as const } : { status: "validated" as const };

  /**
   * Bounded, and a transport failure is treated as the same event as an
   * unusable reply.
   *
   * The call had no deadline, so a scanner that accepted the connection and
   * never answered held the upload request open — with the file buffered behind
   * it — until the platform killed the invocation, and the relay's retry opened
   * another. A scanner that could not be reached at all threw instead, so an
   * outage returned 500 on every upload even where scanning was optional, while
   * a scanner answering 502 degraded to the fallback. Both now take the
   * fallback: blocked at "pending" where scanning is required, cleared where it
   * is not, and recorded either way.
   */
  const response = await fetch(scannerUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(process.env.CERTIFERA_MALWARE_SCAN_TOKEN ? { authorization: `Bearer ${process.env.CERTIFERA_MALWARE_SCAN_TOKEN}` } : {}),
    },
    body: JSON.stringify({
      fileName: input.fileName,
      contentType: input.contentType,
      sha256: input.sha256,
      contentBase64: input.bytes.toString("base64"),
    }),
    signal: AbortSignal.timeout(SCAN_TIMEOUT_MS),
  }).catch(() => null);
  const payload = response ? ((await response.json().catch(() => null)) as { clean?: boolean } | null) : null;
  if (!response?.ok || !payload) {
    await recordOperationalEvent({
      level: scanRequired ? "warning" : "error",
      service: "evidence",
      code: "scan_response_invalid",
      message: response
        ? `Malware scanner returned an unusable response (status ${response.status}).`
        : `Malware scanner could not be reached within ${SCAN_TIMEOUT_MS}ms.`,
      resourceType: "evidence_scan",
      data: { sha256: input.sha256, scanRequired, fallbackStatus: scanRequired ? "pending" : "validated" },
    });
    return scanRequired ? { status: "pending" as const } : { status: "validated" as const };
  }
  return { status: payload.clean === true ? "validated" as const : "rejected" as const };
}

export function evidenceStorageStatus() {
  const provider = storageProvider();
  const s3Configured = Boolean(process.env.CERTIFERA_S3_BUCKET && process.env.CERTIFERA_S3_REGION);
  return {
    provider,
    // Database storage is a development fallback, so it is never "configured"
    // in the sense readiness means: reporting it as such told an operator the
    // deployment was ready while evidence bytes were accumulating in Postgres.
    configured: provider === "s3" && s3Configured,
    scanRequired: process.env.CERTIFERA_EVIDENCE_SCAN_REQUIRED === "true",
    scannerConfigured: Boolean(process.env.CERTIFERA_MALWARE_SCAN_WEBHOOK),
  };
}
