import { db } from "@/db";
import { pilotCohortPartners, pilotCohortRelays, pilotCohorts, pilotPartners, relays, workOrders } from "@/db/schema";
import { resolveLimit } from "@/app/api/_pagination";
import { requireIdentity, writeAudit } from "@/lib/auth";
import { evaluateCohortEligibility } from "@/lib/cohort";
import { and, count, desc, eq, inArray, isNotNull, sum } from "drizzle-orm";

// evaluateCohortEligibility runs two queries per cohort, so the cohort cap also
// bounds the fan-out, not just the rows returned.
const DEFAULT_COHORTS = 50;
const MAX_COHORTS = 200;
const MAX_PARTNERS = 500;
const MAX_RELAYS = 500;

const inFlightStatuses = new Set(["matched", "review"]);

function value(body: Record<string, unknown>, key: string, max: number) {
  return typeof body[key] === "string" ? body[key].trim().slice(0, max) : "";
}

function idList(value: unknown) {
  return Array.isArray(value) ? [...new Set(value.filter((item): item is string => typeof item === "string" && item.length > 0).slice(0, 50))] : [];
}

export async function GET(request: Request) {
  const auth = await requireIdentity(request, { roles: ["admin", "operator"] });
  if (!auth.identity) return auth.response;
  const [cohorts, partners, relayRows, taskTotals] = await Promise.all([
    db.select().from(pilotCohorts).orderBy(desc(pilotCohorts.createdAt)).limit(resolveLimit(request, DEFAULT_COHORTS, MAX_COHORTS)),
    db.select().from(pilotPartners).orderBy(desc(pilotPartners.createdAt)).limit(MAX_PARTNERS),
    db.select().from(relays).where(eq(relays.active, true)).orderBy(desc(relays.reputation)).limit(MAX_RELAYS),
    // Rolled up in SQL rather than by reading every cohort work order into the
    // function: the result is one row per cohort and status either way.
    db
      .select({ cohortId: workOrders.pilotCohortId, status: workOrders.status, tasks: count(), rewardCents: sum(workOrders.rewardCents) })
      .from(workOrders)
      .where(isNotNull(workOrders.pilotCohortId))
      .groupBy(workOrders.pilotCohortId, workOrders.status),
  ]);
  const cohortIds = cohorts.map((cohort) => cohort.id);
  const [cohortPartnerRows, cohortRelayRows] = cohortIds.length
    ? await Promise.all([
        db.select().from(pilotCohortPartners).where(inArray(pilotCohortPartners.cohortId, cohortIds)),
        db.select().from(pilotCohortRelays).where(inArray(pilotCohortRelays.cohortId, cohortIds)),
      ])
    : [[], []];
  const enriched = await Promise.all(cohorts.map(async (cohort) => {
    const partnerIds = cohortPartnerRows.filter((item) => item.cohortId === cohort.id).map((item) => item.partnerId);
    const relayIds = cohortRelayRows.filter((item) => item.cohortId === cohort.id).map((item) => item.relayId);
    const totals = taskTotals.filter((row) => row.cohortId === cohort.id);
    const tasksIn = (match: (status: string) => boolean) => totals.filter((row) => match(row.status)).reduce((total, row) => total + row.tasks, 0);
    return {
      ...cohort,
      partnerIds,
      relayIds,
      metrics: {
        tasks: tasksIn(() => true),
        open: tasksIn((status) => status === "open"),
        inFlight: tasksIn((status) => inFlightStatuses.has(status)),
        settled: tasksIn((status) => status === "verified"),
        rewardCents: totals.reduce((total, row) => total + Number(row.rewardCents ?? 0), 0),
      },
      eligibility: await evaluateCohortEligibility(cohort.id),
    };
  }));
  return Response.json({ cohorts: enriched, partners, relays: relayRows });
}

export async function POST(request: Request) {
  const auth = await requireIdentity(request, { roles: ["admin", "operator"] });
  if (!auth.identity) return auth.response;
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const name = value(body, "name", 120);
    const city = value(body, "city", 100);
    const taskCategory = value(body, "taskCategory", 80);
    const targetTasks = Number(body.targetTasks ?? 25);
    const settlementMode = value(body, "settlementMode", 20) || "sandbox";
    if (!name || !city || !taskCategory || !Number.isInteger(targetTasks) || targetTasks < 1 || targetTasks > 500 || !["sandbox", "stripe"].includes(settlementMode)) {
      return Response.json({ error: "Provide a cohort name, city, task category, target of 1–500 tasks, and settlement mode." }, { status: 400 });
    }
    const [cohort] = await db.insert(pilotCohorts).values({ name, city, taskCategory, targetTasks, settlementMode, ownerUserId: auth.identity.userId }).returning();
    await writeAudit({ actorId: auth.identity.userId, action: "pilot_cohort_created", resourceType: "pilot_cohort", resourceId: cohort.id, request, data: { settlementMode, targetTasks } });
    return Response.json({ cohort }, { status: 201 });
  } catch (error) {
    console.error("cohort create failed", error);
    return Response.json({ error: "Could not create the pilot cohort." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const auth = await requireIdentity(request, { roles: ["admin", "operator"] });
  if (!auth.identity) return auth.response;
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const cohortId = value(body, "cohortId", 64);
    const action = value(body, "action", 30);
    if (!cohortId || !["enroll", "launch", "pause"].includes(action)) return Response.json({ error: "Use enroll, launch, or pause with a cohort ID." }, { status: 400 });
    const [cohort] = await db.select().from(pilotCohorts).where(eq(pilotCohorts.id, cohortId)).limit(1);
    if (!cohort) return Response.json({ error: "Pilot cohort not found." }, { status: 404 });

    if (action === "enroll") {
      if (cohort.status === "active") return Response.json({ error: "Pause the cohort before changing its roster." }, { status: 409 });
      const partnerIds = idList(body.partnerIds);
      const relayIds = idList(body.relayIds);
      if (partnerIds.length === 0 && relayIds.length === 0) return Response.json({ error: "Select at least one partner or relay to enroll." }, { status: 400 });
      if (partnerIds.length) {
        const selectedPartners = await db.select({ id: pilotPartners.id, status: pilotPartners.status, contractStatus: pilotPartners.contractStatus }).from(pilotPartners).where(inArray(pilotPartners.id, partnerIds));
        if (selectedPartners.length !== partnerIds.length || selectedPartners.some((partner) => partner.status !== "active" || partner.contractStatus !== "signed")) {
          return Response.json({ error: "Only active partners with signed agreements can join a cohort." }, { status: 400 });
        }
        await db.insert(pilotCohortPartners).values(partnerIds.map((partnerId) => ({ cohortId, partnerId }))).onConflictDoNothing();
      }
      if (relayIds.length) {
        const selectedRelays = await db.select({ id: relays.id, active: relays.active, onboardingStatus: relays.onboardingStatus }).from(relays).where(inArray(relays.id, relayIds));
        if (selectedRelays.length !== relayIds.length || selectedRelays.some((relay) => !relay.active || relay.onboardingStatus !== "approved")) {
          return Response.json({ error: "Only active approved relays can join a cohort." }, { status: 400 });
        }
        await db.insert(pilotCohortRelays).values(relayIds.map((relayId) => ({ cohortId, relayId }))).onConflictDoNothing();
      }
      await writeAudit({ actorId: auth.identity.userId, action: "pilot_cohort_roster_updated", resourceType: "pilot_cohort", resourceId: cohortId, request, data: { partnerCount: partnerIds.length, relayCount: relayIds.length } });
      return Response.json({ ok: true, eligibility: await evaluateCohortEligibility(cohortId) });
    }

    if (action === "pause") {
      await db.update(pilotCohorts).set({ status: "paused", updatedAt: new Date() }).where(eq(pilotCohorts.id, cohortId));
      await writeAudit({ actorId: auth.identity.userId, action: "pilot_cohort_paused", resourceType: "pilot_cohort", resourceId: cohortId, request });
      return Response.json({ ok: true });
    }

    const eligibility = await evaluateCohortEligibility(cohortId);
    if (!eligibility.canLaunch) return Response.json({ error: "Cohort cannot launch yet.", reasons: eligibility.reasons }, { status: 409 });
    if (!["planning", "paused"].includes(cohort.status)) return Response.json({ error: "Only planning or paused cohorts can launch." }, { status: 409 });
    await db.update(pilotCohorts).set({ status: "active", kickoffAt: cohort.kickoffAt || new Date(), launchedAt: new Date(), updatedAt: new Date() }).where(eq(pilotCohorts.id, cohortId));
    await writeAudit({ actorId: auth.identity.userId, action: "pilot_cohort_launched", resourceType: "pilot_cohort", resourceId: cohortId, request, data: { settlementMode: eligibility.mode, partnerCount: eligibility.partnerCount, relayCount: eligibility.relayCount } });
    return Response.json({ ok: true, eligibility });
  } catch (error) {
    console.error("cohort update failed", error);
    return Response.json({ error: "Could not update the pilot cohort." }, { status: 500 });
  }
}
