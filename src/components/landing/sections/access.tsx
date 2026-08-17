import { access } from "@/content/landing";
import { Reveal } from "@/components/marketing/reveal";
import { WaitlistForm } from "../waitlist-form";

export function Access() {
  return (
    <section
      id="access"
      className="scroll-mt-[76px] sm:scroll-mt-[88px] border-t border-line bg-mint px-5 py-14 text-mint-ink shadow-[0_-30px_120px_-40px_rgba(115,245,154,0.35)] sm:px-8 lg:px-11 lg:py-20"
    >
      <div className="grid gap-10 lg:grid-cols-[1fr_1fr] lg:gap-16">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-mint-ink/60">{access.eyebrow}</p>
          <Reveal as="h2" className="mt-5 max-w-xl text-balance text-[clamp(2.4rem,6vw,6.1rem)] font-medium leading-[0.86] tracking-[-0.085em]">
            {access.heading}
          </Reveal>
          <p className="mt-8 max-w-md text-[14px] leading-relaxed text-mint-ink/70">{access.standfirst}</p>
        </div>
        <Reveal variant="up" delay={120} className="self-end">
          <WaitlistForm />
          <p className="mt-8 text-[10px] uppercase tracking-[0.13em] text-mint-ink/52">{access.footnote}</p>
        </Reveal>
      </div>
    </section>
  );
}
