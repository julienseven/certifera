import { randomBytes } from "node:crypto";
import { db } from "@/db";
import { emailVerificationTokens, users } from "@/db/schema";
import { createSession, enforceAnonymousRateLimit, hashPassword, writeAudit } from "@/lib/auth";
import { certiferaUrl, sendMail } from "@/lib/mailer";
import { opaqueHash } from "@/lib/security";
import { count } from "drizzle-orm";

function value(body: Record<string, unknown>, key: string, max: number) {
  return typeof body[key] === "string" ? body[key].trim().slice(0, max) : "";
}

export async function GET() {
  const [{ total }] = await db.select({ total: count() }).from(users);
  return Response.json({ setupRequired: total === 0 });
}

export async function POST(request: Request) {
  const rate = await enforceAnonymousRateLimit(request, "setup", 3);
  if (!rate.allowed) return Response.json({ error: "Too many setup attempts. Please retry shortly." }, { status: 429, headers: { "retry-after": String(rate.retryAfter) } });
  try {
    const [{ total }] = await db.select({ total: count() }).from(users);
    if (total > 0) return Response.json({ error: "Initial setup is already complete. Sign in instead." }, { status: 409 });

    const body = (await request.json()) as Record<string, unknown>;
    const email = value(body, "email", 200).toLowerCase();
    const displayName = value(body, "displayName", 80) || "Certifera administrator";
    const password = value(body, "password", 200);
    const configuredCode = process.env.CERTIFERA_SETUP_CODE;
    const setupCode = value(body, "setupCode", 200);
    const verificationRequired = process.env.CERTIFERA_EMAIL_VERIFICATION_REQUIRED === "true";

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return Response.json({ error: "Enter a valid email address." }, { status: 400 });
    if (password.length < 12) return Response.json({ error: "Use a password with at least 12 characters." }, { status: 400 });
    if (configuredCode && setupCode !== configuredCode) return Response.json({ error: "The setup code is invalid." }, { status: 403 });
    if (verificationRequired && (!process.env.CERTIFERA_RESEND_API_KEY || !process.env.CERTIFERA_MAIL_FROM) && process.env.CERTIFERA_EXPOSE_AUTH_LINKS !== "true") {
      return Response.json({ error: "Email verification is required but transactional email is not configured." }, { status: 503 });
    }

    const [user] = await db.insert(users).values({
      email,
      displayName,
      passwordHash: await hashPassword(password),
      role: "admin",
      emailVerifiedAt: verificationRequired ? null : new Date(),
      passwordChangedAt: new Date(),
    }).returning();
    const token = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await db.insert(emailVerificationTokens).values({ userId: user.id, tokenHash: opaqueHash(token), expiresAt });
    const verificationUrl = certiferaUrl(`/api/auth/verification/confirm?token=${encodeURIComponent(token)}`);
    const delivery = await sendMail({ to: user.email, subject: "Verify your Certifera administrator account", text: `Verify your Certifera administrator account: ${verificationUrl}` });
    if (!verificationRequired) await createSession(user.id);
    await writeAudit({ actorId: user.id, action: "bootstrap_admin_created", resourceType: "user", resourceId: user.id, request, data: { email, verificationRequired } });
    return Response.json({
      user: { email: user.email, displayName: user.displayName, role: user.role },
      verificationRequired,
      delivery: delivery.mode,
      ...(process.env.CERTIFERA_EXPOSE_AUTH_LINKS === "true" ? { verificationUrl } : {}),
    }, { status: 201 });
  } catch (error) {
    console.error("setup failed", error);
    return Response.json({ error: "Could not complete initial setup." }, { status: 500 });
  }
}
