import { db } from "@/db";
import { apiKeys } from "@/db/schema";
import { createApiToken, enforceAnonymousRateLimit, writeAudit } from "@/lib/auth";
import { ensureDemoIdentities } from "@/lib/demo";
import { ensureSandboxData } from "@/lib/sandbox";

const DEMO_KEY_NAME = "Demo (auto-issued)";
const EXPIRES_IN_MS = 2 * 60 * 60 * 1000;

/**
 * Public, self-serve demo credentials. Mints a fresh short-lived key pair
 * against the two fixed demo identities (never against a real account), so a
 * stranger can exercise the full request lifecycle without registering.
 *
 * Rate limited by IP. Usage against every other route is additionally bounded
 * by the existing per-user rate limits, shared across all demo callers since
 * they resolve to the same two underlying accounts.
 */
export async function POST(request: Request) {
  const rate = await enforceAnonymousRateLimit(request, "demo-api-key", 5);
  if (!rate.allowed) {
    return Response.json(
      { error: "Too many demo key requests. Please try again shortly." },
      { status: 429, headers: { "retry-after": String(rate.retryAfter) } },
    );
  }

  try {
    const { relay, operatorUser, relayUser } = await ensureDemoIdentities();
    await ensureSandboxData();

    const expiresAt = new Date(Date.now() + EXPIRES_IN_MS);

    const operatorToken = createApiToken();
    const relayToken = createApiToken();

    await db.insert(apiKeys).values([
      {
        userId: operatorUser.id,
        name: DEMO_KEY_NAME,
        prefix: operatorToken.prefix,
        tokenHash: operatorToken.tokenHash,
        scopes: ["requests:write"],
        expiresAt,
      },
      {
        userId: relayUser.id,
        name: DEMO_KEY_NAME,
        prefix: relayToken.prefix,
        tokenHash: relayToken.tokenHash,
        scopes: ["requests:write", "proofs:write"],
        expiresAt,
      },
    ]);

    await writeAudit({ action: "demo_api_key_issued", resourceType: "api_key", request, data: { relayId: relay.id } });

    return Response.json(
      {
        expiresAt: expiresAt.toISOString(),
        relayId: relay.id,
        operator: { token: operatorToken.token, role: "operator", scopes: ["requests:write"] },
        relay: { token: relayToken.token, role: "relay", scopes: ["requests:write", "proofs:write"] },
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("demo api key issuance failed", error);
    return Response.json({ error: "Could not issue demo credentials. Please try again." }, { status: 500 });
  }
}
