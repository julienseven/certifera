import { db } from "@/db";
import { evidenceAssets, proofBundles, relays, workOrders } from "@/db/schema";
import { hasRole, requireIdentity } from "@/lib/auth";
import { forbidden, resolveOutcomeAccess } from "@/lib/authz";
import { calculateReviewDueAt, recordLifecycleEvent } from "@/lib/lifecycle";
import { and, desc, eq, isNull } from "drizzle-orm";

function compactString(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireIdentity(request);
  if (!auth.identity) return auth.response;
  try {
    const { id } = await context.params;
    const [workOrder] = await db.select({ id: workOrders.id, selectedRelayId: workOrders.selectedRelayId }).from(workOrders).where(eq(workOrders.id, id)).limit(1);
    if (!workOrder) return Response.json({ error: "This request no longer exists." }, { status: 404 });
    // A proof bundle is the selected relay's submitted work. Staff review it,
    // and the relay that produced it can inspect its own; no other relay has a
    // reason to read it. Uses the shared stake test so this route cannot drift
    // from the bid book and activity feed.
    const access = await resolveOutcomeAccess(auth.identity, id);
    if (!access.canViewCommercials) return forbidden();

    const [proof] = await db
      .select({
        id: proofBundles.id,
        workOrderId: proofBundles.workOrderId,
        relayId: proofBundles.relayId,
        evidenceAssetId: proofBundles.evidenceAssetId,
        intelligenceScore: evidenceAssets.intelligenceScore,
        intelligenceFlags: evidenceAssets.intelligenceFlags,
        capturedMetadata: evidenceAssets.capturedMetadata,
        observation: proofBundles.observation,
        evidenceUrl: proofBundles.evidenceUrl,
        attestationHash: proofBundles.attestationHash,
        verificationScore: proofBundles.verificationScore,
        status: proofBundles.status,
        reviewerNote: proofBundles.reviewerNote,
        reviewedAt: proofBundles.reviewedAt,
        createdAt: proofBundles.createdAt,
        relayHandle: relays.handle,
      })
      .from(proofBundles)
      .leftJoin(relays, eq(proofBundles.relayId, relays.id))
      .leftJoin(evidenceAssets, eq(proofBundles.evidenceAssetId, evidenceAssets.id))
      .where(eq(proofBundles.workOrderId, id))
      .orderBy(desc(proofBundles.createdAt))
      .limit(1);

    return Response.json({ proof: proof || null });
  } catch (error) {
    console.error("proof lookup failed", error);
    return Response.json({ error: "The proof record is temporarily unavailable." }, { status: 500 });
  }
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireIdentity(request, { roles: ["relay", "admin"], scope: "proofs:write" });
  if (!auth.identity) return auth.response;
  try {
    const { id } = await context.params;
    const body = (await request.json()) as Record<string, unknown>;
    const observation = compactString(body.observation, 800);
    const evidenceAssetId = compactString(body.evidenceAssetId, 64);
    const relayId = compactString(body.relayId, 64);

    if (observation.length < 20) {
      return Response.json({ error: "Add a 20-character minimum field observation." }, { status: 400 });
    }
    if (!evidenceAssetId) {
      return Response.json({ error: "Upload a private evidence file before submitting proof." }, { status: 400 });
    }

    const [workOrder] = await db.select().from(workOrders).where(eq(workOrders.id, id)).limit(1);
    if (!workOrder) {
      return Response.json({ error: "This request no longer exists." }, { status: 404 });
    }
    if (workOrder.status === "verified") {
      return Response.json({ error: "This request already has a verified proof bundle." }, { status: 409 });
    }
    if (workOrder.status !== "matched" || !workOrder.selectedRelayId) {
      return Response.json({ error: "Select a relay bid before submitting a proof bundle." }, { status: 409 });
    }

    const activeRelayId = workOrder.selectedRelayId;
    if (relayId && relayId !== activeRelayId) {
      return Response.json({ error: "Only the selected relay can submit proof for this request." }, { status: 403 });
    }
    const [relay] = await db.select().from(relays).where(eq(relays.id, activeRelayId)).limit(1);
    if (!relay || !relay.active) {
      return Response.json({ error: "The selected relay is no longer active." }, { status: 409 });
    }
    if (!hasRole(auth.identity, ["admin"]) && auth.identity.relayId !== activeRelayId) {
      return Response.json({ error: "This relay account is not assigned to the selected execution." }, { status: 403 });
    }
    const [asset] = await db
      .select({ id: evidenceAssets.id, scanStatus: evidenceAssets.scanStatus, intelligenceScore: evidenceAssets.intelligenceScore, intelligenceFlags: evidenceAssets.intelligenceFlags })
      .from(evidenceAssets)
      .where(and(
        eq(evidenceAssets.id, evidenceAssetId),
        eq(evidenceAssets.workOrderId, workOrder.id),
        eq(evidenceAssets.relayId, activeRelayId),
        isNull(evidenceAssets.deletedAt),
      ))
      .limit(1);
    if (!asset || asset.scanStatus !== "validated") {
      return Response.json({ error: "Use a validated private evidence file uploaded for this execution." }, { status: 409 });
    }

    const observationScore = Math.min(98, 84 + Math.floor(observation.length / 80));
    const verificationScore = Math.min(98, Math.round((observationScore * 0.6) + ((asset.intelligenceScore ?? 55) * 0.4)));
    const attestationHash = `cert:${crypto.randomUUID().replaceAll("-", "").slice(0, 24)}`;

    const reviewDueAt = calculateReviewDueAt();
    const executionLate = Boolean(workOrder.executionDueAt && new Date() > workOrder.executionDueAt);
    const proof = await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(proofBundles)
        .values({
          workOrderId: workOrder.id,
          relayId: activeRelayId,
          observation,
          evidenceAssetId: asset.id,
          attestationHash,
          verificationScore,
          status: "pending_review",
        })
        .returning();

      await tx
        .update(workOrders)
        .set({
          status: "review",
          selectedRelayId: activeRelayId,
          reviewDueAt,
          slaStatus: executionLate ? "execution_breached" : "on_track",
          updatedAt: new Date(),
        })
        .where(eq(workOrders.id, workOrder.id));
      if (executionLate) {
        await recordLifecycleEvent(tx, {
          workOrderId: workOrder.id,
          type: "execution_sla_breached",
          actor: "liveness/engine",
          summary: "Evidence arrived after the selected relay's execution commitment window.",
          data: { relayId: activeRelayId, executionDueAt: workOrder.executionDueAt?.toISOString() || null },
        });
      }
      await recordLifecycleEvent(tx, {
        workOrderId: workOrder.id,
        type: "proof_submitted",
        actor: relay.handle,
        summary: `Submitted an attested evidence bundle at ${verificationScore}% automated confidence.`,
        data: { relayId: activeRelayId, proofId: created.id, verificationScore, evidenceScore: asset.intelligenceScore ?? 55, evidenceFlagCount: asset.intelligenceFlags.length, reviewDueAt: reviewDueAt.toISOString() },
      });
      return created;
    });

    return Response.json({ proof, requestStatus: "review" }, { status: 201 });
  } catch (error) {
    console.error("proof submission failed", error);
    return Response.json({ error: "Could not verify this proof bundle. Please try again." }, { status: 500 });
  }
}
