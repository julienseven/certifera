import Link from "next/link";
import { Icon } from "@/components/marketing/icon";
import { LatticeArtwork } from "@/components/three/lattice-artwork";
import { hero } from "@/content/landing";
import { Magnetic } from "@/components/marketing/motion";

const [primaryHref, primaryLabel] = hero.primaryCta;
const [secondaryHref, secondaryLabel] = hero.secondaryCta;
const [emphasisBefore, emphasisAfter] = hero.standfirst.split(hero.emphasis);

export function Hero() {
  return (
    <div id="top" className="relative grid scroll-mt-[76px] sm:scroll-mt-[88px] overflow-hidden border-b border-line lg:grid-cols-[minmax(0,1fr)_300px]">
      {/* Phones get a short, top-anchored band: stretching the artwork down the
          full stacked hero would hand it a tall, narrow box to frame a sphere in. */}
      <LatticeArtwork className="pointer-events-none absolute right-0 top-0 z-0 h-[440px] w-full opacity-75 [mask-image:radial-gradient(ellipse_at_64%_50%,#000_26%,transparent_74%)] sm:inset-y-0 sm:h-auto sm:w-[min(64%,780px)] sm:opacity-100 lg:right-[300px]" />

      <div className="relative z-10 px-5 pb-14 pt-16 sm:px-8 sm:pb-20 sm:pt-24 lg:px-11 lg:pb-24 lg:pt-28">
        <div className="animate-rise mb-8 flex w-fit items-center gap-2.5 rounded-full border border-mint/20 bg-mint/[0.06] py-1.5 pl-3 pr-4 text-[9px] font-semibold uppercase tracking-[0.16em] text-mint-soft sm:mb-9 sm:gap-3 sm:text-[10px] sm:tracking-[0.18em]">
          <span className="animate-mint-pulse h-2 w-2 shrink-0 rounded-full bg-mint" />
          {hero.badge}
        </div>

        <h1 className="animate-rise max-w-[930px] text-balance text-[clamp(2.6rem,8.6vw,8.3rem)] font-medium leading-[0.86] tracking-[-0.085em] text-bone [animation-delay:80ms]">
          {hero.headline[0]}
          <br />
          <span className="text-sweep text-mint">{hero.headline[1]}</span>
        </h1>

        <p className="animate-rise mt-9 max-w-xl text-lg leading-relaxed tracking-[-0.025em] text-white/65 [animation-delay:160ms] sm:text-xl">
          {emphasisBefore}
          <span className="text-white">{hero.emphasis}</span>
          {emphasisAfter}
        </p>

        <div className="animate-rise mt-11 flex flex-col gap-4 [animation-delay:240ms] sm:flex-row sm:items-center">
          <Magnetic className="w-fit">
            <a href={primaryHref} className="cta-primary group inline-flex w-fit items-center gap-4 rounded-full bg-mint px-5 py-3 text-[11px] font-bold uppercase tracking-[0.14em] text-mint-ink">
              {primaryLabel}
              <span className="ease-out-expo transition-transform duration-300 group-hover:translate-x-1">
                <Icon name="arrow" size={17} />
              </span>
            </a>
          </Magnetic>
          <Link href={secondaryHref} className="group inline-flex w-fit items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/55 transition-colors hover:text-mint">
            {secondaryLabel}
            <span className="ease-out-expo transition-transform duration-300 group-hover:translate-x-1">
              <Icon name="arrow" size={14} />
            </span>
          </Link>
        </div>

        {/* The terms of the deal, above the fold: every one of these is restated
            with its mechanism further down the page. */}
        <dl className="animate-rise mt-12 grid max-w-xl grid-cols-2 gap-px overflow-hidden rounded-sm border border-line bg-white/10 [animation-delay:320ms] sm:grid-cols-4">
          {hero.spec.map(([figure, label]) => (
            <div key={label} className="bg-ink/70 px-3 py-3.5 backdrop-blur-sm sm:px-4">
              <dt className="font-mono text-[15px] leading-none text-mint sm:text-[17px]">{figure}</dt>
              <dd className="mt-1.5 text-[10px] uppercase tracking-[0.13em] text-white/40">{label}</dd>
            </div>
          ))}
        </dl>
      </div>

      <aside className="relative z-10 flex flex-col justify-between border-t border-line bg-panel p-6 sm:p-8 lg:border-l lg:border-t-0 lg:p-8">
        <div>
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/40">{hero.aside.label}</span>
            <span className="font-mono text-[11px] text-mint">{hero.aside.version}</span>
          </div>
          <div className="mt-12 font-mono text-[11px] leading-relaxed text-white/38">
            {hero.aside.stack.map((line) => (
              <p key={line}>{line}</p>
            ))}
            <p className="mt-3 text-mint-soft">{hero.aside.stackHighlight}</p>
          </div>
        </div>
        <div className="mt-10 border-t border-line pt-5 lg:mt-16">
          <p className="text-[13px] leading-relaxed text-white/75">{hero.aside.thesis}</p>
          <p className="mt-4 text-[10px] uppercase tracking-[0.17em] text-white/35">{hero.aside.thesisLabel}</p>
        </div>
      </aside>
    </div>
  );
}
