import { db } from "@/db";
import { passwordResetTokens, sessions, users } from "@/db/schema";
import { clearSession, hashPassword, writeAudit } from "@/lib/auth";
import { decryptField, opaqueHash, validateTotp } from "@/lib/security";
import { and, eq, gt, isNull } from "drizzle-orm";

export async function POST(request: Request) {
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

    await db.transaction(async (tx) => {
      await tx.update(passwordResetTokens).set({ usedAt: new Date() }).where(eq(passwordResetTokens.id, record.token.id));
      await tx.update(users).set({ passwordHash: await hashPassword(password), passwordChangedAt: new Date(), failedLoginCount: 0, lockedUntil: null }).where(eq(users.id, record.user.id));
      await tx.delete(sessions).where(eq(sessions.userId, record.user.id));
    });
    await clearSession();
    await writeAudit({ actorId: record.user.id, action: "password_reset_completed", resourceType: "user", resourceId: record.user.id, request });
    return Response.json({ ok: true });
  } catch (error) {
    console.error("password reset confirm failed", error);
    return Response.json({ error: "Could not reset the password." }, { status: 500 });
  }
}
