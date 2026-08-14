import type { Metadata } from "next";
import Link from "next/link";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "Launch readiness — what ships before real money",
  description:
    "Certifera's public go/no-go plan: identity and authority, evidence integrity, money and compliance, and the pilot gates that must clear before the controlled beta widens.",
  path: "/launch",
  keywords: ["launch readiness", "beta go no-go gates", "verification platform roadmap", "pilot criteria"],
});

type Priority = "blocker" | "before-beta" | "post-pmf";

const readiness = [
  {
    id: "01",
    area: "Identity & authority",
    priority: "blocker" as Priority,
    owner: "Platform",
    outcome: "Every action has a verified actor and enforced scope.",
    items: [
      "Operator, relay, reviewer, and admin authentication",
      "Role-based permissions on every API route",
      "Relay identity verification and service-zone approval",
      "Rotatable agent API keys with per-key scopes and rate limits",
    ],
  },
  {
    id: "02",
    area: "Evidence integrity",
    priority: "blocker" as Priority,
    owner: "Trust",
    outcome: "Evidence is uploaded, preserved, and reviewable without trusting a URL.",
    items: [
      "Signed direct uploads to private object storage",
      "Hash every file and generate immutable evidence manifests",
      "Capture EXIF, time, geo, device, and chain-of-custody metadata",
      "Malware scanning, access controls, retention, and deletion policies",
    ],
  },
  {
    id: "03",
    area: "Money & compliance",
    priority: "blocker" as Priority,
    owner: "Ops + legal",
    outcome: "Real money can move with clear custody, payout, and dispute rules.",
    items: [
      "Choose a regulated payment or stablecoin-escrow partner",
      "KYC/KYB, sanctions screening, and payout onboarding where required",
      "Terms of service, marketplace agreement, privacy policy, and insurance requirements",
      "Tax records, payout reconciliation, chargeback, and refund playbooks",
    ],
  },
  {
    id: "04",
    area: "Reliability & security",
    priority: "blocker" as Priority,
    owner: "Platform",
    outcome: "The service survives retries, failures, traffic spikes, and incidents.",
    items: [
      "Idempotency keys and concurrency controls for money and state transitions",
      "Background jobs for SLA enforcement, retries, and notifications",
      "Encrypted secrets, audit logging, API rate limits, and abuse detection",
      "Backups, migration runbook, error tracking, uptime checks, and incident response",
    ],
  },
  {
    id: "05",
    area: "Pilot operations",
    priority: "before-beta" as Priority,
    owner: "Marketplace",
    outcome: "One city and one task category can be operated with exceptional support.",
    items: [
      "10 vetted relays in one dense launch zone",
      "3–5 paying design partners with repeatable demand",
      "Standard operating procedures for matching, review, disputes, and no-shows",
      "Dedicated operator coverage and a 15-minute escalation path",
    ],
  },
  {
    id: "06",
    area: "Product learning loop",
    priority: "before-beta" as Priority,
    owner: "Product",
    outcome: "Every paid task produces a decision that improves fill rate, proof quality, or margin.",
    items: [
      "Event taxonomy, funnel dashboards, and cohort retention tracking",
      "Request-to-bid, bid-to-match, match-to-proof, and review-to-release metrics",
      "Structured dispute reason codes and relay quality scorecards",
      "Weekly customer and relay feedback cadence with a visible product decision log",
    ],
  },
  {
    id: "07",
    area: "Protocol expansion",
    priority: "post-pmf" as Priority,
    owner: "Protocol",
    outcome: "Turn proven marketplace mechanics into a permissionless security layer.",
    items: [
      "Automated proof scoring and policy-driven approval lanes",
      "Staking, slashing, and verifier incentives only after repeat paid demand",
      "Portable relay reputation and proof-schema registry",
      "$CERT utility rollout after real task fees and security demand are observable",
    ],
  },
];

const gates = [
  ["Verified identity", "100%", "All payout-capable relays and operator roles have completed onboarding."],
  ["Evidence access", "100%", "Every reviewed proof is in private, hash-addressed storage—not an external URL."],
  ["Task completion", "≥ 90%", "Matched pilot tasks reach proof submission without manual rescue."],
  ["Review resolution", "≥ 95%", "Proofs reach approve or dispute inside the published review window."],
  ["Repeat demand", "≥ 40%", "Pilot customers create a second paid request within 30 days."],
  ["Contribution margin", "> 25%", "After relay reward, payment costs, review labor, and support."],
] as const;

function Glyph({ name, size = 18 }: { name: "arrow" | "check" | "shield" | "chart" | "spark"; size?: number }) {
  const base = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  if (name === "arrow") return <svg {...base}><path d="M5 12h14M13 6l6 6-6 6" /></svg>;
  if (name === "check") return <svg {...base}><path d="m5 12 4.2 4.2L19 6.5" /></svg>;
  if (name === "shield") return <svg {...base}><path d="M12 3 5.5 6v5c0 4.4 2.7 8.2 6.5 10 3.8-1.8 6.5-5.6 6.5-10V6L12 3Z" /><path d="m9.5 12 1.6 1.6 3.8-4" /></svg>;
  if (name === "chart") return <svg {...base}><path d="M4 19V5M4 19h16M8 15l3-4 3 2 5-7" /></svg>;
  return <svg {...base}><path d="m12 3-1.7 6.3L4 11l6.3 1.7L12 19l1.7-6.3L20 11l-6.3-1.7L12 3Z" /></svg>;
}

function priorityTheme(priority: Priority) {
  if (priority === "blocker") return "border-red-300/30 bg-red-300/[0.08] text-red-100";
  if (priority === "before-beta") return "border-sky-300/30 bg-sky-300/[0.08] text-sky-100";
  return "border-[#73f59a]/30 bg-[#73f59a]/[0.08] text-[#a8ffbe]";
}

export default function LaunchReadinessPage() {
  return (
    <main className="console-surface min-h-screen bg-[#060806] text-[#f4f7f2] selection:bg-[#73f59a] selection:text-[#071b0e]">
      <header className="sticky top-0 z-30 border-b border-white/10 bg-[#060806]/90 backdrop-blur-xl">
        <div className="mx-auto flex h-[68px] max-w-[1440px] items-center justify-between px-5 sm:px-8">
          <Link href="/" className="group flex items-center gap-3" aria-label="Certifera home"><span className="grid h-7 w-7 place-items-center rounded-full bg-[#73f59a] text-[#071b0e] transition-transform group-hover:rotate-45"><span className="h-2.5 w-2.5 rotate-45 border-2 border-current" /></span><span className="text-[18px] font-medium tracking-[-0.05em]">certifera<span className="text-[#73f59a]">/</span></span></Link>
          <div className="flex items-center gap-4"><span className="hidden text-[10px] font-semibold uppercase tracking-[0.15em] text-white/38 sm:block">Launch readiness / v0.1</span><Link href="/console" className="inline-flex items-center gap-2 rounded-full border border-[#73f59a]/35 bg-[#73f59a]/10 px-4 py-2 text-[10px] font-bold uppercase tracking-[0.13em] text-[#a8ffbe] transition-colors hover:bg-[#73f59a] hover:text-[#071b0e]">Open console <Glyph name="arrow" size={14} /></Link></div>
        </div>
      </header>

      <div className="mx-auto max-w-[1440px] px-5 py-10 sm:px-8 sm:py-14 lg:px-11 lg:py-18">
        <section className="grid gap-8 border-b border-white/10 pb-12 lg:grid-cols-[1.25fr_.75fr] lg:items-end">
          <div><div className="inline-flex items-center gap-2 rounded-full border border-[#73f59a]/25 bg-[#73f59a]/[0.06] px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.15em] text-[#a8ffbe]"><span className="h-1.5 w-1.5 rounded-full bg-[#73f59a]" /> Decision brief</div><h1 className="mt-6 max-w-4xl text-[clamp(3.1rem,6vw,6.5rem)] font-medium leading-[0.86] tracking-[-0.085em]">What must be true before we ask the world to trust us<span className="text-[#73f59a]">.</span></h1></div>
          <div className="rounded-2xl border border-white/10 bg-[#0b100c]/90 p-5 sm:p-6"><div className="flex items-center gap-3 text-[#a8ffbe]"><Glyph name="shield" size={19} /><p className="text-[10px] font-semibold uppercase tracking-[0.15em]">Launch principle</p></div><p className="mt-4 text-[17px] font-medium leading-[1.28] tracking-[-0.025em] text-white/88">Do not launch a token or a broad marketplace first. Launch a reliable, insured operating loop for one valuable proof type.</p><p className="mt-4 text-[12px] leading-relaxed text-white/48">The test is simple: a real customer should be able to pay for a real outcome, inspect its proof, resolve a problem, and trust the audit trail.</p></div>
        </section>

        <section className="mt-10 grid gap-3 sm:grid-cols-3"><Stat label="Non-negotiable workstreams" value="04" helper="before real-money beta" /><Stat label="Pilot launch sequence" value="01 city" helper="one task type / dense supply" accent /><Stat label="Token decision" value="Later" helper="after repeat paid demand" /></section>

        <section className="mt-14"><div className="flex flex-col justify-between gap-4 border-b border-white/10 pb-5 sm:flex-row sm:items-end"><div><p className="text-[10px] font-semibold uppercase tracking-[0.17em] text-[#73f59a]">Readiness map</p><h2 className="mt-2 text-[clamp(2rem,4vw,3.8rem)] font-medium leading-[0.92] tracking-[-0.07em]">Build in this order.</h2></div><p className="max-w-sm text-[12px] leading-relaxed text-white/48">Red items prevent a live beta. Blue items convert a safe beta into a learnable marketplace. Green items belong after PMF.</p></div>
          <div className="mt-5 grid gap-3 lg:grid-cols-2">{readiness.map((stream) => <article key={stream.id} className="glass-panel rounded-2xl border border-white/10 p-5 sm:p-6"><div className="flex items-start justify-between gap-4"><div className="flex items-start gap-4"><span className="font-mono text-[11px] text-[#73f59a]">{stream.id}</span><div><h3 className="text-xl font-medium tracking-[-0.045em]">{stream.area}</h3><p className="mt-2 text-[12px] leading-relaxed text-white/54">{stream.outcome}</p></div></div><span className={`shrink-0 rounded-full border px-2 py-1 text-[9px] font-bold uppercase tracking-[0.11em] ${priorityTheme(stream.priority)}`}>{stream.priority.replace("-", " ")}</span></div><ul className="mt-6 grid gap-2 border-t border-white/10 pt-5">{stream.items.map((item) => <li key={item} className="flex gap-2 text-[12px] leading-relaxed text-white/68"><span className="mt-1 shrink-0 text-[#73f59a]"><Glyph name="check" size={13} /></span>{item}</li>)}</ul><div className="mt-5 flex items-center justify-between border-t border-white/10 pt-4"><span className="text-[10px] uppercase tracking-[0.13em] text-white/36">Accountable team</span><span className="text-[11px] text-white/70">{stream.owner}</span></div></article>)}</div>
        </section>

        <section className="mt-14 grid gap-8 border-t border-white/10 pt-12 lg:grid-cols-[.8fr_1.2fr]"><div><p className="text-[10px] font-semibold uppercase tracking-[0.17em] text-[#73f59a]">Go / no-go gates</p><h2 className="mt-3 text-[clamp(2.2rem,4vw,4.3rem)] font-medium leading-[0.9] tracking-[-0.075em]">A beta is earned by evidence.</h2><p className="mt-6 max-w-sm text-[13px] leading-relaxed text-white/50">These are the numbers to review every week. If a gate is missing, the response is to narrow the scope—not to add marketing spend or token incentives.</p><div className="mt-8 flex gap-3"><span className="grid h-9 w-9 place-items-center rounded-lg border border-[#73f59a]/25 bg-[#73f59a]/[0.07] text-[#a8ffbe]"><Glyph name="chart" size={17} /></span><p className="max-w-xs text-[12px] leading-relaxed text-white/57">Measure the operating loop before declaring network effects: repeat buying, density, quality, response time, and unit economics.</p></div></div><div className="overflow-hidden rounded-2xl border border-white/10 bg-[#0b100c]/85"><div className="grid grid-cols-[1fr_90px] border-b border-white/10 px-5 py-4 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/37 sm:grid-cols-[1fr_110px_1.4fr]"><span>Gate</span><span className="text-right sm:text-center">Target</span><span className="hidden sm:block">Definition</span></div>{gates.map(([gate, target, definition]) => <div key={gate} className="grid grid-cols-[1fr_90px] gap-4 border-b border-white/10 px-5 py-4 last:border-0 sm:grid-cols-[1fr_110px_1.4fr]"><div className="text-[13px] font-medium tracking-[-0.02em] text-white/88">{gate}</div><div className="text-right text-[13px] font-medium text-[#a8ffbe] sm:text-center">{target}</div><div className="col-span-2 text-[11px] leading-relaxed text-white/46 sm:col-span-1">{definition}</div></div>)}</div></section>

        <section className="mt-14 rounded-2xl border border-[#73f59a]/25 bg-[#73f59a] p-6 text-[#071b0e] sm:p-9"><div className="grid gap-8 lg:grid-cols-[1fr_.9fr] lg:items-end"><div><p className="text-[10px] font-bold uppercase tracking-[0.17em] text-[#071b0e]/60">Recommended next sprint</p><h2 className="mt-4 max-w-3xl text-[clamp(2.5rem,5vw,5.4rem)] font-medium leading-[0.86] tracking-[-0.08em]">Identity, direct evidence, and real operating partners.</h2></div><div><p className="text-[14px] leading-relaxed text-[#071b0e]/72">The software is ready for a controlled sandbox. The next leap is not a prettier dashboard—it is validating actors, securing evidence, and completing ten paid outcomes in one place.</p><Link href="/console" className="mt-7 inline-flex items-center gap-3 rounded-full bg-[#071b0e] px-5 py-3 text-[10px] font-bold uppercase tracking-[0.14em] text-[#73f59a] transition-transform hover:-translate-y-0.5">Return to operations <Glyph name="arrow" size={15} /></Link></div></div>
        </section>
      </div>
    </main>
  );
}

function Stat({ label, value, helper, accent = false }: { label: string; value: string; helper: string; accent?: boolean }) {
  return <article className={`rounded-xl border p-5 ${accent ? "border-[#73f59a]/30 bg-[#73f59a]/[0.07]" : "border-white/10 bg-[#0b100c]/78"}`}><p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/42">{label}</p><p className={`mt-5 text-3xl font-medium tracking-[-0.065em] ${accent ? "text-[#a8ffbe]" : "text-white"}`}>{value}</p><p className="mt-2 text-[11px] text-white/43">{helper}</p></article>;
}
