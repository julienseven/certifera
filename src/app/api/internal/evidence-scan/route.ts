import { timingSafeEqual } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { evidenceAssets } from "@/db/schema";
import { recordOperationalEvent, reportException } from "@/lib/observability";

/**
 * Resolves an evidence upload the scanner could not answer synchronously.
 *
 * `scanEvidence` blocks the upload on the scanner for 20 seconds and falls back
 * to "pending" when it cannot get a verdict in that window. Nothing moved a row
 * off "pending" afterwards, so with CERTIFERA_EVIDENCE_SCAN_REQUIRED=true — the
 * production setting — the fallback was permanent: the relay got a 201 and then
 * a 409 on proof submission forever, for every upload the scanner was slow to
 * answer. This is the other half of that flow.
 *
 * Authenticated with the same shared secret as the maintenance sweep. The
 * scanner is a service this deployment configures and calls out to, not a third
 * party signing payloads on its own schedule, so it authenticates the way the
 * other internal callers do rather than growing a second signature scheme.
 */
function hasScanAuthorization(request: Request) {
  const configured = process.env.CERTIFERA_SCAN_CALLBACK_SECRET || process.env.CERTIFERA_CRON_SECRET || process.env.CRON_SECRET;
  if (!configured) return false;
  const presented = Buffer.from(request.headers.get("authorization") || "");
  const expected = Buffer.from(`Bearer ${configured}`);
  return presented.length === expected.length && timingSafeEqual(presented, expected);
}

export async function POST(request: Request) {
  if (!hasScanAuthorization(request)) {
    return Response.json({ error: "Scan callbacks require the callback secret." }, { status: 401 });
  }

  let body: { assetId?: unknown; sha256?: unknown; clean?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return Response.json({ error: "Malformed scan callback." }, { status: 400 });
  }

  const assetId = typeof body.assetId === "string" ? body.assetId : "";
  const sha256 = typeof body.sha256 === "string" ? body.sha256 : "";
  if (!assetId || !sha256 || typeof body.clean !== "boolean") {
    return Response.json({ error: "assetId, sha256, and a boolean clean verdict are required." }, { status: 400 });
  }

  const status = body.clean ? "validated" : "rejected";

  try {
    // Matched on the digest as well as the id, so a verdict computed for one
    // file can never resolve another. Scoped to "pending" so the callback can
    // only ever settle an open question: a late duplicate cannot reopen a
    // rejected asset, and it cannot re-clear one a reviewer already acted on.
    const [resolved] = await db
      .update(evidenceAssets)
      .set({ scanStatus: status, scannedAt: new Date() })
      .where(and(
        eq(evidenceAssets.id, assetId),
        eq(evidenceAssets.sha256, sha256),
        eq(evidenceAssets.scanStatus, "pending"),
      ))
      .returning({ id: evidenceAssets.id, workOrderId: evidenceAssets.workOrderId });

    if (!resolved) {
      // Either the asset does not exist, the digest does not match it, or it is
      // already settled. Redelivery of a verdict lands here and is not an
      // error, so this answers ok rather than 404 — the scanner has nothing to
      // usefully retry in any of those cases.
      return Response.json({ ok: true, applied: false });
    }

    await recordOperationalEvent({
      level: status === "rejected" ? "warning" : "info",
      service: "evidence",
      code: status === "rejected" ? "scan_rejected_async" : "scan_validated_async",
      message: `Scanner resolved a pending upload as ${status}.`,
      resourceType: "evidence_asset",
      resourceId: resolved.id,
      data: { sha256, workOrderId: resolved.workOrderId },
    });

    return Response.json({ ok: true, applied: true, scanStatus: status });
  } catch (error) {
    await reportException({ service: "evidence", code: "scan_callback_failed", error, resourceType: "evidence_asset", resourceId: assetId });
    return Response.json({ error: "Scan callback could not be recorded." }, { status: 500 });
  }
}
