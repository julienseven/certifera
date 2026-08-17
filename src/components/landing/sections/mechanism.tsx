import { Icon } from "@/components/marketing/icon";
import { mechanism } from "@/content/landing";
import { Reveal } from "@/components/marketing/reveal";

export function Mechanism() {
  return (
    <section id="mechanism" className="grid scroll-mt-[76px] sm:scroll-mt-[88px] border-b border-line lg:grid-cols-[300px_minmax(0,1fr)]">
      <div className="border-b border-line px-5 py-8 sm:px-8 lg:border-b-0 lg:border-r lg:px-11 lg:py-10">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-mint">{mechanism.eyebrow}</p>
        <p className="mt-3 max-w-[180px] text-[13px] leading-relaxed text-white/48">{mechanism.kicker}</p>
      </div>

      <div className="p-5 sm:p-8 lg:p-10">
        <Reveal as="p" className="max-w-4xl text-balance text-[clamp(1.65rem,4.1vw,4.45rem)] font-medium leading-[0.98] tracking-[-0.065em] text-white/90">
          {mechanism.statement[0]} <span className="text-mint">{mechanism.statement[1]}</span>
        </Reveal>

        <div className="mt-12 grid gap-px overflow-hidden rounded-sm border border-line bg-white/10 md:grid-cols-3">
          {mechanism.steps.map(([number, title, copy, icon], index) => (
            <Reveal key={number} delay={index * 90} className="h-full">
              {/* Glow only, no tilt: these three are hairline-joined tiles inside one
                  clipped grid, and a tilted corner would be cut off by it. */}
              <article data-glow className="card group/card flex h-full min-h-[250px] flex-col bg-panel p-5 sm:p-6">
                <div className="flex items-start justify-between">
                  <span className="font-mono text-[11px] text-mint">{number}</span>
                  <span className="ease-out-expo text-mint transition-transform duration-500 group-hover/card:scale-110">
                    <Icon name={icon} size={20} />
                  </span>
                </div>
                <h2 className="mt-12 text-2xl font-medium tracking-[-0.05em]">{title}</h2>
                <p className="mt-3 max-w-xs text-[13px] leading-relaxed text-white/50">{copy}</p>
              </article>
            </Reveal>
          ))}
        </div>

        <div className="mt-6 border-t border-line pt-6">
          <p className="max-w-3xl text-[12px] leading-relaxed text-white/50">
            <strong className="font-medium text-white">The SLA is arithmetic, not a promise.</strong> {mechanism.sla}
          </p>
        </div>
      </div>
    </section>
  );
}
