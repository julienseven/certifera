import { db } from "@/db";
import { relays } from "@/db/schema";
import { resolveLimit } from "@/app/api/_pagination";
import { requireIdentity, writeAudit } from "@/lib/auth";
import { desc, eq } from "drizzle-orm";

const DEFAULT_RELAYS = 200;
const MAX_RELAYS = 500;

const categories = new Set(["Infrastructure", "Field verification", "Climate data", "Delivery"]);
const availability = new Set(["available", "busy", "offline"]);
const onboarding = new Set(["pending", "verified", "approved", "suspended"]);

function value(body: Record<string, unknown>, key: string, max: number) {
  return typeof body[key] === "string" ? body[key].trim().slice(0, max) : "";
}

function categoriesValue(value: unknown) {
  return Array.isArray(value) ? [...new Set(value.filter((item): item is string => typeof item === "string" && categories.has(item)))] : [];
}

export async function GET(request: Request) {
  const auth = await requireIdentity(request, { roles: ["admin", "operator"] });
  if (!auth.identity) return auth.response;
  const rows = await db.select().from(relays).orderBy(desc(relays.createdAt)).limit(resolveLimit(request, DEFAULT_RELAYS, MAX_RELAYS));
  return Response.json({ relays: rows });
}

export async function POST(request: Request) {
  const auth = await requireIdentity(request, { roles: ["admin"] });
  if (!auth.identity) return auth.response;
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const handle = value(body, "handle", 60).toLowerCase().replace(/[^a-z0-9-]/g, "-");
    const zone = value(body, "zone", 100);
    const specialty = value(body, "specialty", 100);
    const coverageCategories = categoriesValue(body.coverageCategories);
    const serviceRadiusKm = Number(body.serviceRadiusKm ?? 25);
    if (handle.length < 3 || !zone || !specialty || coverageCategories.length === 0 || !Number.isInteger(serviceRadiusKm) || serviceRadiusKm < 1 || serviceRadiusKm > 500) {
      return Response.json({ error: "Provide a valid handle, zone, specialty, at least one coverage category, and radius of 1–500 km." }, { status: 400 });
    }
    const [relay] = await db.insert(relays).values({ handle, zone, specialty, coverageCategories, serviceRadiusKm, active: false, availabilityStatus: "offline", onboardingStatus: "pending" }).returning();
    await writeAudit({ actorId: auth.identity.userId, action: "relay_profile_created", resourceType: "relay", resourceId: relay.id, request, data: { handle } });
    return Response.json({ relay }, { status: 201 });
  } catch (error) {
    console.error("relay create failed", error);
    return Response.json({ error: "Could not create relay profile. Handle may already exist." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const auth = await requireIdentity(request, { roles: ["admin"] });
  if (!auth.identity) return auth.response;
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const id = value(body, "id", 64);
    const nextOnboarding = value(body, "onboardingStatus", 20);
    const nextAvailability = value(body, "availabilityStatus", 20);
    const verificationNote = value(body, "verificationNote", 1000);
    const coverageCategories = categoriesValue(body.coverageCategories);
    const serviceRadiusKm = Number(body.serviceRadiusKm);
    const [existing] = await db.select().from(relays).where(eq(relays.id, id)).limit(1);
    if (!existing) return Response.json({ error: "Relay profile not found." }, { status: 404 });
    if (nextOnboarding && !onboarding.has(nextOnboarding)) return Response.json({ error: "Invalid onboarding status." }, { status: 400 });
    if (nextAvailability && !availability.has(nextAvailability)) return Response.json({ error: "Invalid availability status." }, { status: 400 });
    if (nextOnboarding === "approved" && verificationNote.length < 12) return Response.json({ error: "Approving a relay requires a verification note of at least 12 characters." }, { status: 400 });
    if (!Number.isNaN(serviceRadiusKm) && (!Number.isInteger(serviceRadiusKm) || serviceRadiusKm < 1 || serviceRadiusKm > 500)) return Response.json({ error: "Service radius must be 1–500 km." }, { status: 400 });
    const nextStatus = nextOnboarding || existing.onboardingStatus;
    const [relay] = await db.update(relays).set({
      onboardingStatus: nextStatus,
      active: nextStatus === "approved",
      availabilityStatus: nextStatus === "approved" ? (nextAvailability || existing.availabilityStatus) : "offline",
      verificationNote: verificationNote || existing.verificationNote,
      verifiedAt: nextOnboarding === "approved" ? new Date() : existing.verifiedAt,
      coverageCategories: coverageCategories.length ? coverageCategories : existing.coverageCategories,
      serviceRadiusKm: Number.isNaN(serviceRadiusKm) ? existing.serviceRadiusKm : serviceRadiusKm,
      lastHeartbeatAt: nextAvailability === "available" ? new Date() : existing.lastHeartbeatAt,
    }).where(eq(relays.id, id)).returning();
    await writeAudit({ actorId: auth.identity.userId, action: "relay_profile_updated", resourceType: "relay", resourceId: id, request, data: { onboardingStatus: relay.onboardingStatus, availabilityStatus: relay.availabilityStatus } });
    return Response.json({ relay });
  } catch (error) {
    console.error("relay update failed", error);
    return Response.json({ error: "Could not update relay profile." }, { status: 500 });
  }
}
