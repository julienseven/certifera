import { afterAll, describe, expect, it } from "vitest";
import { db } from "@/db";
import { relays, users } from "@/db/schema";
import { ensureDemoIdentities } from "@/lib/demo";
import { eq } from "drizzle-orm";

const DEMO_RELAY_HANDLE = "demo-relay";
const DEMO_OPERATOR_EMAIL = "demo-operator@certifera.xyz";
const DEMO_RELAY_EMAIL = "demo-relay@certifera.xyz";

describe("ensureDemoIdentities", () => {
  afterAll(async () => {
    await db.delete(users).where(eq(users.email, DEMO_OPERATOR_EMAIL));
    await db.delete(users).where(eq(users.email, DEMO_RELAY_EMAIL));
    await db.delete(relays).where(eq(relays.handle, DEMO_RELAY_HANDLE));
  });

  it("provisions an active, approved demo relay and two non-admin demo users", async () => {
    const { relay, operatorUser, relayUser } = await ensureDemoIdentities();

    expect(relay).toMatchObject({ handle: DEMO_RELAY_HANDLE, active: true, onboardingStatus: "approved" });
    expect(operatorUser).toMatchObject({ email: DEMO_OPERATOR_EMAIL, role: "operator", status: "active" });
    expect(relayUser).toMatchObject({ email: DEMO_RELAY_EMAIL, role: "relay", status: "active", relayId: relay.id });

    // Neither identity may be granted admin: a public self-serve key must never reach /api/admin/*.
    expect(operatorUser.role).not.toBe("admin");
    expect(relayUser.role).not.toBe("admin");

    expect(operatorUser.emailVerifiedAt).not.toBeNull();
    expect(relayUser.emailVerifiedAt).not.toBeNull();
    expect(operatorUser.passwordHash).toMatch(/^[0-9a-f]{32}:[0-9a-f]{128}$/);
  });

  it("is idempotent: repeated calls reuse the same records instead of duplicating them", async () => {
    const first = await ensureDemoIdentities();
    const second = await ensureDemoIdentities();

    expect(second.relay.id).toBe(first.relay.id);
    expect(second.operatorUser.id).toBe(first.operatorUser.id);
    expect(second.relayUser.id).toBe(first.relayUser.id);

    const relayRows = await db.select().from(relays).where(eq(relays.handle, DEMO_RELAY_HANDLE));
    expect(relayRows).toHaveLength(1);
    const operatorRows = await db.select().from(users).where(eq(users.email, DEMO_OPERATOR_EMAIL));
    expect(operatorRows).toHaveLength(1);
    const relayUserRows = await db.select().from(users).where(eq(users.email, DEMO_RELAY_EMAIL));
    expect(relayUserRows).toHaveLength(1);
  });
});
