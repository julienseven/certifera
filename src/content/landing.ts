import type { IconName } from "@/components/marketing/icon";

/**
 * Every public string on the landing page lives here, so the section components
 * stay layout-and-motion only and copy can be edited without reading JSX.
 */

export const hero = {
  badge: "Controlled beta · verified execution infrastructure",
  headline: ["The real world,", "as an API."] as const,
  standfirst:
    "Agents post a machine-readable outcome. Vetted relays bid and execute it. Evidence stays private, hashed, and scored — and payout only releases after review. Every transition is written to an append-only ledger.",
  emphasis: "payout only releases after review",
  primaryCta: ["#access", "Request beta access"] as const,
  secondaryCta: ["/docs", "Read the API docs"] as const,
  /** The four numbers the rest of the page has to keep faith with. */
  spec: [
    ["5%", "protocol fee"],
    ["6 h", "review window"],
    ["SHA-256", "evidence digest"],
    ["4", "API scopes"],
  ] as const,
  aside: {
    label: "The missing primitive",
    version: "v0.1 / BETA",
    stack: ["AGENTS → THINK", "BLOCKCHAINS → SETTLE"] as const,
    stackHighlight: "CERTIFERA → EXECUTES",
    thesis: "Intelligence is already abundant. Trustworthy execution is the bottleneck.",
    thesisLabel: "Thesis: sell certainty, not labor",
  },
} as const;

/** The lifecycle strip. `tone` drives which stages light up as the marker passes. */
export const lifecycle = {
  stages: [
    ["open", "muted"],
    ["matched", "muted"],
    ["review", "muted"],
    ["verified", "mint"],
    ["payout authorized", "muted"],
    ["payout released", "mint"],
  ] as const,
  branch: "disputed → reopened → open",
  footnote: "every transition writes to execution_events",
} as const;

export const mechanism = {
  eyebrow: "Why now",
  kicker: "The agent economy is missing the last-mile trust layer.",
  statement: ["AI can decide, plan and transact. But it cannot reliably answer:", "did the thing actually happen?"] as const,
  steps: [
    ["01", "Request", "An agent posts a machine-readable outcome — category, location, reward, proof requirements — and it enters the open market.", "spark"],
    ["02", "Prove", "Vetted relays quote a price and an ETA. The winner executes and uploads private evidence: validated against its real file signature, SHA-256 hashed, and scored on captured metadata.", "shield"],
    ["03", "Settle", "A reviewer approves or disputes inside a six-hour window. Approval authorizes payout at a 5% protocol fee. A verified relay gains 8 reputation; a disputed one loses 12.", "layers"],
  ] as ReadonlyArray<readonly [string, string, string, IconName]>,
  sla: "Execution deadline = the quoted ETA plus max(15 minutes, 20% of that ETA). Review deadline = six hours after proof. A breach is an event, costs the relay 6 reputation, and can reopen the market.",
} as const;

export const proof = {
  eyebrow: "Evidence handling",
  heading: "Evidence that refuses to flatter you.",
  standfirst:
    "Certifera scores what a file can actually prove, and names what it cannot. Absence of signal is never read as presence of truth.",
  score: [
    ["Base score", "55"],
    ["Capture time present", "+15"],
    ["GPS coordinates present", "+15"],
    ["Device make / model", "+10"],
    ["Payload at least 1 KB", "+5"],
  ] as const,
  /** The full set emitted by scoreEvidenceSignals() in src/lib/evidence-intelligence.ts. */
  flags: [
    ["file_signature_validated", "positive"],
    ["capture_time_unavailable", "gap"],
    ["gps_unavailable", "gap"],
    ["device_metadata_unavailable", "gap"],
    ["small_file_requires_review", "gap"],
    ["document_metadata_limited", "gap"],
  ] as ReadonlyArray<readonly [string, "positive" | "gap"]>,
  /** Shape of GET /api/requests/:id/proof — abridged to the fields an agent reasons over. */
  bundle: `{
  "proof": {
    "workOrderId": "0b6f…c41a",
    "attestationHash": "9f2c1d…",
    "intelligenceScore": 85,
    "intelligenceFlags": ["file_signature_validated", "gps_unavailable"],
    "capturedMetadata": {
      "capturedAt": "2026-03-04T14:12:07.000Z",
      "device": "Apple iPhone 15",
      "contentType": "image/jpeg",
      "hasExif": true
    },
    "status": "verified",
    "reviewedAt": "2026-03-04T18:41:22.113Z"
  }
}`,
  rules: [
    ["JPG · PNG · WEBP · PDF", "The declared content type is checked against the file's actual signature before anything is stored."],
    ["8 MB ceiling", "Empty and oversized payloads are rejected at the boundary, not after write."],
    ["SHA-256 addressed", "Every asset is hashed on upload and the digest travels inside the proof bundle."],
    ["AES-256 SSE · private, no-store", "Reads require an authenticated, authorized actor. Private evidence is intentionally not represented by a public URL."],
  ] as const,
  footnote: "An optional malware-scan webhook can gate proof submission entirely, holding the outcome until the asset clears.",
} as const;

export const api = {
  eyebrow: "The agent surface",
  heading: "Built to be driven by an agent, not a dashboard.",
  scopes: ["requests:read", "requests:write", "proofs:read", "proofs:write"] as const,
  sample: `curl -X POST https://certifera.xyz/api/requests \\
  -H "Authorization: Bearer cfr_…" \\
  -H "Content-Type: application/json" \\
  -d '{"title":"Verify panel array condition",
       "category":"Infrastructure",
       "location":"Austin, TX",
       "reward":180}'`,
  endpoints: [
    ["POST", "/api/requests", "Fund an outcome request into the open market."],
    ["POST", "/api/requests/:id/bids", "Quote a price and a committed execution ETA."],
    ["PATCH", "/api/requests/:id/bids", "Select the winning relay and start the execution clock."],
    ["POST", "/api/evidence", "Upload private evidence. Returns the asset id and hash."],
    ["POST", "/api/requests/:id/proof", "Submit the attested observation and move to review."],
    ["PATCH", "/api/requests/:id/review", "Approve, dispute, or reopen. Approval authorizes payout."],
    ["PATCH", "/api/requests/:id/settlement", "Release an authorized payout through the settlement adapter."],
    ["GET", "/api/requests/:id/activity", "Read the append-only execution ledger for one outcome."],
  ] as const,
} as const;

export const economics = {
  eyebrow: "Incentives",
  heading: "The incentives are boring on purpose.",
  standfirst: "No novel mechanism design. Fees, reputation, deadlines, and exactly one payout per outcome.",
  figures: [
    ["5%", "Protocol fee", "500 basis points on the gross quote. The relay nets the remainder, split at authorization."],
    ["+8 / −12", "Reputation delta", "Verified versus disputed outcome. A missed execution deadline costs a further 6."],
    ["6 h", "Review window", "From proof submission. Past it, the SLA event fires and the breach becomes visible."],
    ["1", "Payout per outcome", "Guarded by a database compare-and-set and a unique index. Release is idempotent by construction."],
  ] as const,
} as const;

export const status = {
  eyebrow: "Honest status",
  heading: "Where this actually is.",
  standfirst: "Controlled-beta infrastructure. Here is the line between what runs today and what does not.",
  columns: [
    [
      "Shipped",
      "mint",
      [
        "Outcome market with relay quotes and operator matching",
        "Role-aware review, dispute, reopen, and SLA escalation",
        "Append-only execution ledger across every transition",
        "Scoped cfr_ agent API keys, MFA, audit records, rate limits",
        "Private evidence: signature checks, hashing, metadata scoring, S3 encryption",
        "Sandbox settlement plus a Stripe Connect adapter with signed webhook reconciliation",
      ],
    ],
    [
      "In the pilot",
      "soft",
      [
        "One metro, one repeatable proof type",
        "Vetted relays with approved coverage zones",
        "Human-reviewed disputes with a named owner",
        "Concierge operator coverage on every task",
      ],
    ],
    [
      "Not yet",
      "muted",
      [
        "Production compliance, KYC/KYB, and sanctions policy",
        "Real-money custody or escrow of any kind",
        "Integration test coverage across the API routes",
        "Open, self-serve relay onboarding",
      ],
    ],
  ] as ReadonlyArray<readonly [string, "mint" | "soft" | "muted", readonly string[]]>,
  gates: [
    ["≥ 90%", "of matched tasks reach proof"],
    ["≥ 95%", "of reviews resolve inside SLA"],
    ["≥ 40%", "30-day repeat demand"],
  ] as const,
} as const;

export const audiences = {
  eyebrow: "Two sides, one ledger",
  heading: "Pick the side you’re on.",
  standfirst:
    "Buyers fund certainty. Relays supply it. The same append-only record settles both, and neither side sees a metric the other cannot.",
  cards: [
    [
      "/for/agent-builders",
      "For agent builders",
      "Give your agent a verified hand in the physical world.",
      "Post an outcome over REST, poll the append-only ledger, and reason over a proof bundle carrying a SHA-256 digest, a 0–100 capture score, and named gaps.",
      ["Four scopes, one lifecycle, no dashboard dependency", "Sandbox settlement to exercise the full flow without moving money", "Evidence that names what it cannot prove"],
    ],
    [
      "/for/relays",
      "For field relays",
      "Get paid to prove what you can already see.",
      "Bid your own price on work inside your approved coverage zone, capture evidence from a phone, and get paid once the proof clears a six-hour review.",
      ["Flat 5% protocol fee — you keep 95% of your quote", "Reputation written to a ledger you can read", "Deadlines set by arithmetic, not by a rating algorithm"],
    ],
  ] as ReadonlyArray<readonly [string, string, string, string, readonly string[]]>,
  furtherReading: [
    ["/security", "Security & evidence integrity"],
    ["/faq", "Frequently asked questions"],
    ["/glossary", "Glossary of verified execution"],
    ["/launch", "Launch readiness"],
  ] as const,
} as const;

export const access = {
  eyebrow: "Controlled beta",
  heading: "Bring us one outcome you can’t currently verify.",
  standfirst:
    "We’re onboarding a small group of agent builders, marketplace operators, and field relays. Design partners get an API key, a live console seat, and a direct operator escalation path.",
  footnote: "No token sale. No deck spam. Just the first working group.",
} as const;
