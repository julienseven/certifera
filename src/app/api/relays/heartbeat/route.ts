import { db } from "@/db";
import { relays } from "@/db/schema";
import { hasRole, requireIdentity, writeAudit } from "@/lib/auth";
import { eq } from "drizzle-orm";

const availability = new Set(["available", "busy", "offline"]);

export async function POST(request: Request) {
  const auth = await requireIdentity(request, { roles: ["relay", "admin"] });
  if (!auth.identity) return auth.response;
  try {
    const body = (await request.json()) as { availabilityStatus?: unknown; relayId?: unknown };
    const availabilityStatus = typeof body.availabilityStatus === "string" ? body.availabilityStatus : "available";
    const relayId = typeof body.relayId === "string" ? body.relayId : auth.identity.relayId;
    if (!relayId || !availability.has(availabilityStatus)) return Response.json({ error: "Provide a linked relay and valid availability status." }, { status: 400 });
    if (!hasRole(auth.identity, ["admin"]) && auth.identity.relayId !== relayId) return Response.json({ error: "Relay accounts can only update their own heartbeat." }, { status: 403 });
    const [relay] = await db.select().from(relays).where(eq(relays.id, relayId)).limit(1);
    if (!relay || !relay.active || relay.onboardingStatus !== "approved") return Response.json({ error: "Relay is not approved for marketplace participation." }, { status: 409 });
    const [updated] = await db.update(relays).set({ availabilityStatus, lastHeartbeatAt: new Date() }).where(eq(relays.id, relayId)).returning({ id: relays.id, handle: relays.handle, availabilityStatus: relays.availabilityStatus, lastHeartbeatAt: relays.lastHeartbeatAt });
    await writeAudit({ actorId: auth.identity.userId, action: "relay_heartbeat", resourceType: "relay", resourceId: relayId, request, data: { availabilityStatus } });
    return Response.json({ relay: updated });
  } catch (error) {
    console.error("relay heartbeat failed", error);
    return Response.json({ error: "Could not update relay availability." }, { status: 500 });
  }
}
