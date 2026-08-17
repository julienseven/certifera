import { randomBytes } from "node:crypto";
import { db } from "@/db";
import { passwordResetTokens, users } from "@/db/schema";
import { enforceAnonymousRateLimit, writeAudit } from "@/lib/auth";
import { certiferaUrl, sendMail } from "@/lib/mailer";
import { authLinksExposed, opaqueHash } from "@/lib/security";
import { eq } from "drizzle-orm";

/**
 * One body for every outcome: registered, unregistered, suspended, or a
 * delivery failure this route swallowed.
 *
 * Reporting the delivery mode only when an account existed turned this into an
 * enumeration oracle — a caller learned which addresses hold accounts by
 * looking for the extra field, one request at a time, and nothing it named was
 * of any use to the person who actually asked for the link.
 */
const ACKNOWLEDGED = { ok: true };

export async function POST(request: Request) {
  const rate = await enforceAnonymousRateLimit(request, "password-reset", 5);
  if (!rate.allowed) return Response.json({ error: "Too many recovery attempts. Please try again shortly." }, { status: 429, headers: { "retry-after": String(rate.retryAfter) } });
  try {
    const body = (await request.json()) as { email?: unknown };
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
    if (!user || user.status !== "active") return Response.json(ACKNOWLEDGED);

    const token = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
    await db.insert(passwordResetTokens).values({ userId: user.id, tokenHash: opaqueHash(token), expiresAt });
    const link = certiferaUrl(`/access?reset=${encodeURIComponent(token)}`);
    await sendMail({ to: user.email, subject: "Reset your Certifera password", text: `Reset your Certifera password within one hour: ${link}` });
    await writeAudit({ actorId: user.id, action: "password_reset_requested", resourceType: "user", resourceId: user.id, request });
    // The one deliberate exception, and only outside production: the local
    // stack has no mailbox, so the link has to come back on the response.
    return Response.json(authLinksExposed() ? { ...ACKNOWLEDGED, resetUrl: link } : ACKNOWLEDGED);
  } catch (error) {
    console.error("password reset request failed", error);
    return Response.json(ACKNOWLEDGED);
  }
}
