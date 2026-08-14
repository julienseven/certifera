import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { Readable } from "node:stream";
import { recordOperationalEvent } from "@/lib/observability";

export type EvidenceStorageProvider = "database" | "s3";

type StoredEvidence = {
  provider: EvidenceStorageProvider;
  storageKey: string | null;
  contentBase64: string | null;
};

function storageProvider(): EvidenceStorageProvider {
  return process.env.CERTIFERA_EVIDENCE_STORAGE === "s3" ? "s3" : "database";
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

export async function scanEvidence(input: { bytes: Buffer; fileName: string; contentType: string; sha256: string }) {
  const scannerUrl = process.env.CERTIFERA_MALWARE_SCAN_WEBHOOK;
  const scanRequired = process.env.CERTIFERA_EVIDENCE_SCAN_REQUIRED === "true";
  if (!scannerUrl) return scanRequired ? { status: "pending" as const } : { status: "validated" as const };

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
  });
  const payload = (await response.json().catch(() => null)) as { clean?: boolean } | null;
  if (!response.ok || !payload) {
    await recordOperationalEvent({
      level: scanRequired ? "warning" : "error",
      service: "evidence",
      code: "scan_response_invalid",
      message: `Malware scanner returned an unusable response (status ${response.status}).`,
      resourceType: "evidence_scan",
      data: { sha256: input.sha256, scanRequired, fallbackStatus: scanRequired ? "pending" : "validated" },
    });
    return scanRequired ? { status: "pending" as const } : { status: "validated" as const };
  }
  return { status: payload.clean === true ? "validated" as const : "rejected" as const };
}

export function evidenceStorageStatus() {
  const provider = storageProvider();
  return {
    provider,
    configured: provider === "database" || Boolean(process.env.CERTIFERA_S3_BUCKET && process.env.CERTIFERA_S3_REGION),
    scanRequired: process.env.CERTIFERA_EVIDENCE_SCAN_REQUIRED === "true",
    scannerConfigured: Boolean(process.env.CERTIFERA_MALWARE_SCAN_WEBHOOK),
  };
}
