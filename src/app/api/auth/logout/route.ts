import { clearSession, getSessionIdentity, writeAudit } from "@/lib/auth";

export async function POST(request: Request) {
  const identity = await getSessionIdentity();
  await clearSession();
  if (identity) await writeAudit({ actorId: identity.userId, action: "logout", resourceType: "auth", request });
  return Response.json({ ok: true });
}
