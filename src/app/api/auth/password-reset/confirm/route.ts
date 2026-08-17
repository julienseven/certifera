import { db } from "@/db";
import { passwordResetTokens, sessions, users } from "@/db/schema";
import { clearSession, enforceAnonymousRateLimit, hashPassword, writeAudit } from "@/lib/auth";
import { decryptField, opaqueHash, validateTotp } from "@/lib/security";
import { and, eq, gt, isNull } from "drizzle-orm";

export async function POST(request: Request) {
  // Unauthenticated and account-changing, like the request side. Left open it
  // buys an anonymous caller a lookup per attempt and an unmetered run at the
  // authenticator code standing between a leaked link and the account.
  const rate = await enforceAnonymousRateLimit(request, "password-reset-confirm", 10);
  if (!rate.allowed) return Response.json({ error: "Too many recovery attempts. Please try again shortly." }, { status: 429, headers: { "retry-after": String(rate.retryAfter) } });
  try {
    const body = (await request.json()) as { token?: unknown; password?: unknown; mfaCode?: unknown };
    const token = typeof body.token === "string" ? body.token : "";
    const password = typeof body.password === "string" ? body.password : "";
    const mfaCode = typeof body.mfaCode === "string" ? body.mfaCode.replace(/\s/g, "") : "";
    if (password.length < 12) return Response.json({ error: "Use a password with at least 12 characters." }, { status: 400 });
    const [record] = await db
      .select({ token: passwordResetTokens, user: users })
      .from(passwordResetTokens)
      .innerJoin(users, eq(passwordResetTokens.userId, users.id))
      .where(and(eq(passwordResetTokens.tokenHash, opaqueHash(token)), isNull(passwordResetTokens.usedAt), gt(passwordResetTokens.expiresAt, new Date())))
      .limit(1);
    if (!record) return Response.json({ error: "This password reset link is invalid or expired." }, { status: 400 });
    if (record.user.mfaEnabledAt && (!record.user.mfaSecret || !validateTotp(decryptField(record.user.mfaSecret), mfaCode))) {
      return Response.json({ error: "Enter a valid authenticator code to reset this MFA-protected account." }, { status: 401 });
    }

    const claimed = await db.transaction(async (tx) => {
      // Retires every outstanding link for this account, not just the one
      // presented. A superseded link is still a live credential to whoever
      // holds a copy, and a recovered account must not be recoverable a second
      // time by an older mail. Predicating on usedAt also makes the claim the
      // single-use check: two simultaneous uses of one link serialize here and
      // the loser matches nothing.
      const retired = await tx
        .update(passwordResetTokens)
        .set({ usedAt: new Date() })
        .where(and(eq(passwordResetTokens.userId, record.user.id), isNull(passwordResetTokens.usedAt)))
        .returning({ id: passwordResetTokens.id });
      if (!retired.some((retiredToken) => retiredToken.id === record.token.id)) return false;
      await tx.update(users).set({ passwordHash: await hashPassword(password), passwordChangedAt: new Date(), failedLoginCount: 0, lockedUntil: null }).where(eq(users.id, record.user.id));
      await tx.delete(sessions).where(eq(sessions.userId, record.user.id));
      return true;
    });
    if (!claimed) return Response.json({ error: "This password reset link is invalid or expired." }, { status: 400 });
    await clearSession();
    await writeAudit({ actorId: record.user.id, action: "password_reset_completed", resourceType: "user", resourceId: record.user.id, request });
    return Response.json({ ok: true });
  } catch (error) {
    console.error("password reset confirm failed", error);
    return Response.json({ error: "Could not reset the password." }, { status: 500 });
  }
}
