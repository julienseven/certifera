import { db } from "@/db";
import { users } from "@/db/schema";
import { requireIdentity, writeAudit } from "@/lib/auth";
import { decryptField, validateTotp } from "@/lib/security";
import { eq } from "drizzle-orm";

export async function POST(request: Request) {
  const auth = await requireIdentity(request);
  if (!auth.identity) return auth.response;
  try {
    const body = (await request.json()) as { code?: unknown };
    const code = typeof body.code === "string" ? body.code.replace(/\s/g, "") : "";
    const [user] = await db.select().from(users).where(eq(users.id, auth.identity.userId)).limit(1);
    if (!user?.mfaSecret) return Response.json({ error: "Start MFA enrollment before confirming it." }, { status: 409 });
    if (!validateTotp(decryptField(user.mfaSecret), code)) return Response.json({ error: "The authenticator code is invalid." }, { status: 400 });
    await db.update(users).set({ mfaEnabledAt: new Date() }).where(eq(users.id, user.id));
    await writeAudit({ actorId: user.id, action: "mfa_enabled", resourceType: "user", resourceId: user.id, request });
    return Response.json({ ok: true });
  } catch (error) {
    console.error("mfa confirmation failed", error);
    return Response.json({ error: "Could not confirm MFA." }, { status: 500 });
  }
}
