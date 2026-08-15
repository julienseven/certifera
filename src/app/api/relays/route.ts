import { db } from "@/db";
import { relays } from "@/db/schema";
import { resolveLimit } from "@/app/api/_pagination";
import { requireIdentity } from "@/lib/auth";
import { desc, eq } from "drizzle-orm";

const DEFAULT_RELAYS = 200;
const MAX_RELAYS = 500;

export async function GET(request: Request) {
  const auth = await requireIdentity(request);
  if (!auth.identity) return auth.response;
  try {
    const network = await db
      .select({
        id: relays.id,
        handle: relays.handle,
        zone: relays.zone,
        specialty: relays.specialty,
        coverageCategories: relays.coverageCategories,
        availabilityStatus: relays.availabilityStatus,
        serviceRadiusKm: relays.serviceRadiusKm,
        reputation: relays.reputation,
        active: relays.active,
        lastHeartbeatAt: relays.lastHeartbeatAt,
      })
      .from(relays)
      .where(eq(relays.active, true))
      .orderBy(desc(relays.reputation))
      .limit(resolveLimit(request, DEFAULT_RELAYS, MAX_RELAYS));

    return Response.json({ relays: network });
  } catch (error) {
    console.error("relay feed failed", error);
    return Response.json({ error: "The relay network is temporarily unavailable." }, { status: 500 });
  }
}
