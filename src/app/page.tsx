"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";

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

const profiles = [
  ["agent-builder", "Agent builder"],
  ["operator", "Marketplace operator"],
  ["protocol", "Protocol team"],
  ["researcher", "Research / media"],
] as const;

export default function HomePage() {
  const [email, setEmail] = useState("");
  const [profile, setProfile] = useState("agent-builder");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  async function handleJoin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("loading");
    setMessage("");

    try {
      const response = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, profile }),
      });
      const payload = (await response.json()) as { error?: string; alreadyJoined?: boolean };
      if (!response.ok) throw new Error(payload.error || "Could not save your request.");
      setStatus("success");
      setMessage(payload.alreadyJoined ? "You’re already on the signal list." : "You’re on the signal list. We’ll be in touch.");
      setEmail("");
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Could not save your request.");
    }
  }

  return (
    <main className="min-h-screen overflow-hidden bg-[#050605] text-[#f5f7f2] selection:bg-[#73f59a] selection:text-[#071b0e]">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@graph": [
              {
                "@type": "Organization",
                name: "Certifera",
                url: "https://certifera.io",
                sameAs: ["https://x.com/certifera", "https://github.com/certifera/certifera"],
              },
              {
                "@type": "SoftwareApplication",
                name: "Certifera",
                applicationCategory: "BusinessApplication",
                operatingSystem: "Web",
                description: "An operations layer for funding, proving, reviewing, and settling verified physical outcomes.",
              },
            ],
          }),
        }}
      />
      <div className="pointer-events-none fixed inset-0 z-0 bg-[radial-gradient(circle_at_78%_6%,rgba(31,186,109,0.16),transparent_22%),radial-gradient(circle_at_10%_34%,rgba(91,238,136,0.08),transparent_24%)]" />

      <section className="relative z-10 mx-auto max-w-[1440px] border-x border-white/10">
        <nav className="flex h-[76px] items-center justify-between border-b border-white/10 px-5 sm:px-8 lg:px-11">
          <a href="#top" className="group flex items-center gap-3" aria-label="Certifera home">
            <span className="grid h-7 w-7 place-items-center rounded-full bg-[#73f59a] text-[#071b0e] transition-transform group-hover:rotate-45">
              <span className="h-2.5 w-2.5 rotate-45 border-[2px] border-current" />
            </span>
            <span className="text-[18px] font-medium tracking-[-0.05em]">certifera<span className="text-[#73f59a]">/</span></span>
          </a>
          <div className="hidden items-center gap-7 text-[11px] font-medium uppercase tracking-[0.16em] text-white/55 md:flex">
            <a className="transition-colors hover:text-[#73f59a]" href="#thesis">Thesis</a>
            <a className="transition-colors hover:text-[#73f59a]" href="#utility">Utility</a>
            <a className="transition-colors hover:text-[#73f59a]" href="#launch">GTM</a>
            <a className="transition-colors hover:text-[#73f59a]" href="#pmf">PMF signals</a>
            <a className="transition-colors hover:text-[#73f59a]" href="#next">Next 90</a>
            <a className="transition-colors hover:text-[#73f59a]" href="/docs">Docs</a>
          </div>
          <a href="#access" className="inline-flex items-center gap-2 rounded-full border border-[#73f59a]/50 bg-[#73f59a]/10 px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#9affb8] transition-colors hover:bg-[#73f59a] hover:text-[#071b0e]">
            Request access <Icon name="arrow" size={14} />
          </a>
        </nav>

        <div id="top" className="grid border-b border-white/10 lg:grid-cols-[minmax(0,1fr)_300px]">
          <div className="relative px-5 pb-14 pt-16 sm:px-8 sm:pb-20 sm:pt-24 lg:px-11 lg:pb-24 lg:pt-28">
            <div className="mb-9 flex items-center gap-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#8dffad]">
              <span className="h-2 w-2 rounded-full bg-[#73f59a] shadow-[0_0_16px_4px_rgba(115,245,154,0.35)]" />
              Concept brief / 001
            </div>
            <h1 className="max-w-[930px] text-[clamp(3.55rem,8.4vw,8.3rem)] font-medium leading-[0.86] tracking-[-0.085em] text-[#f4f7f2]">
              The real world,<br />
              <span className="text-[#73f59a]">as an API.</span>
            </h1>
            <p className="mt-9 max-w-xl text-lg leading-relaxed tracking-[-0.025em] text-white/65 sm:text-xl">
              Certifera gives autonomous agents a native way to buy <span className="text-white">verified physical outcomes</span>—without a human marketplace, trusted middleman, or fake proof.
            </p>
            <div className="mt-11 flex flex-col gap-4 sm:flex-row sm:items-center">
              <Link href="/console" className="group inline-flex w-fit items-center gap-4 rounded-full bg-[#73f59a] px-5 py-3 text-[11px] font-bold uppercase tracking-[0.14em] text-[#071b0e] transition-transform hover:-translate-y-0.5">
                Open live console <span className="transition-transform group-hover:translate-x-1"><Icon name="arrow" size={17} /></span>
              </Link>
              <a href="#thesis" className="inline-flex w-fit items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/55 transition-colors hover:text-[#73f59a]">See the mechanism <Icon name="arrow" size={14} /></a>
            </div>
          </div>

          <aside className="flex flex-col justify-between border-t border-white/10 bg-[#0a100c] p-6 sm:p-8 lg:border-l lg:border-t-0 lg:p-8">
            <div>
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/40">The missing primitive</span>
                <span className="text-[11px] font-mono text-[#73f59a]">01 / 04</span>
              </div>
              <div className="mt-12 font-mono text-[11px] leading-relaxed text-white/38">
                <p>AGENTS → THINK</p>
                <p>BLOCKCHAINS → SETTLE</p>
                <p className="mt-3 text-[#9affb8]">CERTIFERA → EXECUTES</p>
              </div>
            </div>
            <div className="mt-16 border-t border-white/10 pt-5">
              <p className="text-[13px] leading-relaxed text-white/75">Intelligence is already abundant. Trustworthy execution is the bottleneck.</p>
              <p className="mt-4 text-[10px] uppercase tracking-[0.17em] text-white/35">Thesis: sell certainty, not labor</p>
            </div>
          </aside>
        </div>

        <section id="thesis" className="grid border-b border-white/10 lg:grid-cols-[300px_minmax(0,1fr)]">
          <div className="border-b border-white/10 px-5 py-8 sm:px-8 lg:border-b-0 lg:border-r lg:px-11 lg:py-10">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#73f59a]">Why now</p>
            <p className="mt-3 max-w-[180px] text-[13px] leading-relaxed text-white/48">The agent economy is missing the last-mile trust layer.</p>
          </div>
          <div className="p-5 sm:p-8 lg:p-10">
            <p className="max-w-4xl text-[clamp(1.9rem,4.1vw,4.45rem)] font-medium leading-[0.98] tracking-[-0.065em] text-white/90">
              AI can decide, plan and transact. But it cannot reliably answer: <span className="text-[#73f59a]">did the thing actually happen?</span>
            </p>
            <div className="mt-12 grid gap-px overflow-hidden rounded-sm border border-white/10 bg-white/10 md:grid-cols-3">
              {[
                ["01", "Request", "An agent posts a machine-readable outcome: inspect a solar roof, verify stock, deliver a sensor.", "spark"],
                ["02", "Prove", "Local relays compete, execute, and submit a privacy-preserving proof bundle from the physical world.", "shield"],
                ["03", "Settle", "Certifera’s proof market resolves the task. Stakes move, settlement releases, and performance becomes portable reputation.", "layers"],
              ].map(([number, title, copy, icon]) => (
                <article key={title as string} className="min-h-[230px] bg-[#080a08] p-5 sm:p-6">
                  <div className="flex items-start justify-between"><span className="font-mono text-[11px] text-[#73f59a]">{number}</span><span className="text-[#73f59a]"><Icon name={icon as IconName} size={20} /></span></div>
                  <h2 className="mt-12 text-2xl font-medium tracking-[-0.05em]">{title}</h2>
                  <p className="mt-3 max-w-xs text-[13px] leading-relaxed text-white/50">{copy}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="utility" className="border-b border-white/10 px-5 py-14 sm:px-8 lg:px-11 lg:py-20">
          <div className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#73f59a]">The $CERT economic loop</p>
              <h2 className="mt-4 max-w-2xl text-[clamp(2.4rem,5vw,5.15rem)] font-medium leading-[0.91] tracking-[-0.075em]">A token with a job to do.</h2>
            </div>
            <p className="max-w-sm text-[13px] leading-relaxed text-white/50">Not a loyalty point. $CERT is the cost of coordination, the bond for truth, and the ownership layer for the execution network.</p>
          </div>

          <div className="mt-12 grid gap-4 lg:grid-cols-[1.45fr_1fr]">
            <div className="relative overflow-hidden rounded-sm bg-[#73f59a] p-6 text-[#071b0e] sm:p-8">
              <div className="absolute right-[-4%] top-[-33%] h-[330px] w-[330px] rounded-full border-[46px] border-[#1d9956]/25" />
              <div className="relative">
                <div className="flex items-center justify-between border-b border-[#071b0e]/20 pb-4">
                  <span className="text-[10px] font-bold uppercase tracking-[0.17em]">The flywheel</span>
                  <span className="font-mono text-[11px]">$CERT / UTILITY MAP</span>
                </div>
                <div className="grid gap-3 py-8 sm:grid-cols-3 sm:gap-0">
                  {[
                    ["1", "Demand", "Agents buy outcome credits in $CERT.", "No task → no fee."],
                    ["2", "Security", "Relays lock $CERT to bid for execution rights.", "Bad proof loses stake."],
                    ["3", "Supply", "Protocol fees buy back verifier capacity and reward accurate relays.", "Truth earns yield."],
                  ].map(([number, title, copy, foot], index) => (
                    <div key={title} className={`relative py-4 sm:px-5 sm:py-0 ${index !== 0 ? "sm:border-l sm:border-[#071b0e]/20" : ""}`}>
                      <span className="font-mono text-xs text-[#071b0e]/55">0{number}</span>
                      <h3 className="mt-7 text-2xl font-medium tracking-[-0.05em]">{title}</h3>
                      <p className="mt-3 text-[13px] leading-relaxed text-[#071b0e]/70">{copy}</p>
                      <p className="mt-7 text-[10px] font-semibold uppercase tracking-[0.13em] text-[#071b0e]/65">{foot}</p>
                    </div>
                  ))}
                </div>
                <div className="flex items-center gap-2 border-t border-[#071b0e]/20 pt-4 text-[11px] font-medium"><span className="h-2 w-2 rounded-full bg-[#071b0e]" /> Real execution. Measurable token demand.</div>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
              {[
                ["Burn", "Every verified task retires a small $CERT proof fee.", "Demand becomes protocol revenue."],
                ["Stake", "Relays collateralize outcomes with $CERT.", "Security scales with task value."],
                ["Vote", "Holders curate proof modules and disputed outcomes.", "Governance controls quality, not vibes."],
              ].map(([title, copy, sub]) => (
                <article key={title} className="border border-white/10 bg-[#0a0d0a] p-5">
                  <div className="flex items-center justify-between"><h3 className="text-xl font-medium tracking-[-0.045em]">{title}</h3><span className="text-[#73f59a]"><Icon name="pulse" size={17} /></span></div>
                  <p className="mt-4 text-[13px] leading-relaxed text-white/70">{copy}</p>
                  <p className="mt-3 text-[10px] uppercase tracking-[0.12em] text-white/35">{sub}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="launch" className="grid border-b border-white/10 lg:grid-cols-[300px_minmax(0,1fr)]">
          <div className="border-b border-white/10 bg-[#061209] p-5 sm:p-8 lg:border-b-0 lg:border-r lg:p-11">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#73f59a]">Route to market</p>
            <h2 className="mt-5 text-[clamp(2.5rem,4.4vw,4.6rem)] font-medium leading-[0.9] tracking-[-0.07em]">Start narrow.<br />Own the proof.</h2>
            <p className="mt-8 text-[13px] leading-relaxed text-white/50">Do not launch a global human network. Launch a high-value verification API inside an existing automated workflow.</p>
          </div>
          <div className="divide-y divide-white/10">
            {[
              ["Phase 01", "Wedge: critical infrastructure", "Sell a verification endpoint to drone operators, solar O&M firms, and climate-data platforms. Their agents already need geo-timestamped proof that an inspection occurred.", "Design partners", "10 operators / 3 months"],
              ["Phase 02", "Density: one city, one proof", "Recruit accredited field relays around a single metro and standardize the repeatable proof bundle: location, sensor, timestamp, attestation.", "North-star", "< 18 min fulfillment"],
              ["Phase 03", "Platform: agent-native demand", "Open an SDK and escrow API. Let agent builders request outcomes programmatically and let any approved relay sell capacity.", "Growth loop", "Task data → better routing → lower cost"],
            ].map(([phase, title, copy, metric, value]) => (
              <article key={phase} className="grid gap-4 px-5 py-7 sm:px-8 md:grid-cols-[130px_minmax(0,1fr)_170px] md:items-start lg:px-11 lg:py-9">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#73f59a]">{phase}</p>
                <div><h3 className="text-2xl font-medium tracking-[-0.05em] text-white">{title}</h3><p className="mt-3 max-w-xl text-[13px] leading-relaxed text-white/50">{copy}</p></div>
                <div className="border-l border-white/10 pl-4 md:mt-1"><p className="text-[10px] uppercase tracking-[0.14em] text-white/35">{metric}</p><p className="mt-2 text-sm text-[#b8ffc8]">{value}</p></div>
              </article>
            ))}
          </div>
        </section>

        <section id="pmf" className="px-5 py-14 sm:px-8 lg:px-11 lg:py-20">
          <div className="grid gap-10 lg:grid-cols-[1fr_1.2fr] lg:gap-16">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#73f59a]">Prove PMF before protocol theater</p>
              <h2 className="mt-5 text-[clamp(2.6rem,5vw,5.3rem)] font-medium leading-[0.9] tracking-[-0.075em]">The metrics that earn a network.</h2>
              <p className="mt-7 max-w-md text-[14px] leading-relaxed text-white/52">Treat the token launch as a consequence of repeat demand—not a substitute for it. These are the gates before opening the market.</p>
            </div>
            <div className="space-y-3">
              {[
                ["01", "Pull", "≥ 40% of pilot tasks are repeated by the same agent account within 30 days.", "Repeat rate", "40%"],
                ["02", "Trust", "≥ 95% of proof bundles resolve automatically, without a human adjudicator.", "Auto-resolve", "95%"],
                ["03", "Unit economics", "Task margin covers relay reward, verification cost, and a durable protocol take rate.", "Contribution", "> 25%"],
                ["04", "Liquidity", "Three independent relays bid on the majority of requests in the launch zone.", "Competitive tasks", "70%"],
              ].map(([number, title, copy, metric, figure]) => (
                <div key={number} className="group grid grid-cols-[30px_minmax(0,1fr)] gap-4 border border-white/10 bg-white/[0.025] p-4 transition-colors hover:border-[#73f59a]/45 hover:bg-[#73f59a]/[0.04] sm:grid-cols-[40px_minmax(0,1fr)_105px] sm:gap-5 sm:p-5">
                  <span className="font-mono text-[11px] text-[#73f59a]">{number}</span>
                  <div><h3 className="text-[16px] font-medium tracking-[-0.03em]">{title}</h3><p className="mt-1 text-[12px] leading-relaxed text-white/48">{copy}</p></div>
                  <div className="col-start-2 flex items-end justify-between border-t border-white/10 pt-3 sm:col-start-auto sm:block sm:border-l sm:border-t-0 sm:pl-5 sm:pt-0"><span className="text-[10px] uppercase tracking-[0.12em] text-white/35">{metric}</span><strong className="text-lg font-medium text-[#a3ffbb] sm:mt-2 sm:block">{figure}</strong></div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="next" className="border-t border-white/10 bg-[#0b160e] px-5 py-14 sm:px-8 lg:px-11 lg:py-20">
          <div className="flex flex-col justify-between gap-6 border-b border-white/10 pb-9 md:flex-row md:items-end">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#73f59a]">The next move</p>
              <h2 className="mt-4 max-w-3xl text-[clamp(2.7rem,5.4vw,5.8rem)] font-medium leading-[0.89] tracking-[-0.08em]">Build proof before you build protocol.</h2>
            </div>
            <p className="max-w-sm text-[13px] leading-relaxed text-white/50">The sequence is deliberately unsexy: sell a painful outcome, fulfill it manually, then automate only the repeatable trust primitive.</p>
          </div>

          <div className="grid divide-y divide-white/10 lg:grid-cols-3 lg:divide-x lg:divide-y-0">
            {[
              ["Days 01—14", "Find the unbearable task", "Interview 20 infrastructure operators. Qualify only tasks that are time-sensitive, auditable and already cost more than $150 to verify.", "Deliverable", "One signed design-partner LOI + task spec"],
              ["Days 15—45", "Run the human-in-the-loop concierge", "Fulfill 50 paid proofs in one metro. Use existing inspectors or drone teams; manually curate the proof package and learn every failure mode.", "Deliverable", "A repeatable proof bundle with 95% acceptance"],
              ["Days 46—90", "Productize the narrowest loop", "Ship the request API, escrow flow and relay console for that single proof type. Charge from day one. Keep the token off until repeat demand is visible.", "Deliverable", "10 paying accounts + 40% 30-day repeat"],
            ].map(([period, title, copy, label, goal], index) => (
              <article key={period} className={`relative px-0 py-7 lg:px-7 lg:py-9 ${index === 0 ? "lg:pl-0" : ""}`}>
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#73f59a]">{period}</p>
                <h3 className="mt-8 max-w-xs text-[clamp(1.7rem,2.6vw,2.4rem)] font-medium leading-[0.95] tracking-[-0.06em]">{title}</h3>
                <p className="mt-5 max-w-sm text-[13px] leading-relaxed text-white/53">{copy}</p>
                <div className="mt-9 border-l-2 border-[#73f59a] pl-3"><p className="text-[10px] uppercase tracking-[0.14em] text-white/35">{label}</p><p className="mt-1 text-[13px] text-[#c5ffd3]">{goal}</p></div>
              </article>
            ))}
          </div>

          <div className="mt-10 flex flex-col gap-4 rounded-sm border border-[#73f59a]/25 bg-[#73f59a]/[0.06] p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
            <div className="flex gap-3"><span className="mt-0.5 text-[#73f59a]"><Icon name="check" size={18} /></span><p className="max-w-2xl text-[13px] leading-relaxed text-white/70"><strong className="font-medium text-white">Token trigger:</strong> initiate the $CERT launch design only after task fees, relay stakes, and repeat buyers are all observable in the live system. The token must make an already-working market safer and cheaper.</p></div>
            <a href="#access" className="shrink-0 text-[10px] font-bold uppercase tracking-[0.14em] text-[#9affb8] transition-colors hover:text-white">Find a design partner <span className="ml-1 inline-block align-[-4px]"><Icon name="arrow" size={15} /></span></a>
          </div>
        </section>

        <section id="access" className="border-t border-white/10 bg-[#73f59a] px-5 py-14 text-[#071b0e] sm:px-8 lg:px-11 lg:py-20">
          <div className="grid gap-10 lg:grid-cols-[1fr_1fr] lg:gap-16">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#071b0e]/60">Build the proof economy</p>
              <h2 className="mt-5 max-w-xl text-[clamp(3rem,6vw,6.1rem)] font-medium leading-[0.86] tracking-[-0.085em]">Be early to what agents will need next.</h2>
              <p className="mt-8 max-w-md text-[14px] leading-relaxed text-[#071b0e]/70">We’re gathering the first operators, agent builders, and proof researchers for the Certifera design circle.</p>
            </div>
            <div className="self-end">
              <form onSubmit={handleJoin} className="space-y-4" noValidate>
                <label className="block"><span className="mb-2 block text-[10px] font-bold uppercase tracking-[0.14em] text-[#071b0e]/60">Work email</span><input value={email} onChange={(event) => setEmail(event.target.value)} type="email" placeholder="you@company.com" className="w-full border-b-2 border-[#071b0e]/40 bg-transparent px-0 py-3 text-xl tracking-[-0.03em] text-[#071b0e] outline-none placeholder:text-[#071b0e]/35 focus:border-[#071b0e]" /></label>
                <label className="block"><span className="mb-2 block text-[10px] font-bold uppercase tracking-[0.14em] text-[#071b0e]/60">I’m joining as</span><select value={profile} onChange={(event) => setProfile(event.target.value)} className="w-full appearance-none border-b-2 border-[#071b0e]/40 bg-transparent px-0 py-3 text-[15px] text-[#071b0e] outline-none focus:border-[#071b0e]">{profiles.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
                <div className="flex flex-col gap-4 pt-3 sm:flex-row sm:items-center"><button disabled={status === "loading"} className="inline-flex w-fit items-center gap-3 rounded-full bg-[#071b0e] px-5 py-3 text-[11px] font-bold uppercase tracking-[0.14em] text-[#73f59a] transition-transform hover:-translate-y-0.5 disabled:cursor-wait disabled:opacity-60" type="submit">{status === "loading" ? "Sending…" : "Request access"}<Icon name="arrow" size={16} /></button>{message && <p role="status" className={`text-[12px] ${status === "error" ? "text-red-800" : "text-[#071b0e]/65"}`}>{status === "success" && <span className="mr-1 inline-block align-[-3px]"><Icon name="check" size={14} /></span>}{message}</p>}</div>
              </form>
              <p className="mt-8 text-[10px] uppercase tracking-[0.13em] text-[#071b0e]/52">No token sale. No deck spam. Just the first working group.</p>
            </div>
          </div>
        </section>

        <footer className="flex flex-col gap-4 border-t border-white/10 px-5 py-6 text-[10px] uppercase tracking-[0.15em] text-white/35 sm:flex-row sm:items-center sm:justify-between sm:px-8 lg:px-11">
          <p>© 2026 Certifera / Verification infrastructure</p>
          <div className="flex flex-wrap gap-5"><a className="hover:text-[#73f59a]" href="/docs">Docs</a><a className="hover:text-[#73f59a]" href="https://x.com/certifera" target="_blank" rel="noreferrer">X ↗</a><a className="hover:text-[#73f59a]" href="https://github.com/certifera/certifera" target="_blank" rel="noreferrer">GitHub ↗</a><a className="hover:text-[#73f59a]" href="#access">Join circle</a></div>
        </footer>
      </section>
    </main>
  );
}
