import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { pilotCohortPartners, pilotCohortRelays, pilotCohorts, pilotPartners, relays, users } from "@/db/schema";
import { eq } from "drizzle-orm";

const { getProductionReadinessMock } = vi.hoisted(() => ({ getProductionReadinessMock: vi.fn() }));
vi.mock("@/lib/readiness", () => ({ getProductionReadiness: getProductionReadinessMock }));

import { evaluateCohortEligibility, partnerBelongsToCohort } from "@/lib/cohort";

const suffix = randomUUID().slice(0, 8);
let n = 0;
const nextTag = () => `${suffix}-${n++}`;

const createdCohortIds: string[] = [];
const createdPartnerIds: string[] = [];
const createdRelayIds: string[] = [];
let ownerUserId: string;

beforeEach(() => {
  getProductionReadinessMock.mockReset().mockResolvedValue({ ready: true, checks: [] });
  delete process.env.CERTIFERA_ALLOW_SANDBOX_COHORT;
  vi.stubEnv("NODE_ENV", "test");
});

afterAll(async () => {
  for (const id of createdCohortIds) await db.delete(pilotCohorts).where(eq(pilotCohorts.id, id));
  for (const id of createdPartnerIds) await db.delete(pilotPartners).where(eq(pilotPartners.id, id));
  for (const id of createdRelayIds) await db.delete(relays).where(eq(relays.id, id));
  if (ownerUserId) await db.delete(users).where(eq(users.id, ownerUserId));
  vi.unstubAllEnvs();
});

async function ensureOwner() {
  if (ownerUserId) return ownerUserId;
  const [owner] = await db
    .insert(users)
    .values({ email: `cohort-owner-${suffix}@certifera.local`, passwordHash: "unusable:unusable", displayName: "Cohort Owner", role: "admin", status: "active" })
    .returning();
  ownerUserId = owner.id;
  return ownerUserId;
}

async function makeCohort(overrides: Partial<typeof pilotCohorts.$inferInsert> = {}) {
  const owner = await ensureOwner();
  const [cohort] = await db
    .insert(pilotCohorts)
    .values({ name: `Cohort ${nextTag()}`, city: "Austin, TX", taskCategory: "Infrastructure", ownerUserId: owner, ...overrides })
    .returning();
  createdCohortIds.push(cohort.id);
  return cohort;
}

async function makePartner(overrides: Partial<typeof pilotPartners.$inferInsert> = {}) {
  const tag = nextTag();
  const [partner] = await db
    .insert(pilotPartners)
    .values({
      name: `Partner ${tag}`,
      requesterAlias: `partner-${tag}`,
      industry: "logistics",
      city: "Austin, TX",
      primaryContactEmail: `partner-${tag}@example.com`,
      taskCategory: "Infrastructure",
      status: "active",
      contractStatus: "signed",
      ...overrides,
    })
    .returning();
  createdPartnerIds.push(partner.id);
  return partner;
}

async function makeRelay(overrides: Partial<typeof relays.$inferInsert> = {}) {
  const tag = nextTag();
  const [relay] = await db
    .insert(relays)
    .values({
      handle: `cohort-relay-${tag}`,
      zone: "Austin, TX",
      specialty: "field verification",
      coverageCategories: ["Infrastructure"],
      availabilityStatus: "available",
      onboardingStatus: "approved",
      active: true,
      ...overrides,
    })
    .returning();
  createdRelayIds.push(relay.id);
  return relay;
}

async function enroll(cohortId: string, partnerIds: string[], relayIds: string[]) {
  if (partnerIds.length) await db.insert(pilotCohortPartners).values(partnerIds.map((partnerId) => ({ cohortId, partnerId })));
  if (relayIds.length) await db.insert(pilotCohortRelays).values(relayIds.map((relayId) => ({ cohortId, relayId })));
}

describe("evaluateCohortEligibility", () => {
  it("reports a cohort that does not exist as not launchable", async () => {
    const result = await evaluateCohortEligibility(randomUUID());
    expect(result).toEqual({ canLaunch: false, mode: "sandbox", reasons: ["Cohort not found."], partnerCount: 0, relayCount: 0 });
  });

  it("blocks a sandbox cohort with no eligible partners or relays", async () => {
    const cohort = await makeCohort({ settlementMode: "sandbox" });
    const result = await evaluateCohortEligibility(cohort.id);
    expect(result.canLaunch).toBe(false);
    expect(result.mode).toBe("sandbox");
    expect(result.reasons).toContain("Add at least one active partner with a signed agreement for this task category.");
    expect(result.reasons).toContain("Add at least two approved relays before launching a sandbox cohort.");
    expect(result.partnerCount).toBe(0);
    expect(result.relayCount).toBe(0);
  });

  it("only counts partners and relays that actually satisfy every eligibility condition", async () => {
    const cohort = await makeCohort({ settlementMode: "sandbox" });

    const qualifyingPartner = await makePartner();
    const wrongContractStatus = await makePartner({ contractStatus: "pending" });
    const wrongTaskCategory = await makePartner({ taskCategory: "Delivery" });
    const wrongCity = await makePartner({ city: "Denver, CO" });
    const wrongStatus = await makePartner({ status: "prospect" });

    const qualifyingRelayA = await makeRelay();
    const qualifyingRelayB = await makeRelay();
    const inactiveRelay = await makeRelay({ active: false });
    const unapprovedRelay = await makeRelay({ onboardingStatus: "pending" });
    const wrongZoneRelay = await makeRelay({ zone: "Denver, CO" });

    await enroll(
      cohort.id,
      [qualifyingPartner.id, wrongContractStatus.id, wrongTaskCategory.id, wrongCity.id, wrongStatus.id],
      [qualifyingRelayA.id, qualifyingRelayB.id, inactiveRelay.id, unapprovedRelay.id, wrongZoneRelay.id],
    );

    const result = await evaluateCohortEligibility(cohort.id);
    expect(result.partnerCount).toBe(1);
    expect(result.relayCount).toBe(2);
    expect(result.canLaunch).toBe(true);
    expect(result.reasons).toEqual([]);
  });

  it("blocks sandbox launches in production unless explicitly overridden", async () => {
    const cohort = await makeCohort({ settlementMode: "sandbox" });
    const partner = await makePartner();
    const relayA = await makeRelay();
    const relayB = await makeRelay();
    await enroll(cohort.id, [partner.id], [relayA.id, relayB.id]);

    vi.stubEnv("NODE_ENV", "production");
    delete process.env.CERTIFERA_ALLOW_SANDBOX_COHORT;
    const blocked = await evaluateCohortEligibility(cohort.id);
    expect(blocked.canLaunch).toBe(false);
    expect(blocked.reasons).toContain(
      "Sandbox cohorts are disabled in this production deployment. Set CERTIFERA_ALLOW_SANDBOX_COHORT=true only for controlled test operations.",
    );

    process.env.CERTIFERA_ALLOW_SANDBOX_COHORT = "true";
    const allowed = await evaluateCohortEligibility(cohort.id);
    expect(allowed.canLaunch).toBe(true);
    expect(allowed.reasons).toEqual([]);
  });

  it("requires full production readiness plus three partners and ten relays for a Stripe cohort", async () => {
    const cohort = await makeCohort({ settlementMode: "stripe" });
    const partners = await Promise.all(Array.from({ length: 2 }, () => makePartner()));
    const relayRows = await Promise.all(Array.from({ length: 9 }, () => makeRelay()));
    await enroll(cohort.id, partners.map((p) => p.id), relayRows.map((r) => r.id));

    getProductionReadinessMock.mockResolvedValueOnce({ ready: false, checks: [] });
    const notReady = await evaluateCohortEligibility(cohort.id);
    expect(notReady.mode).toBe("stripe");
    expect(notReady.canLaunch).toBe(false);
    expect(notReady.reasons).toContain("Production readiness checks are incomplete.");
    expect(notReady.reasons).toContain("Real-money cohorts require at least three active signed partners in the task category.");
    expect(notReady.reasons).toContain("Real-money cohorts require at least ten approved relays.");
    expect(notReady.partnerCount).toBe(2);
    expect(notReady.relayCount).toBe(9);

    // Readiness alone isn't enough while partner/relay thresholds are unmet.
    getProductionReadinessMock.mockResolvedValueOnce({ ready: true, checks: [] });
    const readyButShort = await evaluateCohortEligibility(cohort.id);
    expect(readyButShort.canLaunch).toBe(false);
    expect(readyButShort.reasons).not.toContain("Production readiness checks are incomplete.");

    const thirdPartner = await makePartner();
    const tenthRelay = await makeRelay();
    await enroll(cohort.id, [thirdPartner.id], [tenthRelay.id]);

    getProductionReadinessMock.mockResolvedValueOnce({ ready: true, checks: [] });
    const fullyEligible = await evaluateCohortEligibility(cohort.id);
    expect(fullyEligible).toEqual({ canLaunch: true, mode: "stripe", reasons: [], partnerCount: 3, relayCount: 10 });
  });
});

describe("partnerBelongsToCohort", () => {
  it("is true only for partners actually enrolled in that cohort", async () => {
    const cohort = await makeCohort();
    const otherCohort = await makeCohort();
    const partner = await makePartner();
    await enroll(cohort.id, [partner.id], []);

    expect(await partnerBelongsToCohort(cohort.id, partner.id)).toBe(true);
    expect(await partnerBelongsToCohort(otherCohort.id, partner.id)).toBe(false);
    expect(await partnerBelongsToCohort(cohort.id, randomUUID())).toBe(false);
  });
});
