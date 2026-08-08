/**
 * Dev-only relay agent worker.
 *
 * Simulates an autonomous relay: polls open outcome requests, bids on ones
 * matching its coverage categories, then on match uploads evidence and
 * submits proof automatically. Authenticates with an admin-scoped API key
 * (relay-role accounts cannot self-issue API keys) and acts explicitly as
 * the relay identified by CERTIFERA_AGENT_RELAY_HANDLE.
 *
 * Usage:
 *   CERTIFERA_AGENT_TOKEN=cfr_... CERTIFERA_AGENT_RELAY_HANDLE=northstar-07 npm run agent:relay
 */

const baseUrl = process.env.CERTIFERA_BASE_URL || "http://localhost:3000";
const token = process.env.CERTIFERA_AGENT_TOKEN;
const relayHandle = process.env.CERTIFERA_AGENT_RELAY_HANDLE;
const pollIntervalMs = Number(process.env.CERTIFERA_AGENT_POLL_MS || 5000);
const quoteRatio = Number(process.env.CERTIFERA_AGENT_QUOTE_RATIO || 0.8);
const etaMinutes = Number(process.env.CERTIFERA_AGENT_ETA_MINUTES || 45);

if (!token) {
  console.error("Set CERTIFERA_AGENT_TOKEN to an admin-scoped API key (requests:read, requests:write, proofs:write).");
  process.exit(1);
}
if (!relayHandle) {
  console.error("Set CERTIFERA_AGENT_RELAY_HANDLE to the relay this worker bids and delivers on behalf of.");
  process.exit(1);
}

type Relay = { id: string; handle: string; coverageCategories: string[]; active: boolean };
type WorkOrder = {
  id: string;
  title: string;
  category: string;
  rewardCents: number;
  status: string;
  selectedRelayId: string | null;
  proofRequirements: string[];
};
type Bid = { workOrderId: string; relayId: string; status: string };

async function api(path: string, init: RequestInit = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: { authorization: `Bearer ${token}`, ...(init.headers || {}) },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(`${init.method || "GET"} ${path} -> ${response.status} ${body.error || response.statusText}`);
  }
  return response.json();
}

function syntheticEvidence() {
  return Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xff, 0xd9]);
}

async function findRelay(): Promise<Relay> {
  const { relays } = (await api("/api/relays")) as { relays: Relay[] };
  const relay = relays.find((candidate) => candidate.handle === relayHandle);
  if (!relay) throw new Error(`No active relay found with handle "${relayHandle}".`);
  return relay;
}

async function bidOnOpenRequests(relay: Relay) {
  const { requests } = (await api("/api/requests")) as { requests: WorkOrder[] };
  const candidates = requests.filter((request) => request.status === "open" && relay.coverageCategories.includes(request.category));

  for (const request of candidates) {
    const { bids } = (await api(`/api/requests/${request.id}/bids`)) as { bids: Bid[] };
    if (bids.some((bid) => bid.relayId === relay.id)) continue;

    const quoteDollars = Math.max(25, Math.min(request.rewardCents / 100, Math.round((request.rewardCents / 100) * quoteRatio)));
    await api(`/api/requests/${request.id}/bids`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ relayId: relay.id, quote: quoteDollars, etaMinutes, note: `Automated bid from ${relay.handle}.` }),
    });
    console.log(`[bid] ${request.title} -> $${quoteDollars} / ${etaMinutes}min`);
  }
}

async function fulfillMatchedRequests(relay: Relay) {
  const { requests } = (await api("/api/requests")) as { requests: WorkOrder[] };
  const matched = requests.filter((request) => request.status === "matched" && request.selectedRelayId === relay.id);

  for (const request of matched) {
    const form = new FormData();
    form.set("workOrderId", request.id);
    form.set("file", new Blob([syntheticEvidence()], { type: "image/jpeg" }), "evidence.jpg");
    const { asset } = (await api("/api/evidence", { method: "POST", body: form })) as { asset: { id: string } };

    const observation = `Automated relay delivery for "${request.title}". Requirements met: ${request.proofRequirements.join("; ")}.`;
    await api(`/api/requests/${request.id}/proof`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ observation, evidenceAssetId: asset.id, relayId: relay.id }),
    });
    console.log(`[proof] ${request.title} -> submitted`);
  }
}

async function tick() {
  try {
    const relay = await findRelay();
    await bidOnOpenRequests(relay);
    await fulfillMatchedRequests(relay);
  } catch (error) {
    console.error("[agent] cycle failed:", error instanceof Error ? error.message : error);
  }
}

console.log(`Relay agent worker started for "${relayHandle}" against ${baseUrl}, polling every ${pollIntervalMs}ms.`);
void tick();
setInterval(() => void tick(), pollIntervalMs);
