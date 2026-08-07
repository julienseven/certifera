import { randomBytes } from "node:crypto";
import { db } from "@/db";
import { passwordResetTokens, users } from "@/db/schema";
import { enforceAnonymousRateLimit, writeAudit } from "@/lib/auth";
import { certiferaUrl, sendMail } from "@/lib/mailer";
import { opaqueHash } from "@/lib/security";
import { eq } from "drizzle-orm";

export async function POST(request: Request) {
  const rate = await enforceAnonymousRateLimit(request, "password-reset", 5);
  if (!rate.allowed) return Response.json({ error: "Too many recovery attempts. Please try again shortly." }, { status: 429, headers: { "retry-after": String(rate.retryAfter) } });
  try {
    const body = (await request.json()) as { email?: unknown };
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
    if (!user || user.status !== "active") return Response.json({ ok: true });

    const token = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
    await db.insert(passwordResetTokens).values({ userId: user.id, tokenHash: opaqueHash(token), expiresAt });
    const link = certiferaUrl(`/access?reset=${encodeURIComponent(token)}`);
    const delivery = await sendMail({ to: user.email, subject: "Reset your Certifera password", text: `Reset your Certifera password within one hour: ${link}` });
    await writeAudit({ actorId: user.id, action: "password_reset_requested", resourceType: "user", resourceId: user.id, request });
    return Response.json({ ok: true, delivery: delivery.mode, ...(process.env.CERTIFERA_EXPOSE_AUTH_LINKS === "true" ? { resetUrl: link } : {}) });
  } catch (error) {
    console.error("password reset request failed", error);
    return Response.json({ ok: true });
  }
}
