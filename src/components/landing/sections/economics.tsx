import Link from "next/link";
import { economics } from "@/content/landing";
import { ScrambleText } from "@/components/marketing/motion";
import { Reveal } from "@/components/marketing/reveal";

export function Economics() {
  return (
    <section id="economics" className="scroll-mt-[76px] sm:scroll-mt-[88px] border-b border-line bg-moss px-5 py-14 sm:px-8 lg:px-11 lg:py-20">
      <div className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-mint">{economics.eyebrow}</p>
          <Reveal as="h2" className="mt-4 max-w-2xl text-balance text-[clamp(2.05rem,5vw,5.15rem)] font-medium leading-[0.91] tracking-[-0.075em]">
            {economics.heading}
          </Reveal>
        </div>
        <Reveal as="p" variant="left" delay={120} className="max-w-sm text-[13px] leading-relaxed text-white/50">
          {economics.standfirst}
        </Reveal>
      </div>

      <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {economics.figures.map(([figure, label, copy], index) => (
          <Reveal key={label} delay={index * 90} className="h-full">
            <article data-tilt data-glow className="card h-full bg-panel p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
              {/* The figure settles out of noise on entry — one motion, then still. */}
              <p className="font-mono text-[clamp(2rem,3.4vw,2.9rem)] font-medium leading-none tracking-[-0.05em] text-mint">
                <ScrambleText text={figure} />
              </p>
              <h3 className="mt-6 text-[10px] font-semibold uppercase tracking-[0.15em] text-white/45">{label}</h3>
              <p className="mt-2 text-[12px] leading-relaxed text-white/60">{copy}</p>
            </article>
          </Reveal>
        ))}
      </div>

      <p className="mt-8 max-w-3xl text-[13px] leading-relaxed text-white/55">
        Settlement runs in sandbox by default and emits a non-financial <span className="font-mono text-[12px] text-mint-soft">cert-sandbox-…</span> reference so the whole lifecycle can be exercised without moving money. Stripe Connect transfers are wired behind a per-payout idempotency key and stay gated on compliance review.
      </p>

      <p className="mt-6 border-t border-line pt-6 text-[12px] leading-relaxed text-white/45">
        <strong className="font-medium text-white/70">Roadmap.</strong> There is no token today — no wallet, chain, staking, or governance code ships in Certifera. A <span className="font-mono">$CERT</span> utility layer is a post-PMF decision, gated on observable task fees, repeat buyers, and real security demand.{" "}
        <Link href="/launch" className="link-underline text-mint-soft">
          See launch readiness →
        </Link>
      </p>
    </section>
  );
}
