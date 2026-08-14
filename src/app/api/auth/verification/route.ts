import { randomBytes } from "node:crypto";
import { db } from "@/db";
import { emailVerificationTokens, users } from "@/db/schema";
import { requireIdentity, writeAudit } from "@/lib/auth";
import { certiferaUrl, sendMail } from "@/lib/mailer";
import { authLinksExposed, opaqueHash } from "@/lib/security";
import { eq } from "drizzle-orm";

export async function POST(request: Request) {
  const auth = await requireIdentity(request);
  if (!auth.identity) return auth.response;
  const [user] = await db.select().from(users).where(eq(users.id, auth.identity.userId)).limit(1);
  if (!user) return Response.json({ error: "Account not found." }, { status: 404 });
  if (user.emailVerifiedAt) return Response.json({ ok: true, alreadyVerified: true });

  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  await db.insert(emailVerificationTokens).values({ userId: user.id, tokenHash: opaqueHash(token), expiresAt });
  const link = certiferaUrl(`/api/auth/verification/confirm?token=${encodeURIComponent(token)}`);
  const delivery = await sendMail({
    to: user.email,
    subject: "Verify your Certifera email",
    text: `Verify your Certifera account within 24 hours: ${link}`,
  });
  await writeAudit({ actorId: user.id, action: "email_verification_requested", resourceType: "user", resourceId: user.id, request });
  return Response.json({ ok: true, delivery: delivery.mode, ...(authLinksExposed() ? { verificationUrl: link } : {}) });
}
