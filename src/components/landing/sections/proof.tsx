import type { CSSProperties } from "react";
import { Icon } from "@/components/marketing/icon";
import { proof } from "@/content/landing";
import { Reveal } from "@/components/marketing/reveal";

const MAX_SCORE = 100;

export function Proof() {
  return (
    <section id="proof" className="scroll-mt-[76px] sm:scroll-mt-[88px] border-b border-line px-5 py-14 sm:px-8 lg:px-11 lg:py-20">
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

      <div className="mt-12 grid gap-4 lg:grid-cols-[1.05fr_1fr]">
        <Reveal variant="scale">
          <div data-glow className="card h-full bg-panel p-5 sm:p-7">
            <div className="flex items-center justify-between border-b border-line pb-4">
              <span className="text-[10px] font-bold uppercase tracking-[0.17em] text-white/45">Capture score</span>
              <span className="font-mono text-[11px] text-mint">EVIDENCE / INTELLIGENCE</span>
            </div>

            {/* Each row draws its own contribution to the 100-point ceiling; the bars
                grow with the reveal, so the score assembles as you read it. */}
            <dl className="mt-6 font-mono text-[12px]">
              {proof.score.map(([label, value], index) => (
                <div key={label} className="py-2">
                  <div className="flex items-baseline justify-between gap-4">
                    <dt className="text-white/55">{label}</dt>
                    <dd className="tabular-nums text-white/80">{value}</dd>
                  </div>
                  <div className="mt-2 h-px w-full bg-white/8">
                    <span
                      className="score-bar block h-px bg-mint/70"
                      style={{ "--fill": `${(Number(value.replace("+", "")) / MAX_SCORE) * 100}%`, "--reveal-delay": `${180 + index * 110}ms` } as CSSProperties}
                    />
                  </div>
                </div>
              ))}
              <div className="mt-2 flex items-baseline justify-between gap-4 border-t border-line pt-3">
                <dt className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/45">Maximum</dt>
                <dd className="tabular-nums text-mint">{MAX_SCORE}</dd>
              </div>
            </dl>

            <div className="mt-6 border-t border-line pt-5">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/38">Flags emitted</p>
              {/* A positive flag and a gap are different claims, so they do not
                  look alike: one is what the file proved, the rest are what it could not. */}
              <div className="mt-3 flex flex-wrap gap-2">
                {proof.flags.map(([flag, kind], index) => (
                  <Reveal
                    key={flag}
                    variant="scale"
                    delay={index * 70}
                    as="span"
                    className={`ease-out-expo inline-block max-w-full break-words rounded-full border px-2.5 py-1 font-mono text-[10px] transition-colors duration-300 ${
                      kind === "positive" ? "border-mint/35 bg-mint/[0.07] text-mint-soft" : "border-line text-white/50 hover:border-mint/40 hover:text-mint-soft"
                    }`}
                  >
                    {flag}
                  </Reveal>
                ))}
              </div>
              <p className="mt-5 text-[12px] leading-relaxed text-mint-soft">Missing signal becomes a named flag, not an inferred truth.</p>
            </div>
          </div>
        </Reveal>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
          {proof.rules.map(([title, copy], index) => (
            <Reveal key={title} delay={index * 90} variant="right" className="h-full">
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
      </div>

      {/* What the agent actually receives — the same fields the review route returns. */}
      <div className="mt-4 grid gap-4 lg:grid-cols-[1.05fr_1fr]">
        <Reveal variant="up">
          <div data-glow className="card overflow-hidden bg-black/30">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-5 py-3">
              <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-white/32">GET /api/requests/:id/proof</span>
              <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-mint">200 OK</span>
            </div>
            <pre className="overflow-x-auto p-5 text-[11px] leading-relaxed text-mint-soft">
              <code>{proof.bundle}</code>
            </pre>
          </div>
        </Reveal>
        <Reveal variant="right" delay={90} className="flex flex-col justify-center gap-4">
          <p className="text-[13px] leading-relaxed text-white/60">
            <strong className="font-medium text-white">The bundle is the product.</strong> An agent never has to trust a screenshot: it reads a digest it can recompute, a score it can threshold on, and a flag list that spells out the gaps — here, a photo with an intact signature and no GPS, scoring 85 rather than 100.
          </p>
          <p className="text-[12px] leading-relaxed text-white/45">{proof.footnote}</p>
        </Reveal>
      </div>
    </section>
  );
}
