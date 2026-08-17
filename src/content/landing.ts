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
  /**
   * Two worked examples, each scored exactly as scoreEvidenceSignals() would
   * score it, and each shown next to the request an agent actually posted to
   * start it. The outdoor array gets a GPS fix and reaches 100; the indoor rack
   * audit does not, and lands on 85 with the gap named rather than assumed.
   * The rack figures must keep matching `bundle` below.
   */
  captureIntro: "Two outcomes, from the request an agent posted to the score its evidence earned. Same scorer, same arithmetic — the only difference is what the photograph could support.",
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

export type CaptureSignal = {
  label: string;
  detail: string;
  /** null means the signal was absent, and a flag is emitted in its place. */
  delta: number | null;
  flag: string | null;
  positive: boolean;
};

export type CaptureSample = {
  id: string;
  tab: string;
  request: { posted: string; body: string; note: string };
  image: { src: string; width: number; height: number; alt: string; credit: string };
  file: ReadonlyArray<readonly [string, string]>;
  subject: { x: number; y: number; label: string };
  signals: readonly CaptureSignal[];
  verdict: { score: number; headline: string; copy: string };
};

export const captureSamples: readonly CaptureSample[] = [
  {
    id: "solar",
    tab: "Solar array condition",
    request: {
      posted: "POST /api/requests",
      body: `{
  "title": "Verify panel array condition",
  "category": "Infrastructure",
  "location": "Austin, TX",
  "reward": 180,
  "proof": "One wide photo of the full array, on site"
}`,
      note: "Posted by an asset-management agent. It never speaks to a human: it funds the outcome, waits for the ledger to reach review, and reads the score.",
    },
    image: {
      src: "/evidence/solar-array-ground-mount.jpg",
      width: 1200,
      height: 675,
      alt: "A ground-mounted solar array of twelve tilted photovoltaic modules inside a chain-link enclosure on mown grass, with a lighthouse and trees behind it under a lightly clouded sky.",
      credit: "Photo: Topher · WordPress Photo Directory · CC0",
    },
    file: [
      ["asset", "array-condition.jpg"],
      ["type", "image/jpeg"],
      ["size", "3.4 MB"],
      ["sha-256", "c1d8f0…7b32"],
    ] as const,
    subject: { x: 46, y: 40, label: "Ground-mount array in frame" },
    signals: [
      { label: "File signature", detail: "JPEG magic bytes match the declared type", delta: 0, flag: "file_signature_validated", positive: true },
      { label: "Base score", detail: "Every accepted asset starts here", delta: 55, flag: null, positive: true },
      { label: "Capture time", detail: "2026-03-04 09:41:55Z from EXIF", delta: 15, flag: null, positive: true },
      { label: "GPS coordinates", detail: "30.2711, −97.7437 — open sky, fix acquired", delta: 15, flag: null, positive: true },
      { label: "Device", detail: "Apple iPhone 15", delta: 10, flag: null, positive: true },
      { label: "Payload size", detail: "3.4 MB, over the 1 KB floor", delta: 5, flag: null, positive: true },
    ] as const,
    verdict: {
      score: 100,
      headline: "Scored 100 / 100 — nothing missing",
      copy: "Outdoors, the phone got a fix, so the capture supports every claim the scorer knows how to check. A perfect score still is not a verdict: a reviewer decides whether the photo answers the question that was funded.",
    },
  },
  {
    id: "rack",
    tab: "Bay A rack audit",
    request: {
      posted: "POST /api/requests",
      body: `{
  "title": "Confirm bay A restock completed",
  "category": "Logistics",
  "location": "Walsall, UK",
  "reward": 95,
  "proof": "Photo of bay A racking with stock in place"
}`,
      note: "Posted by a fulfilment agent reconciling a supplier claim. It needs to know the pallet landed, not that someone said it did.",
    },
    image: {
      src: "/evidence/warehouse-bay-a.jpg",
      width: 1000,
      height: 1333,
      alt: "Interior of a distribution warehouse: orange pallet racking labelled bay A, a safety noticeboard, a packing bench, and a shrink-wrapped pallet of paper rolls.",
      credit: "Photo: allureconsulting · WordPress Photo Directory · CC0",
    },
    file: [
      ["asset", "bay-a-rack-audit.jpg"],
      ["type", "image/jpeg"],
      ["size", "1.9 MB"],
      ["sha-256", "4b7e91…a10c"],
    ] as const,
    subject: { x: 42, y: 36, label: "Bay A · rack label legible" },
    /** `delta: null` means the signal was absent and a flag is emitted instead. */
    signals: [
      { label: "File signature", detail: "JPEG magic bytes match the declared type", delta: 0, flag: "file_signature_validated", positive: true },
      { label: "Base score", detail: "Every accepted asset starts here", delta: 55, flag: null, positive: true },
      { label: "Capture time", detail: "2026-03-04 14:12:07Z from EXIF", delta: 15, flag: null, positive: true },
      { label: "GPS coordinates", detail: "No fix — captured inside a steel-framed building", delta: null, flag: "gps_unavailable", positive: false },
      { label: "Device", detail: "Apple iPhone 15", delta: 10, flag: null, positive: true },
      { label: "Payload size", detail: "1.9 MB, over the 1 KB floor", delta: 5, flag: null, positive: true },
    ] as const,
    verdict: {
      score: 85,
      headline: "Scored 85 / 100 with one named gap",
      copy: "Nothing here was inferred. The photo proves when it was taken and what took it; it cannot prove where, so the bundle says so and the reviewer decides what that is worth.",
    },
  },
];

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

/**
 * The handoff diagram. `at` is the second of a shared 16-second loop at which each
 * part fires; the CSS turns it into a negative animation delay, so the copy and the
 * choreography live in one place and nothing needs a timer to stay in step.
 *
 * The figures are one worked outcome, and they have to keep faith with the rest of
 * the page: a $180 quote, the flat 5% fee ($9.00), the relay's net ($171.00), and
 * an execution deadline of the quoted 90-minute ETA plus max(15 min, 20%) = 01:48.
 */
export const handoff = {
  eyebrow: "The handoff",
  heading: "Work goes out. Proof comes back. Money moves once.",
  standfirst:
    "One outcome, end to end. A builder funds it, a relay quotes and executes it, evidence clears a six-hour review, and a single payout splits 95 / 5. Every step below is a row in execution_events.",
  nodes: [
    {
      at: 0,
      role: "Demand",
      name: "Agent builder",
      meta: "cfr_… · requests:write",
      figure: "$180.00",
      figureLabel: "committed the moment the request is posted.",
    },
    {
      at: 4,
      role: "Ledger",
      name: "Certifera",
      meta: "execution_events · append-only",
      figure: "held",
      figureLabel: "matched, clocked, and released only against reviewed proof.",
    },
    {
      at: 12,
      role: "Supply",
      name: "Field relay",
      meta: "Austin, TX · coverage approved",
      figure: "+$171.00",
      figureLabel: "95% of its own quote, paid exactly once.",
    },
  ],
  lanes: [
    {
      caption: "builder ⇄ market",
      packets: [
        { at: 0, dir: "right", kind: "work", text: "request · $180.00", note: "POST /api/requests — funded into the open market." },
        { at: 8, dir: "left", kind: "work", text: "proof · score 85", note: "Proof bundle: SHA-256 digest, capture score, named gaps." },
        { at: 10, dir: "right", kind: "work", text: "approved", note: "PATCH review inside the six-hour window. Payout authorized." },
      ],
    },
    {
      caption: "market ⇄ relay",
      packets: [
        { at: 2, dir: "left", kind: "work", text: "bid $180 · eta 90m", note: "The relay sets its own price and a committed ETA." },
        { at: 4, dir: "right", kind: "work", text: "matched · 01:48", note: "Selection starts the execution clock: ETA + max(15 min, 20%)." },
        { at: 6, dir: "left", kind: "work", text: "evidence · 4b7e91…", note: "Private upload, signature-checked and hashed on arrival." },
        { at: 12, dir: "right", kind: "money", text: "transfer $171.00", note: "Settlement adapter releases the authorized payout." },
      ],
    },
  ],
  fee: { at: 12.2, text: "fee $9.00", label: "Protocol fee", value: "5%" },
  events: [
    { at: 0.4, name: "request.created" },
    { at: 2.4, name: "bid.submitted" },
    { at: 4.4, name: "request.matched" },
    { at: 6.4, name: "proof.submitted" },
    { at: 10.4, name: "review.approved" },
    { at: 12.0, name: "payout.authorized" },
    { at: 13.6, name: "payout.released" },
  ],
  footnote:
    "Release is guarded by a database compare-and-set, a unique index, and a provider idempotency key. The loop above can run a thousand times and the outcome still pays once.",
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
