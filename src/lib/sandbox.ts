import { db } from "@/db";
import { executionEvents, relayBids, relays, workOrders } from "@/db/schema";
import { and, eq, inArray } from "drizzle-orm";

const sandboxRelays = [
  { handle: "northstar-07", zone: "Brooklyn / Queens", specialty: "visual + geo proof", coverageCategories: ["Infrastructure", "Field verification"] as string[], reputation: 982 },
  { handle: "atlas-field", zone: "Lower Manhattan", specialty: "drone inspection", coverageCategories: ["Infrastructure", "Field verification"] as string[], reputation: 961 },
  { handle: "gridline-2", zone: "Jersey City", specialty: "energy assets", coverageCategories: ["Infrastructure", "Climate data"] as string[], reputation: 947 },
] as const;

const sandboxOrders = [
  {
    externalRef: "sandbox-roof-001",
    title: "Verify solar array condition",
    category: "Infrastructure",
    location: "Long Island City, NY",
    rewardCents: 28500,
    requester: "helio/ops-agent",
    status: "open",
    proofRequirements: ["Geo-stamped exterior photos", "Inverter serial capture", "Array obstruction scan"],
    relayHandle: undefined,
  },
  {
    externalRef: "sandbox-retail-002",
    title: "Confirm EV charger uptime",
    category: "Field verification",
    location: "Williamsburg, NY",
    rewardCents: 12500,
    requester: "charge/status-agent",
    status: "matched",
    proofRequirements: ["Live charge session", "Station ID close-up", "Time + location attestation"],
    relayHandle: "atlas-field",
  },
  {
    externalRef: "sandbox-canopy-003",
    title: "Inspect canopy sensor installation",
    category: "Climate data",
    location: "Jersey City, NJ",
    rewardCents: 19000,
    requester: "verdant/data-agent",
    status: "open",
    proofRequirements: ["Sensor housing image", "QR identifier", "Geo + timestamp attestation"],
    relayHandle: undefined,
  },
] as const;

const sandboxBids = [
  { orderRef: "sandbox-roof-001", relayHandle: "northstar-07", quoteCents: 24500, etaMinutes: 90, note: "Roof-safe visual survey team is two blocks away.", status: "open" },
  { orderRef: "sandbox-roof-001", relayHandle: "atlas-field", quoteCents: 26200, etaMinutes: 55, note: "Can include a thermal drone pass at this price.", status: "open" },
  { orderRef: "sandbox-retail-002", relayHandle: "atlas-field", quoteCents: 10800, etaMinutes: 35, note: "Technician is already routing through Williamsburg.", status: "selected" },
  { orderRef: "sandbox-retail-002", relayHandle: "northstar-07", quoteCents: 9900, etaMinutes: 75, note: "Visual charge-session check only.", status: "rejected" },
  { orderRef: "sandbox-canopy-003", relayHandle: "gridline-2", quoteCents: 17300, etaMinutes: 70, note: "Energy asset team can capture hardware and QR data.", status: "open" },
  { orderRef: "sandbox-canopy-003", relayHandle: "northstar-07", quoteCents: 16200, etaMinutes: 115, note: "Standard visual and geo attestation route.", status: "open" },
] as const;

const sandboxRelayHandles: string[] = sandboxRelays.map((relay) => relay.handle);
const sandboxOrderRefs: string[] = sandboxOrders.map((order) => order.externalRef);

const globalForSandbox = globalThis as typeof globalThis & {
  __certiferaSandboxSeed?: Promise<void>;
};

/**
 * Off in production, on everywhere else.
 *
 * Preview deployments build with NODE_ENV=production but exist to be demoed,
 * so NODE_ENV alone would strip their seed data. CERTIFERA_SANDBOX_SEED
 * overrides both ways: set it to "true" on a production deployment whose
 * public demo walkthrough (/api/demo/api-key) should land on seeded example
 * requests, or to "false" to keep a preview clean.
 */
function sandboxSeedEnabled() {
  const configured = process.env.CERTIFERA_SANDBOX_SEED;
  if (configured === "true") return true;
  if (configured === "false") return false;
  return process.env.VERCEL_ENV === "preview" || process.env.NODE_ENV !== "production";
}

/**
 * Seeds at most once per process, on the first request an instance serves.
 *
 * The memo holds the in-flight promise rather than a "done" flag: several
 * requests can hit a cold instance at once, and without a shared promise each
 * would run the whole seed, with the concurrent ON CONFLICT inserts contending
 * for the same rows. A rejected seed is evicted so the next request retries
 * instead of the instance being permanently unseeded.
 */
export async function ensureSandboxData() {
  if (!sandboxSeedEnabled()) return;
  globalForSandbox.__certiferaSandboxSeed ??= seedSandboxData().catch((error) => {
    globalForSandbox.__certiferaSandboxSeed = undefined;
    throw error;
  });
  await globalForSandbox.__certiferaSandboxSeed;
}

/** Tests and long-lived scripts re-seed deliberately; requests never do. */
export function resetSandboxSeedCache() {
  globalForSandbox.__certiferaSandboxSeed = undefined;
}

async function seedSandboxData() {
  await db.insert(relays).values([...sandboxRelays]).onConflictDoNothing({ target: relays.handle });
  await Promise.all(sandboxRelays.map((relay) => db.update(relays).set({
    coverageCategories: relay.coverageCategories,
    availabilityStatus: "available",
    onboardingStatus: "approved",
    active: true,
    lastHeartbeatAt: new Date(),
  }).where(eq(relays.handle, relay.handle))));

  // Scoped to the seeded handles/refs: an unfiltered read of relays,
  // work_orders, or execution_events scans the whole production table, and
  // work_orders is the fastest-growing one.
  const relayRows = await db.select({ id: relays.id, handle: relays.handle }).from(relays).where(inArray(relays.handle, sandboxRelayHandles));
  const relayIds = new Map(relayRows.map((relay) => [relay.handle, relay.id]));

  await Promise.all(
    sandboxOrders.map((order) =>
      db
        .insert(workOrders)
        .values({
          externalRef: order.externalRef,
          title: order.title,
          category: order.category,
          location: order.location,
          rewardCents: order.rewardCents,
          requester: order.requester,
          status: order.status,
          proofRequirements: [...order.proofRequirements],
          selectedRelayId: order.relayHandle ? relayIds.get(order.relayHandle) : undefined,
        })
        .onConflictDoNothing({ target: workOrders.externalRef }),
    ),
  );

  const openSandboxRefs = sandboxOrders.filter((order) => order.status === "open").map((order) => order.externalRef);
  await db
    .update(workOrders)
    .set({ selectedRelayId: null, updatedAt: new Date() })
    .where(and(inArray(workOrders.externalRef, openSandboxRefs), eq(workOrders.status, "open")));

  const orderRows = await db.select({ id: workOrders.id, externalRef: workOrders.externalRef }).from(workOrders).where(inArray(workOrders.externalRef, sandboxOrderRefs));
  const orderIds = new Map(orderRows.map((order) => [order.externalRef, order.id]));

  await Promise.all(
    sandboxBids.flatMap((bid) => {
      const workOrderId = orderIds.get(bid.orderRef);
      const relayId = relayIds.get(bid.relayHandle);
      if (!workOrderId || !relayId) return [];
      return [
        db
          .insert(relayBids)
          .values({
            workOrderId,
            relayId,
            quoteCents: bid.quoteCents,
            etaMinutes: bid.etaMinutes,
            note: bid.note,
            status: bid.status,
          })
          .onConflictDoNothing(),
      ];
    }),
  );

  const eventRows = await db
    .select({ workOrderId: executionEvents.workOrderId })
    .from(executionEvents)
    .where(inArray(executionEvents.workOrderId, [...orderIds.values()]));
  const ordersWithEvents = new Set(eventRows.map((event) => event.workOrderId));
  await Promise.all(
    sandboxOrders.flatMap((order) => {
      const workOrderId = orderIds.get(order.externalRef);
      if (!workOrderId || ordersWithEvents.has(workOrderId)) return [];
      const selected = order.relayHandle ? relayIds.get(order.relayHandle) : undefined;
      return [
        db.insert(executionEvents).values({
          workOrderId,
          type: order.status === "matched" ? "relay_matched" : "request_funded",
          actor: order.status === "matched" ? "operator/console" : order.requester,
          summary: order.status === "matched"
            ? `Selected ${order.relayHandle} for a committed sandbox execution.`
            : `Funded ${order.title} and opened it to the pilot relay network.`,
          data: { rewardCents: order.rewardCents, relayId: selected ?? null, sandbox: true },
        }),
      ];
    }),
  );
}

export async function findRelayByHandle(handle: string) {
  const [relay] = await db.select().from(relays).where(eq(relays.handle, handle)).limit(1);
  return relay;
}
