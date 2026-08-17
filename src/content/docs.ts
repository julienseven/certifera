/**
 * The documentation content model.
 *
 * Blocks are data, not JSX, so the sidebar, the on-this-page rail, and the page
 * body are all generated from one source and cannot drift apart. Inline markup
 * inside `text` is deliberately tiny: `code`, **bold**, and [label](href).
 */

export type Block =
  | { kind: "p"; text: string }
  | { kind: "h3"; text: string }
  | { kind: "list"; items: readonly string[]; ordered?: boolean }
  | { kind: "code"; caption?: string; code: string }
  | { kind: "table"; head: readonly string[]; rows: ReadonlyArray<readonly string[]> }
  | { kind: "note"; tone: "info" | "warn"; title: string; text: string }
  | { kind: "demo-key" };

export type DocSection = {
  id: string;
  title: string;
  summary: string;
  blocks: readonly Block[];
};

export type DocGroup = {
  title: string;
  sections: readonly DocSection[];
};

export const docsMeta = {
  eyebrow: "Certifera documentation",
  title: "Verified execution, documented",
  standfirst:
    "Certifera turns a physical-world request into a funded, attributable, reviewable, settlement-ready outcome. This is the whole beta operating surface: the lifecycle, the API, the evidence rules, and the limits.",
  version: "v0.1 · controlled beta",
} as const;

export const docGroups: readonly DocGroup[] = [
  {
    title: "Introduction",
    sections: [
      {
        id: "overview",
        title: "Overview",
        summary: "What the platform does, and the one loop everything else serves.",
        blocks: [
          {
            kind: "p",
            text: "An agent funds an **outcome** — a machine-readable description of something that must be true in the physical world. Vetted **relays** bid to execute it. The winner uploads private **evidence**, which is signature-checked, hashed, and scored. A reviewer approves or disputes inside a fixed window, and only an approval authorizes payout. Every transition writes an append-only row to `execution_events`.",
          },
          {
            kind: "table",
            head: ["Status", "Meaning", "Who moves it"],
            rows: [
              ["`open`", "Funded and visible in the bid market.", "Buyer creates it"],
              ["`matched`", "A bid was selected; the execution clock runs.", "Buyer / operator"],
              ["`review`", "A proof bundle was submitted.", "Selected relay"],
              ["`verified`", "Approved. Payout is authorized.", "Reviewer / operator"],
              ["`disputed`", "Rejected with a reason.", "Reviewer / operator"],
              ["`reopened`", "Returned to the market after a dispute or breach.", "Operator"],
            ],
          },
          {
            kind: "note",
            tone: "info",
            title: "The console is not a privileged path",
            text: "Everything the operator console does, it does through this same API with the same role checks. There is no endpoint that only the UI can reach.",
          },
        ],
      },
      {
        id: "quickstart",
        title: "Quick start",
        summary: "From no account to a live request in three calls.",
        blocks: [
          {
            kind: "p",
            text: "Issue yourself a short-lived demo key pair — one operator identity, one relay identity — and walk the full lifecycle without registering. Demo keys expire two hours after issue and are minted against fixed demo accounts that never hold real work.",
          },
          { kind: "demo-key" },
          { kind: "h3", text: "1. Create an outcome" },
          {
            kind: "code",
            caption: "POST /api/requests",
            code: `curl -X POST https://certifera.xyz/api/requests \\
  -H "Authorization: Bearer cfr_…" \\
  -H "Content-Type: application/json" \\
  -d '{"title":"Verify panel array condition",
       "category":"Infrastructure",
       "location":"Austin, TX",
       "reward":180}'`,
          },
          { kind: "h3", text: "2. Watch the market" },
          {
            kind: "code",
            caption: "GET /api/requests/:id/activity",
            code: `curl https://certifera.xyz/api/requests/$ID/activity \\
  -H "Authorization: Bearer cfr_…"`,
          },
          { kind: "h3", text: "3. Read the proof" },
          {
            kind: "p",
            text: "Once a relay submits, `GET /api/requests/:id/proof` returns the bundle described in [Evidence](#evidence). Approve it with `PATCH /api/requests/:id/review`, and payout becomes authorized.",
          },
          {
            kind: "note",
            tone: "warn",
            title: "Keys are server-side credentials",
            text: "A `cfr_` key carries the full authority of the identity it was minted for. Never ship one to a browser, a mobile client, or a public repository.",
          },
        ],
      },
    ],
  },
  {
    title: "Platform",
    sections: [
      {
        id: "authentication",
        title: "Authentication",
        summary: "Sessions for humans, scoped bearer keys for agents.",
        blocks: [
          {
            kind: "p",
            text: "Browser operators authenticate with an HTTP-only session cookie. Agents authenticate with a bearer key prefixed `cfr_`, minted in the console. A session identity carries every scope; a key carries exactly the scopes it was issued with.",
          },
          {
            kind: "table",
            head: ["Scope", "Grants"],
            rows: [
              ["`requests:read`", "Read the request market and one outcome's activity ledger."],
              ["`requests:write`", "Create outcomes, place and revise bids, select a winner."],
              ["`proofs:read`", "Read proof bundles and evidence metadata."],
              ["`proofs:write`", "Upload evidence and submit proof bundles."],
            ],
          },
          {
            kind: "p",
            text: "Scope alone is not enough: every privileged route also checks a **role** (`buyer`, `relay`, `operator`, `reviewer`, `admin`) server-side. A relay key with `requests:write` still cannot approve its own work.",
          },
          {
            kind: "code",
            caption: "Authenticating a request",
            code: `Authorization: Bearer cfr_x8Kd…
Content-Type: application/json`,
          },
          {
            kind: "note",
            tone: "info",
            title: "Key material is never stored",
            text: "Only a SHA-256 digest and a 16-character prefix are persisted. A lost key cannot be recovered — revoke it in the console and mint another.",
          },
        ],
      },
      {
        id: "lifecycle",
        title: "Lifecycle & SLA",
        summary: "Deadlines are arithmetic, not promises.",
        blocks: [
          {
            kind: "p",
            text: "Two clocks run over an outcome. The **execution deadline** is set when a bid is selected; the **review deadline** is set when proof is submitted.",
          },
          {
            kind: "list",
            items: [
              "Execution deadline = the relay's quoted ETA plus `max(15 minutes, 20% of the ETA)`.",
              "Review deadline = 360 minutes (six hours) after the proof bundle lands.",
              "A missed deadline emits an SLA event, costs the relay 6 reputation, and can reopen the market.",
            ],
          },
          {
            kind: "p",
            text: "Reputation moves by fixed amounts: `+8` on a verified outcome, `−12` on a disputed one, `−6` on an SLA breach. Nothing is inferred from ratings or averages.",
          },
        ],
      },
      {
        id: "evidence",
        title: "Evidence",
        summary: "What a file has to survive before it counts as proof.",
        blocks: [
          {
            kind: "p",
            text: "Evidence is uploaded as multipart form data to `POST /api/evidence` by the selected relay, and only while the outcome is `matched`. The declared content type is checked against the file's actual magic bytes before anything is written.",
          },
          {
            kind: "table",
            head: ["Rule", "Value"],
            rows: [
              ["Accepted types", "`image/jpeg`, `image/png`, `image/webp`, `application/pdf`"],
              ["Size", "1 byte to 8 MB; an oversized `content-length` is refused with `413` before the body is read"],
              ["Addressing", "SHA-256 digest computed on upload and carried in the proof bundle"],
              ["Storage", "Private, AES-256 server-side encrypted, no public URL, `no-store`"],
              ["Access", "Authenticated and authorized actors only — the relay that produced it, and staff"],
            ],
          },
          { kind: "h3", text: "Capture scoring" },
          {
            kind: "p",
            text: "Every asset is scored 0–100 on what its metadata can actually support. Missing signal becomes a named flag, never an assumption.",
          },
          {
            kind: "table",
            head: ["Signal", "Contribution", "Flag when absent"],
            rows: [
              ["Base", "55", "—"],
              ["Capture time (EXIF)", "+15", "`capture_time_unavailable`"],
              ["GPS coordinates", "+15", "`gps_unavailable`"],
              ["Device make / model", "+10", "`device_metadata_unavailable`"],
              ["Payload ≥ 1 KB", "+5", "`small_file_requires_review`"],
            ],
          },
          {
            kind: "p",
            text: "A validated file signature always adds the positive flag `file_signature_validated`. PDFs additionally carry `document_metadata_limited`, because a document cannot supply capture metadata at all.",
          },
          {
            kind: "note",
            tone: "info",
            title: "Optional malware gate",
            text: "When a scanner webhook is configured, proof submission is held until the asset clears. The verdict can arrive asynchronously and names the asset id minted at upload.",
          },
        ],
      },
      {
        id: "proof",
        title: "Proof & review",
        summary: "The bundle an agent reasons over, and the two ways it ends.",
        blocks: [
          {
            kind: "p",
            text: "`GET /api/requests/:id/proof` returns the latest bundle for an outcome. It is readable by staff and by the relay that produced it.",
          },
          {
            kind: "code",
            caption: "200 OK",
            code: `{
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
          },
          {
            kind: "p",
            text: "`PATCH /api/requests/:id/review` takes `approve`, `dispute`, or `reopen`. Approval authorizes payout; a dispute requires a reviewer note and returns the outcome to the operator's queue.",
          },
        ],
      },
      {
        id: "settlement",
        title: "Settlement",
        summary: "One payout per outcome, guarded by the database.",
        blocks: [
          {
            kind: "p",
            text: "The protocol fee is 500 basis points — 5% of the gross quote. The relay nets the remainder, split at authorization rather than at release.",
          },
          {
            kind: "list",
            items: [
              "Release is `PATCH /api/requests/:id/settlement`, restricted to operator and admin.",
              "Exactly one payout per outcome, guarded by a compare-and-set plus a unique index, so a retried release is idempotent.",
              "Sandbox mode is the default and emits a non-financial `cert-sandbox-…` reference so the whole path can be exercised without moving money.",
              "Stripe Connect transfers run behind a per-payout idempotency key and require a configured webhook secret for reconciliation.",
            ],
          },
        ],
      },
    ],
  },
  {
    title: "Reference",
    sections: [
      {
        id: "endpoints",
        title: "Endpoints",
        summary: "The full beta surface, with the authority each route demands.",
        blocks: [
          {
            kind: "table",
            head: ["Method", "Path", "Authority"],
            rows: [
              ["POST", "`/api/requests`", "`requests:write`"],
              ["GET", "`/api/requests`", "`requests:read`"],
              ["POST", "`/api/requests/:id/bids`", "`requests:write` · relay"],
              ["PATCH", "`/api/requests/:id/bids`", "`requests:write` · buyer / operator"],
              ["POST", "`/api/evidence`", "`proofs:write` · selected relay"],
              ["POST", "`/api/requests/:id/proof`", "`proofs:write` · selected relay"],
              ["GET", "`/api/requests/:id/proof`", "`proofs:read` · staff or producing relay"],
              ["PATCH", "`/api/requests/:id/review`", "operator / reviewer"],
              ["PATCH", "`/api/requests/:id/settlement`", "operator / admin"],
              ["GET", "`/api/requests/:id/activity`", "`requests:read` · stakeholders"],
            ],
          },
        ],
      },
      {
        id: "errors",
        title: "Errors & rate limits",
        summary: "One error shape, per-minute windows, and a retry header.",
        blocks: [
          {
            kind: "p",
            text: "Every failure returns the same shape — a single human-readable string. Nothing leaks whether an email is registered, or whether a resource exists but is out of reach.",
          },
          { kind: "code", caption: "Any 4xx or 5xx", code: `{ "error": "Evidence can only be uploaded for a matched request." }` },
          {
            kind: "table",
            head: ["Status", "When"],
            rows: [
              ["`400`", "Malformed body, wrong file type, or a payload outside the size bounds."],
              ["`401`", "Missing or unrecognised credential."],
              ["`403`", "Authenticated, but the role or scope does not permit the action."],
              ["`409`", "The outcome is not in a state that allows this transition."],
              ["`413`", "Declared upload length exceeds the ceiling."],
              ["`429`", "Rate limited. A `retry-after` header carries the wait in seconds."],
            ],
          },
          { kind: "h3", text: "Limits" },
          {
            kind: "p",
            text: "Counters run in fixed one-minute windows, keyed per identity (or per hashed IP for anonymous routes).",
          },
          {
            kind: "table",
            head: ["Route family", "Requests / minute"],
            rows: [
              ["Evidence upload", "20"],
              ["Review and settlement", "30"],
              ["Everything else, authenticated", "180"],
              ["Sign-in / password reset confirm", "10"],
              ["Waitlist · demo key · password reset request", "5"],
              ["First-administrator setup", "3"],
            ],
          },
        ],
      },
      {
        id: "support",
        title: "Support",
        summary: "Where to take a question, and what is not ready yet.",
        blocks: [
          {
            kind: "p",
            text: "The repository is private during the closed beta. [Launch readiness](/launch) lists every go / no-go gate and its current state; [Security](/security) covers evidence integrity and the access model. Design partners get a direct operator escalation path.",
          },
          {
            kind: "note",
            tone: "warn",
            title: "Beta boundaries",
            text: "No real-money custody or escrow, no KYC/KYB policy, and no self-serve relay onboarding ships today. Settlement runs in sandbox unless Stripe credentials are configured and compliance review has signed off.",
          },
        ],
      },
    ],
  },
];

export const docSections = docGroups.flatMap((group) => group.sections);
export const docSectionIds = docSections.map((section) => section.id);
