import Link from "next/link";
import type { CSSProperties } from "react";
import { Icon } from "@/components/marketing/icon";
import { status } from "@/content/landing";
import { Reveal } from "@/components/marketing/reveal";

const toneText = { mint: "text-mint", soft: "text-mint-soft/70", muted: "text-white/38" } as const;
const toneDot = { mint: "bg-mint", soft: "bg-mint-soft/50", muted: "bg-white/25" } as const;

export function Status() {
  return (
    <section id="status" className="scroll-mt-[76px] sm:scroll-mt-[88px] border-b border-line px-5 py-14 sm:px-8 lg:px-11 lg:py-20">
      <div className="flex flex-col justify-between gap-6 border-b border-line pb-9 md:flex-row md:items-end">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-mint">{status.eyebrow}</p>
          <Reveal as="h2" className="mt-4 max-w-3xl text-balance text-[clamp(2.15rem,5.4vw,5.6rem)] font-medium leading-[0.89] tracking-[-0.08em]">
            {status.heading}
          </Reveal>
        </div>
        <Reveal as="p" variant="left" delay={120} className="max-w-sm text-[13px] leading-relaxed text-white/50">
          {status.standfirst}
        </Reveal>
      </div>

      <div className="grid divide-y divide-line lg:grid-cols-3 lg:divide-x lg:divide-y-0">
        {status.columns.map(([title, tone, items], index) => (
          <Reveal key={title} delay={index * 110} className={`py-7 lg:py-9 ${index === 0 ? "lg:pr-7" : index === 1 ? "lg:px-7" : "lg:pl-7"}`}>
            <p className={`text-[10px] font-semibold uppercase tracking-[0.16em] ${toneText[tone]}`}>{title}</p>
            <ul className="mt-6 space-y-3">
              {items.map((item, itemIndex) => (
                // Each line steps in behind its column, so a long list reads as a
                // list being checked off rather than a wall arriving at once.
                <li
                  key={item}
                  data-reveal="up"
                  style={{ "--reveal-delay": `${index * 110 + itemIndex * 60}ms` } as CSSProperties}
                  className="flex gap-3 text-[13px] leading-relaxed text-white/60"
                >
                  <span className={`mt-2 h-1 w-1 shrink-0 rounded-full ${toneDot[tone]}`} />
                  {item}
                </li>
              ))}
            </ul>
          </Reveal>
        ))}
      </div>

      <div className="mt-10 flex flex-col gap-5 border-t border-line pt-8 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-x-8 gap-y-3">
          {status.gates.map(([figure, label]) => (
            <p key={label} className="text-[12px] text-white/45">
              <span className="font-mono text-[13px] text-mint-soft">{figure}</span> {label}
            </p>
          ))}
        </div>
        <Link href="/launch" className="group shrink-0 text-[10px] font-bold uppercase tracking-[0.14em] text-mint-soft transition-colors hover:text-white">
          Full go / no-go gates
          <span className="ease-out-expo ml-1 inline-block align-[-4px] transition-transform duration-300 group-hover:translate-x-1">
            <Icon name="arrow" size={15} />
          </span>
        </Link>
      </div>
    </section>
  );
}
