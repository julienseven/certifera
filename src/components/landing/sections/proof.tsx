import { Icon } from "@/components/marketing/icon";
import { Reveal } from "@/components/marketing/reveal";
import { proof } from "@/content/landing";
import { EvidenceScan } from "../evidence-scan";

export function Proof() {
  return (
    <section id="proof" className="scroll-mt-[76px] border-b border-line px-5 py-14 sm:scroll-mt-[88px] sm:px-8 lg:px-11 lg:py-20">
      <div className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-mint">{proof.eyebrow}</p>
          <Reveal as="h2" className="mt-4 max-w-2xl text-balance text-[clamp(2.05rem,5vw,5.15rem)] font-medium leading-[0.91] tracking-[-0.075em]">
            {proof.heading}
          </Reveal>
        </div>
        <Reveal as="p" variant="left" delay={120} className="max-w-sm text-[13px] leading-relaxed text-white/50">
          {proof.standfirst}
        </Reveal>
      </div>

      {/* The scorer, run over two real photographs rather than described in prose. */}
      <Reveal as="p" className="mt-10 max-w-3xl text-[14px] leading-relaxed text-white/55">
        {proof.captureIntro}
      </Reveal>
      <Reveal variant="scale" className="mt-5">
        <EvidenceScan />
      </Reveal>

      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {proof.rules.map(([title, copy], index) => (
          <Reveal key={title} delay={index * 80} className="h-full">
            <article data-glow className="card lift group/card h-full bg-panel p-5">
              <div className="flex items-center justify-between gap-4">
                <h3 className="text-[15px] font-medium tracking-[-0.03em]">{title}</h3>
                <span className="ease-out-expo shrink-0 text-mint transition-transform duration-500 group-hover/card:translate-x-1">
                  <Icon name="pulse" size={17} />
                </span>
              </div>
              <p className="mt-3 text-[13px] leading-relaxed text-white/60">{copy}</p>
            </article>
          </Reveal>
        ))}
      </div>

      <Reveal className="mt-4 rounded-sm border border-line bg-panel p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/38">Every flag the scorer can emit</p>
            {/* A positive flag and a gap are different claims, so they do not look
                alike: one is what the file proved, the rest are what it could not. */}
            <div className="mt-3 flex flex-wrap gap-2">
              {proof.flags.map(([flag, kind]) => (
                <span
                  key={flag}
                  className={`ease-out-expo inline-block max-w-full break-words rounded-full border px-2.5 py-1 font-mono text-[10px] transition-colors duration-300 ${
                    kind === "positive" ? "border-mint/35 bg-mint/[0.07] text-mint-soft" : "border-line text-white/50 hover:border-mint/40 hover:text-mint-soft"
                  }`}
                >
                  {flag}
                </span>
              ))}
            </div>
          </div>
          <p className="max-w-xs shrink-0 text-[12px] leading-relaxed text-mint-soft">Missing signal becomes a named flag, not an inferred truth.</p>
        </div>
      </Reveal>

      {/* What the agent actually receives — the same fields the review route returns. */}
      <div className="mt-4 grid gap-4 lg:grid-cols-[1.05fr_1fr]">
        <Reveal variant="up">
          <div data-glow className="card overflow-hidden bg-black/30">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-5 py-3">
              <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-white/32">GET /api/requests/:id/proof · bay A rack audit</span>
              <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-mint">200 OK</span>
            </div>
            <pre className="overflow-x-auto p-5 text-[11px] leading-relaxed text-mint-soft">
              <code>{proof.bundle}</code>
            </pre>
          </div>
        </Reveal>
        <Reveal variant="right" delay={90} className="flex flex-col justify-center gap-4">
          <p className="text-[13px] leading-relaxed text-white/60">
            <strong className="font-medium text-white">The bundle is the product.</strong> This is the same capture, serialised: an agent never has to trust the photograph. It reads a digest it can recompute, a score it can threshold on, and a flag list that spells out the gap the scan found in the rack audit.
          </p>
          <p className="text-[12px] leading-relaxed text-white/45">{proof.footnote}</p>
        </Reveal>
      </div>
    </section>
  );
}
