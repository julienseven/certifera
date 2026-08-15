import { db } from "@/db";
import { apiKeys } from "@/db/schema";
import { resolveLimit } from "@/app/api/_pagination";
import { createApiToken, requireIdentity, writeAudit } from "@/lib/auth";
import { desc, eq } from "drizzle-orm";

const DEFAULT_KEYS = 100;
const MAX_KEYS = 200;

const availableScopes = new Set(["requests:read", "requests:write", "proofs:read", "proofs:write"]);

export async function GET(request: Request) {
  const auth = await requireIdentity(request);
  if (!auth.identity) return auth.response;
  const keys = await db
    .select({ id: apiKeys.id, name: apiKeys.name, prefix: apiKeys.prefix, scopes: apiKeys.scopes, lastUsedAt: apiKeys.lastUsedAt, expiresAt: apiKeys.expiresAt, revokedAt: apiKeys.revokedAt, createdAt: apiKeys.createdAt })
    .from(apiKeys)
    .where(eq(apiKeys.userId, auth.identity.userId))
    .orderBy(desc(apiKeys.createdAt))
    .limit(resolveLimit(request, DEFAULT_KEYS, MAX_KEYS));
  return Response.json({ keys });
}

export async function POST(request: Request) {
  const auth = await requireIdentity(request, { roles: ["admin", "operator"] });
  if (!auth.identity) return auth.response;
  try {
    const body = (await request.json()) as { name?: unknown; scopes?: unknown; expiresInDays?: unknown };
    const name = typeof body.name === "string" ? body.name.trim().slice(0, 80) : "";
    const scopes = Array.isArray(body.scopes) ? body.scopes.filter((scope): scope is string => typeof scope === "string" && availableScopes.has(scope)) : [];
    const expiresInDays = Number(body.expiresInDays ?? 90);
    if (name.length < 3) return Response.json({ error: "Use a key name with at least three characters." }, { status: 400 });
    if (scopes.length === 0) return Response.json({ error: "Choose at least one API scope." }, { status: 400 });
    if (!Number.isInteger(expiresInDays) || expiresInDays < 1 || expiresInDays > 365) return Response.json({ error: "Expiry must be between 1 and 365 days." }, { status: 400 });
    const generated = createApiToken();
    const [key] = await db.insert(apiKeys).values({
      userId: auth.identity.userId,
      name,
      prefix: generated.prefix,
      tokenHash: generated.tokenHash,
      scopes,
      expiresAt: new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000),
    }).returning({ id: apiKeys.id, name: apiKeys.name, prefix: apiKeys.prefix, scopes: apiKeys.scopes, expiresAt: apiKeys.expiresAt });
    await writeAudit({ actorId: auth.identity.userId, action: "api_key_created", resourceType: "api_key", resourceId: key.id, request, data: { name, scopeCount: scopes.length } });
    return Response.json({ key, token: generated.token }, { status: 201 });
  } catch (error) {
    console.error("api key create failed", error);
    return Response.json({ error: "Could not create the API key." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const auth = await requireIdentity(request);
  if (!auth.identity) return auth.response;
  try {
    const body = (await request.json()) as { id?: unknown };
    const id = typeof body.id === "string" ? body.id : "";
    const [key] = await db.select().from(apiKeys).where(eq(apiKeys.id, id)).limit(1);
    if (!key || key.userId !== auth.identity.userId) return Response.json({ error: "API key not found." }, { status: 404 });
    await db.update(apiKeys).set({ revokedAt: new Date() }).where(eq(apiKeys.id, id));
    await writeAudit({ actorId: auth.identity.userId, action: "api_key_revoked", resourceType: "api_key", resourceId: id, request });
    return Response.json({ ok: true });
  } catch {
    return Response.json({ error: "Could not revoke the API key." }, { status: 500 });
  }
}
