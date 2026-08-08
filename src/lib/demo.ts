import { randomBytes } from "node:crypto";
import { db } from "@/db";
import { relays, users } from "@/db/schema";
import { hashPassword } from "@/lib/auth";
import { eq } from "drizzle-orm";

const DEMO_RELAY_HANDLE = "demo-relay";
const DEMO_OPERATOR_EMAIL = "demo-operator@certifera.io";
const DEMO_RELAY_EMAIL = "demo-relay@certifera.io";

/**
 * A dedicated, always-on-and-active relay + two user accounts (operator, relay)
 * that public demo API keys are minted against. Kept separate from the
 * showcase sandbox relays (northstar-07, etc.) so anonymous demo traffic never
 * touches the bids/reputation shown in the seeded lifecycle examples.
 *
 * Deliberately never granted the "admin" role: admin bypasses every
 * role-gated route, including /api/admin/*, which a self-serve public key
 * must never reach. Two narrow non-admin identities together can still walk
 * the full request -> bid -> evidence -> proof -> review -> settlement path.
 */
export async function ensureDemoIdentities() {
  await db
    .insert(relays)
    .values({
      handle: DEMO_RELAY_HANDLE,
      zone: "Demo network",
      specialty: "self-serve API walkthrough",
      coverageCategories: ["Infrastructure", "Field verification", "Climate data", "Delivery"],
      availabilityStatus: "available",
      onboardingStatus: "approved",
      active: true,
      lastHeartbeatAt: new Date(),
    })
    .onConflictDoNothing({ target: relays.handle });

  const [relay] = await db.select().from(relays).where(eq(relays.handle, DEMO_RELAY_HANDLE)).limit(1);

  const unusablePassword = await hashPassword(randomBytes(32).toString("hex"));

  await db
    .insert(users)
    .values({
      email: DEMO_OPERATOR_EMAIL,
      passwordHash: unusablePassword,
      displayName: "Demo Operator",
      role: "operator",
      status: "active",
      emailVerifiedAt: new Date(),
    })
    .onConflictDoNothing({ target: users.email });

  await db
    .insert(users)
    .values({
      email: DEMO_RELAY_EMAIL,
      passwordHash: unusablePassword,
      displayName: "Demo Relay",
      role: "relay",
      status: "active",
      relayId: relay.id,
      emailVerifiedAt: new Date(),
    })
    .onConflictDoNothing({ target: users.email });

  const [operatorUser] = await db.select().from(users).where(eq(users.email, DEMO_OPERATOR_EMAIL)).limit(1);
  const [relayUser] = await db.select().from(users).where(eq(users.email, DEMO_RELAY_EMAIL)).limit(1);

  return { relay, operatorUser, relayUser };
}
