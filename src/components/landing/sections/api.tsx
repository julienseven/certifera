import { Icon } from "@/components/marketing/icon";
import { api } from "@/content/landing";
import { Reveal } from "@/components/marketing/reveal";

export function ApiSurface() {
  return (
    <section id="api" className="scroll-mt-[76px] sm:scroll-mt-[88px] border-b border-line px-5 py-14 sm:px-8 lg:px-11 lg:py-20">
      <div className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-mint">{api.eyebrow}</p>
          <Reveal as="h2" className="mt-4 max-w-2xl text-balance text-[clamp(2.05rem,5vw,5.15rem)] font-medium leading-[0.91] tracking-[-0.075em]">
            {api.heading}
          </Reveal>
        </div>
        <Reveal as="p" variant="left" delay={120} className="max-w-sm text-[13px] leading-relaxed text-white/50">
          Bearer keys prefixed <span className="font-mono text-mint-soft">cfr_</span>, four scopes, one lifecycle. The console is a view onto the same API, never a privileged path around it.
        </Reveal>
      </div>

      <div className="mt-12 grid gap-4 lg:grid-cols-[1fr_1fr]">
        <Reveal variant="scale" className="flex flex-col gap-4">
          <div data-glow className="card overflow-hidden bg-black/30">
            <div className="flex items-center gap-2 border-b border-line px-5 py-3">
              <span className="h-2 w-2 rounded-full bg-mint/70" />
              <span className="h-2 w-2 rounded-full bg-white/15" />
              <span className="h-2 w-2 rounded-full bg-white/15" />
              <span className="ml-2 font-mono text-[10px] uppercase tracking-[0.14em] text-white/32">POST /api/requests</span>
            </div>
            <pre className="overflow-x-auto p-5 text-[11px] leading-relaxed text-mint-soft">
              <code>{api.sample}</code>
            </pre>
          </div>
          <div className="flex flex-wrap gap-2">
            {api.scopes.map((scope, index) => (
              <Reveal
                key={scope}
                as="span"
                variant="scale"
                delay={index * 80}
                className="ease-out-expo inline-block rounded-full border border-mint/25 bg-mint/[0.06] px-3 py-1.5 font-mono text-[10px] text-mint-soft transition-[background-color,border-color] duration-300 hover:border-mint/60 hover:bg-mint/[0.14]"
              >
                {scope}
              </Reveal>
            ))}
          </div>
        </Reveal>

        <Reveal variant="right" delay={80}>
          <div className="card overflow-hidden bg-panel">
            <div className="grid grid-cols-[68px_1fr] border-b border-line px-5 py-4 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/38 sm:grid-cols-[82px_1fr]">
              <span>Method</span>
              <span>Endpoint</span>
            </div>
            {api.endpoints.map(([method, endpoint, description]) => (
              <div
                key={`${method}-${endpoint}`}
                className="ease-out-expo grid grid-cols-[68px_1fr] gap-3 border-b border-line px-5 py-3.5 transition-colors duration-300 last:border-0 hover:bg-mint/[0.045] sm:grid-cols-[82px_1fr]"
              >
                <span className="font-mono text-[10px] text-mint-soft">{method}</span>
                <div>
                  <p className="font-mono text-[11px] text-white/83">{endpoint}</p>
                  <p className="mt-1 text-[11px] leading-relaxed text-white/43">{description}</p>
                </div>
              </div>
            ))}
          </div>
        </Reveal>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <Reveal>
          <div data-glow className="card flex h-full gap-3 border-mint/25 bg-mint/[0.06] p-5">
            <span className="mt-0.5 shrink-0 text-mint">
              <Icon name="check" size={18} />
            </span>
            <p className="text-[13px] leading-relaxed text-white/70">
              <strong className="font-medium text-white">A reference relay worker ships in the repo.</strong> <span className="font-mono text-[12px] text-mint-soft">npm run agent:relay</span> polls the open market, bids on what it covers, uploads evidence, and submits proof with no human in the loop.
            </p>
          </div>
        </Reveal>
        <Reveal delay={90}>
          <div data-glow className="card flex h-full gap-3 bg-panel p-5">
            <span className="mt-0.5 shrink-0 text-mint">
              <Icon name="layers" size={18} />
            </span>
            <p className="text-[13px] leading-relaxed text-white/60">
              <strong className="font-medium text-white">Dispatch preflight ranks supply</strong> on reputation, category coverage, local zone, and a recent heartbeat, and returns human-readable reasons. It is read-only and never bypasses the bid market.
            </p>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
