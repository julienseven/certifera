import { db } from "@/db";
import { users } from "@/db/schema";
import { createSession, enforceAnonymousRateLimit, verifyPassword, writeAudit } from "@/lib/auth";
import { decryptField, validateTotp } from "@/lib/security";
import { eq } from "drizzle-orm";

const MAX_FAILED_LOGINS = 5;
const LOCKOUT_MINUTES = 15;

export async function POST(request: Request) {
  const rate = await enforceAnonymousRateLimit(request, "login", 10);
  if (!rate.allowed) return Response.json({ error: "Too many sign-in attempts. Please try again shortly." }, { status: 429, headers: { "retry-after": String(rate.retryAfter) } });
  try {
    const body = (await request.json()) as { email?: unknown; password?: unknown; mfaCode?: unknown };
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body.password === "string" ? body.password : "";
    const mfaCode = typeof body.mfaCode === "string" ? body.mfaCode.replace(/\s/g, "") : "";
    const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
    const now = new Date();

    const denied = !user
      || user.status !== "active"
      || Boolean(user.lockedUntil && user.lockedUntil > now)
      || (process.env.CERTIFERA_EMAIL_VERIFICATION_REQUIRED === "true" && !user.emailVerifiedAt)
      || !(user && await verifyPassword(password, user.passwordHash));
    if (denied) {
      if (user && user.status === "active" && (!user.lockedUntil || user.lockedUntil <= now)) {
        const failures = user.failedLoginCount + 1;
        const lockedUntil = failures >= MAX_FAILED_LOGINS ? new Date(Date.now() + LOCKOUT_MINUTES * 60_000) : null;
        await db.update(users).set({ failedLoginCount: failures, lockedUntil }).where(eq(users.id, user.id));
      }
      await writeAudit({ action: "login_failed", resourceType: "auth", request, data: { email: email || null } });
      return Response.json({ error: "Email, password, verification, or account status is incorrect." }, { status: 401 });
    }
    if (!user) return Response.json({ error: "Email, password, verification, or account status is incorrect." }, { status: 401 });

    if (user.mfaEnabledAt && (!user.mfaSecret || !validateTotp(decryptField(user.mfaSecret), mfaCode))) {
      await writeAudit({ actorId: user.id, action: "login_mfa_failed", resourceType: "auth", request });
      return Response.json({ error: "Authenticator code is required or invalid." }, { status: 401 });
    }

    await db.update(users).set({ lastLoginAt: now, failedLoginCount: 0, lockedUntil: null }).where(eq(users.id, user.id));
    await createSession(user.id);
    await writeAudit({ actorId: user.id, action: "login_succeeded", resourceType: "auth", request, data: { mfa: Boolean(user.mfaEnabledAt) } });
    return Response.json({ user: { id: user.id, email: user.email, displayName: user.displayName, role: user.role, relayId: user.relayId, emailVerified: Boolean(user.emailVerifiedAt), mfaEnabled: Boolean(user.mfaEnabledAt) } });
  } catch (error) {
    console.error("login failed", error);
    return Response.json({ error: "Could not sign in. Please try again." }, { status: 500 });
  }
}
