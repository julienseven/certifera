import Link from "next/link";
import { Icon } from "@/components/marketing/icon";
import { audiences } from "@/content/landing";
import { Reveal } from "@/components/marketing/reveal";

export function Audiences() {
  return (
    <section className="border-b border-line px-5 py-14 sm:px-8 lg:px-11 lg:py-20">
      <div className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-mint">{audiences.eyebrow}</p>
          <Reveal as="h2" className="mt-4 max-w-2xl text-balance text-[clamp(2.05rem,5vw,5.15rem)] font-medium leading-[0.91] tracking-[-0.075em]">
            {audiences.heading}
          </Reveal>
        </div>
        <Reveal as="p" variant="left" delay={120} className="max-w-sm text-[13px] leading-relaxed text-white/50">
          {audiences.standfirst}
        </Reveal>
      </div>

      <div className="mt-12 grid gap-4 lg:grid-cols-2">
        {audiences.cards.map(([href, eyebrow, title, copy, points], index) => (
          <Reveal key={href} delay={index * 110} variant={index === 0 ? "left" : "right"} className="h-full">
            <Link href={href} data-tilt data-glow className="card group/card flex h-full flex-col justify-between bg-panel p-6 sm:p-8">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-mint">{eyebrow}</p>
                <h3 className="mt-4 text-balance text-[clamp(1.5rem,3vw,2.4rem)] font-medium leading-[1.02] tracking-[-0.055em]">{title}</h3>
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
                <span className="ease-out-expo transition-transform duration-300 group-hover/card:translate-x-1">
                  <Icon name="arrow" size={14} />
                </span>
              </span>
            </Link>
          </Reveal>
        ))}
      </div>

      <div className="mt-6 flex flex-wrap gap-x-6 gap-y-3 border-t border-line pt-6 text-[12px] text-white/45">
        <span className="text-[10px] font-semibold uppercase tracking-[0.15em] text-white/32">Also worth reading</span>
        {audiences.furtherReading.map(([href, label]) => (
          <Link key={href} href={href} className="link-underline transition-colors hover:text-mint">
            {label}
          </Link>
        ))}
      </div>
    </section>
  );
}
