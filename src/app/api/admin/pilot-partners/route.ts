import { db } from "@/db";
import { pilotPartners } from "@/db/schema";
import { requireIdentity, writeAudit } from "@/lib/auth";
import { desc, eq } from "drizzle-orm";

function value(body: Record<string, unknown>, key: string, max: number) {
  return typeof body[key] === "string" ? body[key].trim().slice(0, max) : "";
}

const statuses = new Set(["prospect", "onboarding", "active", "paused", "churned"]);
const contractStatuses = new Set(["pending", "signed", "expired"]);

export async function GET(request: Request) {
  const auth = await requireIdentity(request, { roles: ["admin", "operator"] });
  if (!auth.identity) return auth.response;
  const partners = await db.select().from(pilotPartners).orderBy(desc(pilotPartners.createdAt));
  return Response.json({ partners });
}

export async function POST(request: Request) {
  const auth = await requireIdentity(request, { roles: ["admin", "operator"] });
  if (!auth.identity) return auth.response;
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const name = value(body, "name", 120);
    const requesterAlias = value(body, "requesterAlias", 80).toLowerCase().replace(/[^a-z0-9/_-]/g, "-");
    const industry = value(body, "industry", 100);
    const city = value(body, "city", 100);
    const primaryContactEmail = value(body, "primaryContactEmail", 200).toLowerCase();
    const taskCategory = value(body, "taskCategory", 80);
    if (!name || requesterAlias.length < 3 || !industry || !city || !taskCategory || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(primaryContactEmail)) {
      return Response.json({ error: "Provide name, valid requester alias, industry, city, contact email, and task category." }, { status: 400 });
    }
    const [partner] = await db.insert(pilotPartners).values({ name, requesterAlias, industry, city, primaryContactEmail, taskCategory, status: "onboarding", contractStatus: "pending" }).returning();
    await writeAudit({ actorId: auth.identity.userId, action: "pilot_partner_created", resourceType: "pilot_partner", resourceId: partner.id, request, data: { requesterAlias } });
    return Response.json({ partner }, { status: 201 });
  } catch (error) {
    console.error("pilot partner create failed", error);
    return Response.json({ error: "Could not create pilot partner. The requester alias may already be in use." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const auth = await requireIdentity(request, { roles: ["admin", "operator"] });
  if (!auth.identity) return auth.response;
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const id = value(body, "id", 64);
    const status = value(body, "status", 20);
    const contractStatus = value(body, "contractStatus", 20);
    if (!id || !statuses.has(status) || !contractStatuses.has(contractStatus)) return Response.json({ error: "Provide a valid partner ID, status, and contract status." }, { status: 400 });
    const [partner] = await db.update(pilotPartners).set({ status, contractStatus, updatedAt: new Date() }).where(eq(pilotPartners.id, id)).returning();
    if (!partner) return Response.json({ error: "Pilot partner not found." }, { status: 404 });
    await writeAudit({ actorId: auth.identity.userId, action: "pilot_partner_updated", resourceType: "pilot_partner", resourceId: id, request, data: { status, contractStatus } });
    return Response.json({ partner });
  } catch {
    return Response.json({ error: "Could not update the pilot partner." }, { status: 500 });
  }
}
