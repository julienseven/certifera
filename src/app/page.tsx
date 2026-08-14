import type { Metadata } from "next";
import Link from "next/link";
import type { CSSProperties } from "react";
import { SiteFooter } from "@/components/marketing/chrome";
import { SITE_URL, jsonLd, pageMetadata } from "@/lib/seo";
import { ScrollReveal, WaitlistForm } from "./landing-client";

export const metadata: Metadata = pageMetadata({
  title: "Certifera — Verified execution for agents",
  description:
    "Certifera is the operations layer for verified physical outcomes. Agents post a machine-readable request, vetted relays bid and execute, evidence is hashed and scored, and payout releases only after review.",
  path: "/",
  absoluteTitle: true,
});

type IconName = "arrow" | "spark" | "shield" | "layers" | "pulse" | "check";

function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };

  if (name === "arrow") {
    return <svg {...common}><path d="M5 12h14M13 6l6 6-6 6" /></svg>;
  }
  if (name === "spark") {
    return <svg {...common}><path d="m12 3-1.7 6.3L4 11l6.3 1.7L12 19l1.7-6.3L20 11l-6.3-1.7L12 3Z" /><path d="m19 17-.7 2.3L16 20l2.3.7L19 23l.7-2.3L22 20l-2.3-.7L19 17Z" /></svg>;
  }
  if (name === "shield") {
    return <svg {...common}><path d="M12 3 5.5 6v5c0 4.4 2.7 8.2 6.5 10 3.8-1.8 6.5-5.6 6.5-10V6L12 3Z" /><path d="m9.5 12 1.6 1.6 3.8-4" /></svg>;
  }
  if (name === "layers") {
    return <svg {...common}><path d="m12 3 8 4.5-8 4.5-8-4.5L12 3Z" /><path d="m4 12 8 4.5 8-4.5M4 16.5 12 21l8-4.5" /></svg>;
  }
  if (name === "pulse") {
    return <svg {...common}><path d="M3 12h4l2.2-6 4.1 12 2.2-6H21" /></svg>;
  }
  return <svg {...common}><path d="m5 12 4.2 4.2L19 6.5" /></svg>;
}

const navLinks = [
  ["#mechanism", "Mechanism"],
  ["#proof", "Proof"],
  ["#api", "API"],
  ["#economics", "Economics"],
  ["/security", "Security"],
  ["/docs", "Docs"],
] as const;

const mechanism = [
  ["01", "Request", "An agent posts a machine-readable outcome — category, location, reward, proof requirements — and it enters the open market.", "spark"],
  ["02", "Prove", "Vetted relays quote a price and an ETA. The winner executes and uploads private evidence: validated against its real file signature, SHA-256 hashed, and scored on captured metadata.", "shield"],
  ["03", "Settle", "A reviewer approves or disputes inside a six-hour window. Approval authorizes payout at a 5% protocol fee. A verified relay gains 8 reputation; a disputed one loses 12.", "layers"],
] as const;

const evidenceScore = [
  ["Base score", "55"],
  ["Capture time present", "+15"],
  ["GPS coordinates present", "+15"],
  ["Device make / model", "+10"],
  ["Payload at least 1 KB", "+5"],
] as const;

const evidenceFlags = ["capture_time_unavailable", "gps_unavailable", "device_metadata_unavailable", "small_file_requires_review"] as const;

const evidenceRules = [
  ["JPG · PNG · WEBP · PDF", "The declared content type is checked against the file's actual signature before anything is stored."],
  ["8 MB ceiling", "Empty and oversized payloads are rejected at the boundary, not after write."],
  ["SHA-256 addressed", "Every asset is hashed on upload and the digest travels inside the proof bundle."],
  ["AES-256 SSE · private, no-store", "Reads require an authenticated, authorized actor. Private evidence is intentionally not represented by a public URL."],
] as const;

const scopes = ["requests:read", "requests:write", "proofs:read", "proofs:write"] as const;

const endpoints = [
  ["POST", "/api/requests", "Fund an outcome request into the open market."],
  ["POST", "/api/requests/:id/bids", "Quote a price and a committed execution ETA."],
  ["PATCH", "/api/requests/:id/bids", "Select the winning relay and start the execution clock."],
  ["POST", "/api/evidence", "Upload private evidence. Returns the asset id and hash."],
  ["POST", "/api/requests/:id/proof", "Submit the attested observation and move to review."],
  ["PATCH", "/api/requests/:id/review", "Approve, dispute, or reopen. Approval authorizes payout."],
  ["PATCH", "/api/requests/:id/settlement", "Release an authorized payout through the settlement adapter."],
  ["GET", "/api/requests/:id/activity", "Read the append-only execution ledger for one outcome."],
] as const;

const economics = [
  ["5%", "Protocol fee", "500 basis points on the gross quote. The relay nets the remainder, split at authorization."],
  ["+8 / −12", "Reputation delta", "Verified versus disputed outcome. A missed execution deadline costs a further 6."],
  ["6 h", "Review window", "From proof submission. Past it, the SLA event fires and the breach becomes visible."],
  ["1", "Payout per outcome", "Guarded by a database compare-and-set and a unique index. Release is idempotent by construction."],
] as const;

const statusColumns = [
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
] as const;

const audiences = [
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
] as const;

const gates = [
  ["≥ 90%", "of matched tasks reach proof"],
  ["≥ 95%", "of reviews resolve inside SLA"],
  ["≥ 40%", "30-day repeat demand"],
] as const;

const revealDelay = (index: number) => ({ "--reveal-delay": `${index * 80}ms` }) as CSSProperties;

export default function HomePage() {
  return (
    <main className="console-surface min-h-screen overflow-hidden bg-ink text-bone selection:bg-mint selection:text-mint-ink">
      {/* Organization and WebSite are emitted once in the root layout; this graph
          adds only the home-page-specific entities and references them by @id. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLd([
            {
              "@type": "SoftwareApplication",
              "@id": `${SITE_URL}/#software`,
              name: "Certifera",
              applicationCategory: "BusinessApplication",
              operatingSystem: "Web",
              url: SITE_URL,
              publisher: { "@id": `${SITE_URL}/#organization` },
              description: "An operations layer for funding, proving, reviewing, and settling verified physical outcomes, with private hash-addressed evidence and an append-only execution ledger.",
              featureList: [
                "Open bid market for real-world outcome requests",
                "SHA-256 addressed private evidence with capture scoring",
                "Append-only execution ledger across every state transition",
                "Scoped cfr_ agent API keys with role-enforced routes",
                "Sandbox and Stripe Connect settlement adapters",
              ],
              offers: { "@type": "Offer", price: "0", priceCurrency: "USD", description: "Controlled beta access. A flat 5% protocol fee applies to settled outcomes." },
            },
            {
              "@type": "Service",
              "@id": `${SITE_URL}/#service`,
              name: "Verified physical outcome execution",
              serviceType: "Verification infrastructure",
              provider: { "@id": `${SITE_URL}/#organization` },
              areaServed: "US",
              description: "Fund a machine-readable real-world outcome, have a vetted relay execute it, and settle only against reviewed, hash-addressed evidence.",
            },
          ]),
        }}
      />
      <noscript>
        <style>{`[data-reveal]{opacity:1!important;transform:none!important}`}</style>
      </noscript>
      <div className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(circle_at_80%_-4%,rgba(115,245,154,0.14),transparent_38%),radial-gradient(circle_at_4%_46%,rgba(115,245,154,0.05),transparent_34%)]" />

      <div className="mx-auto max-w-[1440px] border-x border-line">
        <header className="sticky top-0 z-40 border-b border-line bg-ink/85 backdrop-blur-xl supports-[backdrop-filter]:bg-ink/70">
          <nav className="flex h-[76px] items-center justify-between px-5 sm:px-8 lg:px-11">
            <a href="#top" className="group flex items-center gap-3" aria-label="Certifera home">
              <span className="ease-out-expo grid h-7 w-7 place-items-center rounded-full bg-mint text-mint-ink transition-transform duration-300 group-hover:rotate-45">
                <span className="h-2.5 w-2.5 rotate-45 border-[2px] border-current" />
              </span>
              <span className="text-[18px] font-medium tracking-[-0.05em]">certifera<span className="text-mint">/</span></span>
            </a>
            <div className="hidden items-center gap-7 text-[11px] font-medium uppercase tracking-[0.16em] text-white/55 md:flex">
              {navLinks.map(([href, label]) => (
                <a key={href} className="transition-colors hover:text-mint" href={href}>{label}</a>
              ))}
            </div>
            <div className="flex items-center gap-4">
              <Link href="/access?next=/console" className="hidden text-[10px] font-bold uppercase tracking-[0.13em] text-white/48 transition-colors hover:text-mint-soft lg:block">Sign in</Link>
              <a href="#access" className="inline-flex items-center gap-2 rounded-full border border-mint/50 bg-mint/10 px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-mint-soft transition-colors hover:bg-mint hover:text-mint-ink">
                Request access <Icon name="arrow" size={14} />
              </a>
            </div>
          </nav>
        </header>

        <div id="top" className="grid scroll-mt-[88px] border-b border-line lg:grid-cols-[minmax(0,1fr)_300px]">
          <div className="relative px-5 pb-14 pt-16 sm:px-8 sm:pb-20 sm:pt-24 lg:px-11 lg:pb-24 lg:pt-28">
            <div className="animate-rise mb-9 flex items-center gap-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-mint-soft">
              <span className="animate-mint-pulse h-2 w-2 rounded-full bg-mint" />
              Controlled beta · verified execution infrastructure
            </div>
            <h1 className="animate-rise max-w-[930px] text-[clamp(3.55rem,8.4vw,8.3rem)] font-medium leading-[0.86] tracking-[-0.085em] text-bone [animation-delay:80ms]">
              The real world,<br />
              <span className="text-mint">as an API.</span>
            </h1>
            <p className="animate-rise mt-9 max-w-xl text-lg leading-relaxed tracking-[-0.025em] text-white/65 [animation-delay:160ms] sm:text-xl">
              Agents post a machine-readable outcome. Vetted relays bid and execute it. Evidence stays private, hashed, and scored — and <span className="text-white">payout only releases after review</span>. Every transition is written to an append-only ledger.
            </p>
            <div className="animate-rise mt-11 flex flex-col gap-4 [animation-delay:240ms] sm:flex-row sm:items-center">
              <a href="#access" className="ease-out-expo group inline-flex w-fit items-center gap-4 rounded-full bg-mint px-5 py-3 text-[11px] font-bold uppercase tracking-[0.14em] text-mint-ink transition-transform duration-300 hover:-translate-y-0.5">
                Request beta access <span className="ease-out-expo transition-transform duration-300 group-hover:translate-x-1"><Icon name="arrow" size={17} /></span>
              </a>
              <Link href="/docs" className="inline-flex w-fit items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/55 transition-colors hover:text-mint">
                Read the API docs <Icon name="arrow" size={14} />
              </Link>
            </div>
          </div>

          <aside className="flex flex-col justify-between border-t border-line bg-panel p-6 sm:p-8 lg:border-l lg:border-t-0 lg:p-8">
            <div>
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/40">The missing primitive</span>
                <span className="font-mono text-[11px] text-mint">v0.1 / BETA</span>
              </div>
              <div className="mt-12 font-mono text-[11px] leading-relaxed text-white/38">
                <p>AGENTS → THINK</p>
                <p>BLOCKCHAINS → SETTLE</p>
                <p className="mt-3 text-mint-soft">CERTIFERA → EXECUTES</p>
              </div>
            </div>
            <div className="mt-16 border-t border-line pt-5">
              <p className="text-[13px] leading-relaxed text-white/75">Intelligence is already abundant. Trustworthy execution is the bottleneck.</p>
              <p className="mt-4 text-[10px] uppercase tracking-[0.17em] text-white/35">Thesis: sell certainty, not labor</p>
            </div>
          </aside>
        </div>

        <div className="border-b border-line bg-panel px-5 py-6 sm:px-8 lg:px-11">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="overflow-x-auto">
              <pre className="font-mono text-[11px] leading-relaxed tracking-[0.04em] text-white/55">
{`open → matched → review → `}<span className="text-mint">verified</span>{` → payout authorized → `}<span className="text-mint">payout released</span>{`
`}<span className="text-white/40">{`                    ↘ disputed → reopened → open`}</span>
              </pre>
            </div>
            <p className="shrink-0 font-mono text-[10px] uppercase tracking-[0.14em] text-white/32">every transition writes to execution_events</p>
          </div>
        </div>

        <section id="mechanism" className="grid scroll-mt-[88px] border-b border-line lg:grid-cols-[300px_minmax(0,1fr)]">
          <div className="border-b border-line px-5 py-8 sm:px-8 lg:border-b-0 lg:border-r lg:px-11 lg:py-10">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-mint">Why now</p>
            <p className="mt-3 max-w-[180px] text-[13px] leading-relaxed text-white/48">The agent economy is missing the last-mile trust layer.</p>
          </div>
          <div className="p-5 sm:p-8 lg:p-10">
            <p className="max-w-4xl text-[clamp(1.9rem,4.1vw,4.45rem)] font-medium leading-[0.98] tracking-[-0.065em] text-white/90">
              AI can decide, plan and transact. But it cannot reliably answer: <span className="text-mint">did the thing actually happen?</span>
            </p>
            <div className="mt-12 grid gap-px overflow-hidden rounded-sm border border-line bg-white/10 md:grid-cols-3">
              {mechanism.map(([number, title, copy, icon], index) => (
                <article key={number} data-reveal style={revealDelay(index)} className="min-h-[250px] bg-panel p-5 sm:p-6">
                  <div className="flex items-start justify-between">
                    <span className="font-mono text-[11px] text-mint">{number}</span>
                    <span className="text-mint"><Icon name={icon as IconName} size={20} /></span>
                  </div>
                  <h2 className="mt-12 text-2xl font-medium tracking-[-0.05em]">{title}</h2>
                  <p className="mt-3 max-w-xs text-[13px] leading-relaxed text-white/50">{copy}</p>
                </article>
              ))}
            </div>
            <div className="mt-6 border-t border-line pt-6">
              <p className="max-w-3xl text-[12px] leading-relaxed text-white/50">
                <strong className="font-medium text-white">The SLA is arithmetic, not a promise.</strong> Execution deadline = the quoted ETA plus max(15 minutes, 20% of that ETA). Review deadline = six hours after proof. A breach is an event, costs the relay 6 reputation, and can reopen the market.
              </p>
            </div>
          </div>
        </section>

        <section id="proof" className="scroll-mt-[88px] border-b border-line px-5 py-14 sm:px-8 lg:px-11 lg:py-20">
          <div className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-mint">Evidence handling</p>
              <h2 className="mt-4 max-w-2xl text-[clamp(2.4rem,5vw,5.15rem)] font-medium leading-[0.91] tracking-[-0.075em]">Evidence that refuses to flatter you.</h2>
            </div>
            <p className="max-w-sm text-[13px] leading-relaxed text-white/50">Certifera scores what a file can actually prove, and names what it cannot. Absence of signal is never read as presence of truth.</p>
          </div>

          <div className="mt-12 grid gap-4 lg:grid-cols-[1.05fr_1fr]">
            <div data-reveal className="rounded-sm border border-line bg-panel p-5 sm:p-7">
              <div className="flex items-center justify-between border-b border-line pb-4">
                <span className="text-[10px] font-bold uppercase tracking-[0.17em] text-white/45">Capture score</span>
                <span className="font-mono text-[11px] text-mint">EVIDENCE / INTELLIGENCE</span>
              </div>
              <dl className="mt-6 font-mono text-[12px]">
                {evidenceScore.map(([label, value]) => (
                  <div key={label} className="flex items-baseline justify-between gap-4 py-2">
                    <dt className="text-white/55">{label}</dt>
                    <dd className="tabular-nums text-white/80">{value}</dd>
                  </div>
                ))}
                <div className="mt-2 flex items-baseline justify-between gap-4 border-t border-line pt-3">
                  <dt className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/45">Maximum</dt>
                  <dd className="tabular-nums text-mint">100</dd>
                </div>
              </dl>
              <div className="mt-6 border-t border-line pt-5">
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/38">Flags emitted</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {evidenceFlags.map((flag) => (
                    <span key={flag} className="rounded-full border border-line px-2.5 py-1 font-mono text-[10px] text-white/50">{flag}</span>
                  ))}
                </div>
                <p className="mt-5 text-[12px] leading-relaxed text-mint-soft">Missing signal becomes a named flag, not an inferred truth.</p>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
              {evidenceRules.map(([title, copy], index) => (
                <article key={title} data-reveal style={revealDelay(index)} className="ease-out-expo border border-line bg-panel p-5 transition-[transform,border-color,background-color] duration-300 hover:-translate-y-[3px] hover:border-mint/40 hover:bg-mint/[0.035]">
                  <div className="flex items-center justify-between gap-4">
                    <h3 className="text-[15px] font-medium tracking-[-0.03em]">{title}</h3>
                    <span className="shrink-0 text-mint"><Icon name="pulse" size={17} /></span>
                  </div>
                  <p className="mt-3 text-[13px] leading-relaxed text-white/60">{copy}</p>
                </article>
              ))}
            </div>
          </div>
          <p className="mt-5 text-[12px] leading-relaxed text-white/45">An optional malware-scan webhook can gate proof submission entirely, holding the outcome until the asset clears.</p>
        </section>

        <section id="api" className="scroll-mt-[88px] border-b border-line px-5 py-14 sm:px-8 lg:px-11 lg:py-20">
          <div className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-mint">The agent surface</p>
              <h2 className="mt-4 max-w-2xl text-[clamp(2.4rem,5vw,5.15rem)] font-medium leading-[0.91] tracking-[-0.075em]">Built to be driven by an agent, not a dashboard.</h2>
            </div>
            <p className="max-w-sm text-[13px] leading-relaxed text-white/50">Bearer keys prefixed <span className="font-mono text-mint-soft">cfr_</span>, four scopes, one lifecycle. The console is a view onto the same API, never a privileged path around it.</p>
          </div>

          <div className="mt-12 grid gap-4 lg:grid-cols-[1fr_1fr]">
            <div data-reveal className="flex flex-col gap-4">
              <pre className="overflow-x-auto rounded-sm border border-line bg-black/30 p-5 text-[11px] leading-relaxed text-mint-soft"><code>{`curl -X POST https://certifera.io/api/requests \\
  -H "Authorization: Bearer cfr_…" \\
  -H "Content-Type: application/json" \\
  -d '{"title":"Verify panel array condition",
       "category":"Infrastructure",
       "location":"Austin, TX",
       "reward":180}'`}</code></pre>
              <div className="flex flex-wrap gap-2">
                {scopes.map((scope) => (
                  <span key={scope} className="rounded-full border border-mint/25 bg-mint/[0.06] px-3 py-1.5 font-mono text-[10px] text-mint-soft">{scope}</span>
                ))}
              </div>
            </div>

            <div data-reveal className="overflow-hidden rounded-sm border border-line bg-panel">
              <div className="grid grid-cols-[68px_1fr] border-b border-line px-5 py-4 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/38 sm:grid-cols-[82px_1fr]">
                <span>Method</span><span>Endpoint</span>
              </div>
              {endpoints.map(([method, endpoint, description]) => (
                <div key={`${method}-${endpoint}`} className="grid grid-cols-[68px_1fr] gap-3 border-b border-line px-5 py-3.5 last:border-0 sm:grid-cols-[82px_1fr]">
                  <span className="font-mono text-[10px] text-mint-soft">{method}</span>
                  <div>
                    <p className="font-mono text-[11px] text-white/83">{endpoint}</p>
                    <p className="mt-1 text-[11px] leading-relaxed text-white/43">{description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div className="flex gap-3 rounded-sm border border-mint/25 bg-mint/[0.06] p-5">
              <span className="mt-0.5 shrink-0 text-mint"><Icon name="check" size={18} /></span>
              <p className="text-[13px] leading-relaxed text-white/70">
                <strong className="font-medium text-white">A reference relay worker ships in the repo.</strong> <span className="font-mono text-[12px] text-mint-soft">npm run agent:relay</span> polls the open market, bids on what it covers, uploads evidence, and submits proof with no human in the loop.
              </p>
            </div>
            <div className="flex gap-3 rounded-sm border border-line bg-panel p-5">
              <span className="mt-0.5 shrink-0 text-mint"><Icon name="layers" size={18} /></span>
              <p className="text-[13px] leading-relaxed text-white/60">
                <strong className="font-medium text-white">Dispatch preflight ranks supply</strong> on reputation, category coverage, local zone, and a recent heartbeat, and returns human-readable reasons. It is read-only and never bypasses the bid market.
              </p>
            </div>
          </div>
        </section>

        <section id="economics" className="scroll-mt-[88px] border-b border-line bg-moss px-5 py-14 sm:px-8 lg:px-11 lg:py-20">
          <div className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-mint">Incentives</p>
              <h2 className="mt-4 max-w-2xl text-[clamp(2.4rem,5vw,5.15rem)] font-medium leading-[0.91] tracking-[-0.075em]">The incentives are boring on purpose.</h2>
            </div>
            <p className="max-w-sm text-[13px] leading-relaxed text-white/50">No novel mechanism design. Fees, reputation, deadlines, and exactly one payout per outcome.</p>
          </div>

          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {economics.map(([figure, label, copy], index) => (
              <article key={label} data-reveal style={revealDelay(index)} className="border border-line bg-panel p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
                <p className="font-mono text-[clamp(2rem,3.4vw,2.9rem)] font-medium leading-none tracking-[-0.05em] text-mint">{figure}</p>
                <h3 className="mt-6 text-[10px] font-semibold uppercase tracking-[0.15em] text-white/45">{label}</h3>
                <p className="mt-2 text-[12px] leading-relaxed text-white/60">{copy}</p>
              </article>
            ))}
          </div>

          <p className="mt-8 max-w-3xl text-[13px] leading-relaxed text-white/55">
            Settlement runs in sandbox by default and emits a non-financial <span className="font-mono text-[12px] text-mint-soft">cert-sandbox-…</span> reference so the whole lifecycle can be exercised without moving money. Stripe Connect transfers are wired behind a per-payout idempotency key and stay gated on compliance review.
          </p>

          <p className="mt-6 border-t border-line pt-6 text-[12px] leading-relaxed text-white/45">
            <strong className="font-medium text-white/70">Roadmap.</strong> There is no token today — no wallet, chain, staking, or governance code ships in Certifera. A <span className="font-mono">$CERT</span> utility layer is a post-PMF decision, gated on observable task fees, repeat buyers, and real security demand.{" "}
            <Link href="/launch" className="text-mint-soft underline-offset-4 transition-colors hover:text-mint hover:underline">See launch readiness →</Link>
          </p>
        </section>

        <section id="status" className="scroll-mt-[88px] border-b border-line px-5 py-14 sm:px-8 lg:px-11 lg:py-20">
          <div className="flex flex-col justify-between gap-6 border-b border-line pb-9 md:flex-row md:items-end">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-mint">Honest status</p>
              <h2 className="mt-4 max-w-3xl text-[clamp(2.6rem,5.4vw,5.6rem)] font-medium leading-[0.89] tracking-[-0.08em]">Where this actually is.</h2>
            </div>
            <p className="max-w-sm text-[13px] leading-relaxed text-white/50">Controlled-beta infrastructure. Here is the line between what runs today and what does not.</p>
          </div>

          <div className="grid divide-y divide-line lg:grid-cols-3 lg:divide-x lg:divide-y-0">
            {statusColumns.map(([title, tone, items], index) => (
              <div key={title} data-reveal style={revealDelay(index)} className={`py-7 lg:py-9 ${index === 0 ? "lg:pr-7" : index === 1 ? "lg:px-7" : "lg:pl-7"}`}>
                <p className={`text-[10px] font-semibold uppercase tracking-[0.16em] ${tone === "mint" ? "text-mint" : tone === "soft" ? "text-mint-soft/70" : "text-white/38"}`}>{title}</p>
                <ul className="mt-6 space-y-3">
                  {items.map((item) => (
                    <li key={item} className="flex gap-3 text-[13px] leading-relaxed text-white/60">
                      <span className={`mt-2 h-1 w-1 shrink-0 rounded-full ${tone === "mint" ? "bg-mint" : tone === "soft" ? "bg-mint-soft/50" : "bg-white/25"}`} />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <div className="mt-10 flex flex-col gap-5 border-t border-line pt-8 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap gap-x-8 gap-y-3">
              {gates.map(([figure, label]) => (
                <p key={label} className="text-[12px] text-white/45">
                  <span className="font-mono text-[13px] text-mint-soft">{figure}</span> {label}
                </p>
              ))}
            </div>
            <Link href="/launch" className="shrink-0 text-[10px] font-bold uppercase tracking-[0.14em] text-mint-soft transition-colors hover:text-white">
              Full go / no-go gates <span className="ml-1 inline-block align-[-4px]"><Icon name="arrow" size={15} /></span>
            </Link>
          </div>
        </section>

        <section className="border-b border-line px-5 py-14 sm:px-8 lg:px-11 lg:py-20">
          <div className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-mint">Two sides, one ledger</p>
              <h2 className="mt-4 max-w-2xl text-[clamp(2.4rem,5vw,5.15rem)] font-medium leading-[0.91] tracking-[-0.075em]">Pick the side you’re on.</h2>
            </div>
            <p className="max-w-sm text-[13px] leading-relaxed text-white/50">Buyers fund certainty. Relays supply it. The same append-only record settles both, and neither side sees a metric the other cannot.</p>
          </div>

          <div className="mt-12 grid gap-4 lg:grid-cols-2">
            {audiences.map(([href, eyebrow, title, copy, points]) => (
              <Link
                key={href}
                href={href}
                data-reveal
                className="ease-out-expo group flex flex-col justify-between rounded-sm border border-line bg-panel p-6 transition-[transform,border-color,background-color] duration-300 hover:-translate-y-[3px] hover:border-mint/40 hover:bg-mint/[0.035] sm:p-8"
              >
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-mint">{eyebrow}</p>
                  <h3 className="mt-4 text-[clamp(1.7rem,3vw,2.4rem)] font-medium leading-[1.02] tracking-[-0.055em]">{title}</h3>
                  <p className="mt-4 max-w-md text-[13px] leading-relaxed text-white/55">{copy}</p>
                  <ul className="mt-6 space-y-2.5">
                    {points.map((point) => (
                      <li key={point} className="flex gap-3 text-[13px] leading-relaxed text-white/58">
                        <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-mint" />
                        {point}
                      </li>
                    ))}
                  </ul>
                </div>
                <span className="mt-8 inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.14em] text-mint-soft">
                  Read the detail
                  <span className="ease-out-expo transition-transform duration-300 group-hover:translate-x-1"><Icon name="arrow" size={14} /></span>
                </span>
              </Link>
            ))}
          </div>

          <div className="mt-6 flex flex-wrap gap-x-6 gap-y-3 border-t border-line pt-6 text-[12px] text-white/45">
            <span className="text-[10px] font-semibold uppercase tracking-[0.15em] text-white/32">Also worth reading</span>
            <Link href="/security" className="transition-colors hover:text-mint">Security &amp; evidence integrity</Link>
            <Link href="/faq" className="transition-colors hover:text-mint">Frequently asked questions</Link>
            <Link href="/glossary" className="transition-colors hover:text-mint">Glossary of verified execution</Link>
            <Link href="/launch" className="transition-colors hover:text-mint">Launch readiness</Link>
          </div>
        </section>

        <section id="access" className="scroll-mt-[88px] border-t border-line bg-mint px-5 py-14 text-mint-ink shadow-[0_-30px_120px_-40px_rgba(115,245,154,0.35)] sm:px-8 lg:px-11 lg:py-20">
          <div className="grid gap-10 lg:grid-cols-[1fr_1fr] lg:gap-16">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-mint-ink/60">Controlled beta</p>
              <h2 className="mt-5 max-w-xl text-[clamp(3rem,6vw,6.1rem)] font-medium leading-[0.86] tracking-[-0.085em]">Bring us one outcome you can’t currently verify.</h2>
              <p className="mt-8 max-w-md text-[14px] leading-relaxed text-mint-ink/70">We’re onboarding a small group of agent builders, marketplace operators, and field relays. Design partners get an API key, a live console seat, and a direct operator escalation path.</p>
            </div>
            <div className="self-end">
              <WaitlistForm />
              <p className="mt-8 text-[10px] uppercase tracking-[0.13em] text-mint-ink/52">No token sale. No deck spam. Just the first working group.</p>
            </div>
          </div>
        </section>

      </div>

      <SiteFooter />
      <ScrollReveal />
    </main>
  );
}
