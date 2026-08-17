import { createHash, randomUUID } from "node:crypto";
import { db } from "@/db";
import { evidenceAssets, workOrders } from "@/db/schema";
import { hasRole, requireIdentity, writeAudit } from "@/lib/auth";
import { analyzeEvidence } from "@/lib/evidence-intelligence";
import { recordOperationalEvent, reportException } from "@/lib/observability";
import { deletePrivateEvidence, readPrivateEvidence, scanEvidence, storePrivateEvidence } from "@/lib/evidence-storage";
import { and, eq, isNull } from "drizzle-orm";

const MAX_BYTES = 8 * 1024 * 1024;
// Multipart wraps the file in a boundary, part headers, and the work order
// field, so a legitimate 8 MB upload declares a little more than 8 MB.
const MAX_BODY_BYTES = MAX_BYTES + 64 * 1024;
const allowed = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);

function safeName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120) || "evidence";
}

function matchesSignature(bytes: Buffer, type: string) {
  if (type === "image/jpeg") return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (type === "image/png") return bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (type === "image/webp") return bytes.subarray(0, 4).toString() === "RIFF" && bytes.subarray(8, 12).toString() === "WEBP";
  if (type === "application/pdf") return bytes.subarray(0, 5).toString() === "%PDF-";
  return false;
}

export async function POST(request: Request) {
  const auth = await requireIdentity(request, { roles: ["relay", "admin"], scope: "proofs:write" });
  if (!auth.identity) return auth.response;
  // The 8 MB ceiling below is measured on the parsed file, which is one step too
  // late: formData() has already pulled the entire body into memory by then, so
  // any caller holding a relay key could make the process buffer a payload of
  // any size before being told the payload was too large. A declared length past
  // the ceiling is refused before a byte is read. A request that declares no
  // length still falls through to the check on the parsed file.
  const declaredBytes = Number(request.headers.get("content-length"));
  if (declaredBytes > MAX_BODY_BYTES) return Response.json({ error: "Evidence must be between 1 byte and 8 MB." }, { status: 413 });
  try {
    const formData = await request.formData();
    const workOrderEntry = formData.get("workOrderId");
    const workOrderId = typeof workOrderEntry === "string" ? workOrderEntry : "";
    const file = formData.get("file");
    if (!workOrderId || !(file instanceof File)) return Response.json({ error: "Attach an evidence file and request identifier." }, { status: 400 });
    if (!allowed.has(file.type)) return Response.json({ error: "Use a JPG, PNG, WEBP, or PDF evidence file." }, { status: 400 });
    if (file.size === 0 || file.size > MAX_BYTES) return Response.json({ error: "Evidence must be between 1 byte and 8 MB." }, { status: 400 });

    const [workOrder] = await db.select().from(workOrders).where(eq(workOrders.id, workOrderId)).limit(1);
    if (!workOrder || workOrder.status !== "matched" || !workOrder.selectedRelayId) return Response.json({ error: "Evidence can only be uploaded for a matched request." }, { status: 409 });
    if (!hasRole(auth.identity, ["admin"]) && auth.identity.relayId !== workOrder.selectedRelayId) return Response.json({ error: "Only the selected relay can upload evidence for this request." }, { status: 403 });

    const bytes = Buffer.from(await file.arrayBuffer());
    if (!matchesSignature(bytes, file.type)) return Response.json({ error: "The uploaded file does not match its declared type." }, { status: 400 });
    const originalName = safeName(file.name);
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    const intelligence = await analyzeEvidence(bytes, file.type);
    // Minted before the scan rather than after it: the scanner is handed this
    // id so a verdict that misses the synchronous window has something to name
    // when it calls back.
    const assetId = randomUUID();
    const scan = await scanEvidence({ assetId, bytes, fileName: originalName, contentType: file.type, sha256 });
    if (scan.status === "rejected") return Response.json({ error: "The evidence scanner rejected this file." }, { status: 400 });
    if (scan.status === "pending") {
      await recordOperationalEvent({ level: "warning", service: "evidence", code: "scan_pending", message: "Evidence uploaded without a completed malware scan; proof submission remains blocked.", resourceType: "work_order", resourceId: workOrderId, data: { sha256 } });
    }

    const stored = await storePrivateEvidence({ assetId, bytes, contentType: file.type, sha256 });
    // The compensating delete covers exactly the window between writing the
    // bytes and committing the row that owns them. It deliberately stops there:
    // an audit write failing after the row committed used to take this branch
    // too, deleting the object behind a live asset and leaving a sha256
    // attesting to bytes nobody could read again.
    const [asset] = await db.insert(evidenceAssets).values({
      id: assetId,
      workOrderId,
      relayId: workOrder.selectedRelayId,
      uploadedByUserId: auth.identity.userId,
      originalName,
      contentType: file.type,
      storageProvider: stored.provider,
      storageKey: stored.storageKey,
      contentBase64: stored.contentBase64,
      byteSize: bytes.byteLength,
      sha256,
      scanStatus: scan.status,
      scannedAt: scan.status === "validated" ? new Date() : null,
      intelligenceScore: intelligence.score,
      intelligenceFlags: intelligence.flags,
      capturedMetadata: intelligence.metadata,
      intelligenceReviewedAt: new Date(),
    }).returning({ id: evidenceAssets.id, originalName: evidenceAssets.originalName, contentType: evidenceAssets.contentType, byteSize: evidenceAssets.byteSize, sha256: evidenceAssets.sha256, scanStatus: evidenceAssets.scanStatus, intelligenceScore: evidenceAssets.intelligenceScore, intelligenceFlags: evidenceAssets.intelligenceFlags })
      .catch(async (error) => {
        await deletePrivateEvidence({ storageProvider: stored.provider, storageKey: stored.storageKey });
        throw error;
      });
    await writeAudit({ actorId: auth.identity.userId, action: "evidence_uploaded", resourceType: "evidence_asset", resourceId: asset.id, request, data: { workOrderId, byteSize: asset.byteSize, sha256: asset.sha256, scanStatus: asset.scanStatus, intelligenceScore: asset.intelligenceScore } });
    return Response.json({ asset }, { status: 201 });
  } catch (error) {
    console.error("evidence upload failed", error);
    await reportException({ service: "evidence", code: "upload_failed", error, resourceType: "evidence_asset" });
    // Fixed wording, like every other handler here: error.message carried the
    // storage backend's configuration and Postgres constraint text back to the
    // relay that triggered the failure.
    return Response.json({ error: "Could not securely store the evidence file." }, { status: 500 });
  }
}

export async function GET(request: Request) {
  const auth = await requireIdentity(request);
  if (!auth.identity) return auth.response;
  try {
    const id = new URL(request.url).searchParams.get("id") || "";
    const [asset] = await db.select().from(evidenceAssets).where(and(eq(evidenceAssets.id, id), isNull(evidenceAssets.deletedAt))).limit(1);
    if (!asset) return Response.json({ error: "Evidence asset not found." }, { status: 404 });
    const canReview = hasRole(auth.identity, ["admin", "operator", "reviewer"]);
    const canRelayRead = auth.identity.relayId === asset.relayId;
    if (!canReview && !canRelayRead) return Response.json({ error: "You do not have access to this evidence." }, { status: 403 });
    const bytes = await readPrivateEvidence(asset);
    return new Response(new Uint8Array(bytes), { headers: { "content-type": asset.contentType, "content-length": String(bytes.byteLength), "content-disposition": `inline; filename="${asset.originalName}"`, "cache-control": "private, no-store", "x-content-type-options": "nosniff" } });
  } catch (error) {
    console.error("evidence read failed", error);
    await reportException({ service: "evidence", code: "read_failed", error, resourceType: "evidence_asset" });
    return Response.json({ error: "Could not retrieve private evidence." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const auth = await requireIdentity(request, { roles: ["admin", "operator"] });
  if (!auth.identity) return auth.response;
  try {
    const id = new URL(request.url).searchParams.get("id") || "";
    // Never select content_base64 here: in database storage mode that column
    // holds the whole file, and a soft delete has no use for the bytes.
    const [asset] = await db
      .select({ id: evidenceAssets.id, workOrderId: evidenceAssets.workOrderId, storageProvider: evidenceAssets.storageProvider, storageKey: evidenceAssets.storageKey })
      .from(evidenceAssets)
      .where(and(eq(evidenceAssets.id, id), isNull(evidenceAssets.deletedAt)))
      .limit(1);
    if (!asset) return Response.json({ error: "Evidence asset not found." }, { status: 404 });
    await deletePrivateEvidence(asset);
    await db.update(evidenceAssets).set({ deletedAt: new Date() }).where(eq(evidenceAssets.id, id));
    await writeAudit({ actorId: auth.identity.userId, action: "evidence_deleted", resourceType: "evidence_asset", resourceId: id, request, data: { workOrderId: asset.workOrderId } });
    return Response.json({ ok: true });
  } catch (error) {
    console.error("evidence delete failed", error);
    await reportException({ service: "evidence", code: "delete_failed", error, resourceType: "evidence_asset" });
    return Response.json({ error: "Could not delete the evidence asset." }, { status: 500 });
  }
}
