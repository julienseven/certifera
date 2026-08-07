import { randomBytes } from "node:crypto";
import { db } from "@/db";
import { emailVerificationTokens, relays, users } from "@/db/schema";
import { hashPassword, requireIdentity, roles, writeAudit } from "@/lib/auth";
import { certiferaUrl, sendMail } from "@/lib/mailer";
import { opaqueHash } from "@/lib/security";
import { eq } from "drizzle-orm";

function stringValue(body: Record<string, unknown>, key: string, max: number) {
  return typeof body[key] === "string" ? body[key].trim().slice(0, max) : "";
}

export async function POST(request: Request) {
  const auth = await requireIdentity(request, { roles: ["admin"] });
  if (!auth.identity) return auth.response;
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const email = stringValue(body, "email", 200).toLowerCase();
    const displayName = stringValue(body, "displayName", 80);
    const password = stringValue(body, "password", 200);
    const role = stringValue(body, "role", 20);
    const relayId = stringValue(body, "relayId", 64) || null;
    const verificationRequired = process.env.CERTIFERA_EMAIL_VERIFICATION_REQUIRED === "true";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return Response.json({ error: "Enter a valid email address." }, { status: 400 });
    if (!displayName || password.length < 12 || !roles.includes(role as (typeof roles)[number])) return Response.json({ error: "Provide display name, a 12-character password, and a valid role." }, { status: 400 });
    if (role === "relay" && !relayId) return Response.json({ error: "Relay accounts must be linked to an approved relay profile." }, { status: 400 });
    if (relayId) {
      const [relay] = await db.select().from(relays).where(eq(relays.id, relayId)).limit(1);
      if (!relay || !relay.active || relay.onboardingStatus !== "approved") return Response.json({ error: "Choose an approved active relay profile." }, { status: 400 });
    }
    if (verificationRequired && (!process.env.CERTIFERA_RESEND_API_KEY || !process.env.CERTIFERA_MAIL_FROM) && process.env.CERTIFERA_EXPOSE_AUTH_LINKS !== "true") {
      return Response.json({ error: "Email verification is required but transactional email is not configured." }, { status: 503 });
    }
    const [user] = await db.insert(users).values({
      email,
      displayName,
      passwordHash: await hashPassword(password),
      passwordChangedAt: new Date(),
      role,
      relayId,
      emailVerifiedAt: verificationRequired ? null : new Date(),
    }).returning({ id: users.id, email: users.email, displayName: users.displayName, role: users.role, relayId: users.relayId });
    const token = randomBytes(32).toString("base64url");
    await db.insert(emailVerificationTokens).values({ userId: user.id, tokenHash: opaqueHash(token), expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) });
    const verificationUrl = certiferaUrl(`/api/auth/verification/confirm?token=${encodeURIComponent(token)}`);
    const delivery = await sendMail({ to: user.email, subject: "Verify your Certifera account", text: `Verify your Certifera account: ${verificationUrl}` });
    await writeAudit({ actorId: auth.identity.userId, action: "user_onboarded", resourceType: "user", resourceId: user.id, request, data: { role: user.role, relayId: user.relayId, verificationRequired } });
    return Response.json({ user, delivery: delivery.mode, ...(process.env.CERTIFERA_EXPOSE_AUTH_LINKS === "true" ? { verificationUrl } : {}) }, { status: 201 });
  } catch (error) {
    console.error("user onboard failed", error);
    return Response.json({ error: "Could not onboard the user. The email may already be in use." }, { status: 500 });
  }
}
