import { db } from "@/db";
import { users } from "@/db/schema";
import { requireIdentity, writeAudit } from "@/lib/auth";
import { decryptField, validateTotp } from "@/lib/security";
import { eq } from "drizzle-orm";

export async function DELETE(request: Request) {
  const auth = await requireIdentity(request);
  if (!auth.identity) return auth.response;
  try {
    const body = (await request.json()) as { code?: unknown };
    const code = typeof body.code === "string" ? body.code.replace(/\s/g, "") : "";
    const [user] = await db.select().from(users).where(eq(users.id, auth.identity.userId)).limit(1);
    if (!user?.mfaEnabledAt || !user.mfaSecret) return Response.json({ error: "MFA is not enabled." }, { status: 409 });
    if (!validateTotp(decryptField(user.mfaSecret), code)) return Response.json({ error: "The authenticator code is invalid." }, { status: 401 });
    await db.update(users).set({ mfaSecret: null, mfaEnabledAt: null }).where(eq(users.id, user.id));
    await writeAudit({ actorId: user.id, action: "mfa_disabled", resourceType: "user", resourceId: user.id, request });
    return Response.json({ ok: true });
  } catch (error) {
    console.error("mfa disable failed", error);
    return Response.json({ error: "Could not disable MFA." }, { status: 500 });
  }
}
