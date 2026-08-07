import { db } from "@/db";
import { users } from "@/db/schema";
import { requireIdentity, writeAudit } from "@/lib/auth";
import { createTotpSetup, encryptField } from "@/lib/security";
import { eq } from "drizzle-orm";

export async function POST(request: Request) {
  const auth = await requireIdentity(request);
  if (!auth.identity) return auth.response;
  try {
    const [user] = await db.select().from(users).where(eq(users.id, auth.identity.userId)).limit(1);
    if (!user) return Response.json({ error: "Account not found." }, { status: 404 });
    if (user.mfaEnabledAt) return Response.json({ error: "MFA is already enabled. Disable it first to enroll a new authenticator." }, { status: 409 });
    const setup = createTotpSetup(user.email);
    await db.update(users).set({ mfaSecret: encryptField(setup.secret), mfaEnabledAt: null }).where(eq(users.id, user.id));
    await writeAudit({ actorId: user.id, action: "mfa_enrollment_started", resourceType: "user", resourceId: user.id, request });
    return Response.json({ secret: setup.secret, uri: setup.uri });
  } catch (error) {
    console.error("mfa setup failed", error);
    return Response.json({ error: error instanceof Error ? error.message : "Could not begin MFA setup." }, { status: 500 });
  }
}
