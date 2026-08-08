import { db } from "@/db";
import { pilotCohortPartners, pilotCohortRelays, pilotCohorts, pilotPartners, relays } from "@/db/schema";
import { getProductionReadiness } from "@/lib/readiness";
import { and, eq } from "drizzle-orm";

export type CohortEligibility = {
  canLaunch: boolean;
  mode: "sandbox" | "stripe";
  reasons: string[];
  partnerCount: number;
  relayCount: number;
};

function cityTokens(value: string) {
  return value.toLowerCase().split(/[,/\-]/).map((part) => part.trim()).filter((part) => part.length >= 3);
}

function zonesOverlap(left: string, right: string) {
  const leftTokens = cityTokens(left);
  return cityTokens(right).some((token) => leftTokens.includes(token));
}

export async function evaluateCohortEligibility(cohortId: string): Promise<CohortEligibility> {
  const [cohort] = await db.select().from(pilotCohorts).where(eq(pilotCohorts.id, cohortId)).limit(1);
  if (!cohort) return { canLaunch: false, mode: "sandbox", reasons: ["Cohort not found."], partnerCount: 0, relayCount: 0 };
  const [partnerRows, relayRows, readiness] = await Promise.all([
    db
      .select({ id: pilotPartners.id, status: pilotPartners.status, contractStatus: pilotPartners.contractStatus, city: pilotPartners.city, taskCategory: pilotPartners.taskCategory })
      .from(pilotCohortPartners)
      .innerJoin(pilotPartners, eq(pilotCohortPartners.partnerId, pilotPartners.id))
      .where(eq(pilotCohortPartners.cohortId, cohortId)),
    db
      .select({ id: relays.id, active: relays.active, onboardingStatus: relays.onboardingStatus, zone: relays.zone })
      .from(pilotCohortRelays)
      .innerJoin(relays, eq(pilotCohortRelays.relayId, relays.id))
      .where(eq(pilotCohortRelays.cohortId, cohortId)),
    getProductionReadiness(),
  ]);
  const activePartners = partnerRows.filter((partner) => partner.status === "active" && partner.contractStatus === "signed" && partner.taskCategory === cohort.taskCategory && zonesOverlap(partner.city, cohort.city));
  const approvedRelays = relayRows.filter((relay) => relay.active && relay.onboardingStatus === "approved" && zonesOverlap(relay.zone, cohort.city));
  const mode = cohort.settlementMode === "stripe" ? "stripe" : "sandbox";
  const reasons: string[] = [];
  const sandboxOverride = process.env.CERTIFERA_ALLOW_SANDBOX_COHORT === "true" || process.env.NODE_ENV !== "production";
  if (mode === "sandbox") {
    if (!sandboxOverride) reasons.push("Sandbox cohorts are disabled in this production deployment. Set CERTIFERA_ALLOW_SANDBOX_COHORT=true only for controlled test operations.");
    if (activePartners.length < 1) reasons.push("Add at least one active partner with a signed agreement for this task category.");
    if (approvedRelays.length < 2) reasons.push("Add at least two approved relays before launching a sandbox cohort.");
  } else {
    if (!readiness.ready) reasons.push("Production readiness checks are incomplete.");
    if (activePartners.length < 3) reasons.push("Real-money cohorts require at least three active signed partners in the task category.");
    if (approvedRelays.length < 10) reasons.push("Real-money cohorts require at least ten approved relays.");
  }
  return { canLaunch: reasons.length === 0, mode, reasons, partnerCount: activePartners.length, relayCount: approvedRelays.length };
}

export async function partnerBelongsToCohort(cohortId: string, partnerId: string) {
  const [row] = await db
    .select({ id: pilotCohortPartners.id })
    .from(pilotCohortPartners)
    .where(and(eq(pilotCohortPartners.cohortId, cohortId), eq(pilotCohortPartners.partnerId, partnerId)))
    .limit(1);
  return Boolean(row);
}
