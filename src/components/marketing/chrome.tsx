import Link from "next/link";
import type { ReactNode } from "react";
import { siteLinks } from "@/content/nav";
import { jsonLd, breadcrumbSchema } from "@/lib/seo";
import { Icon } from "./icon";
import { MotionRoot } from "./motion";
import { SiteHeader } from "./site-header";

const footerGroups = [
  ["Product", [["/", "Overview"], ["/docs", "Docs"], ["/launch", "Launch readiness"], ["/glossary", "Glossary"]]],
  ["Who it's for", [["/for/agent-builders", "Agent builders"], ["/for/relays", "Field relays"], ["/#economics", "Economics"], ["/#status", "Honest status"]]],
  ["Trust", [["/security", "Security & evidence"], ["/faq", "FAQ"], ["/#proof", "Proof handling"], ["/#api", "API surface"]]],
] as const;

/** Content-page header: the shared one, wired to the route links. */
export function PageHeader({ active }: { active?: string }) {
  return <SiteHeader links={siteLinks} active={active} progress />;
}

export function SiteFooter() {
  return (
    <footer className="border-t border-line bg-panel">
      <div className="mx-auto max-w-[1440px] px-5 py-12 sm:px-8 lg:px-11">
        <div className="grid gap-10 md:grid-cols-[1.4fr_repeat(3,1fr)]">
          <div>
            <p className="text-[18px] font-medium tracking-[-0.05em]">certifera<span className="text-mint">/</span></p>
            <p className="mt-3 max-w-xs text-[13px] leading-relaxed text-white/50">
              Verified-execution infrastructure for the agent economy. Fund an outcome, prove it happened, settle only on reviewed evidence.
            </p>
            <Link href="/#access" className="mt-5 inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.14em] text-mint-soft transition-colors hover:text-mint">
              Request beta access <Icon name="arrow" size={13} />
            </Link>
          </div>
          {footerGroups.map(([heading, links]) => (
            <nav key={heading} aria-label={heading}>
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/38">{heading}</p>
              <ul className="mt-4 space-y-2.5">
                {links.map(([href, label]) => (
                  <li key={href}>
                    <Link href={href} className="text-[13px] text-white/58 transition-colors hover:text-mint">{label}</Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>
        <div className="mt-12 flex flex-col gap-4 border-t border-line pt-6 text-[10px] uppercase tracking-[0.15em] text-white/35 sm:flex-row sm:items-center sm:justify-between">
          <p>© 2026 Certifera / Verification infrastructure</p>
          <div className="flex flex-wrap gap-5">
            <a className="transition-colors hover:text-mint" href="https://x.com/certiferaxyz" target="_blank" rel="noreferrer">X ↗</a>
            <a className="transition-colors hover:text-mint" href="https://github.com/julienseven/certifera" target="_blank" rel="noreferrer">GitHub ↗</a>
          </div>
        </div>
      </div>
    </footer>
  );
}

/** Visible breadcrumb plus its BreadcrumbList schema — Google requires the on-page trail to match the markup. */
export function Breadcrumbs({ trail }: { trail: { name: string; path: string }[] }) {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(breadcrumbSchema([{ name: "Home", path: "/" }, ...trail])) }} />
      <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.15em] text-white/35">
        <Link href="/" className="transition-colors hover:text-mint">Home</Link>
        {trail.map((entry, index) => (
          <span key={entry.path} className="flex items-center gap-2">
            <span aria-hidden className="text-white/20">/</span>
            {index === trail.length - 1 ? <span className="text-mint-soft">{entry.name}</span> : <Link href={entry.path} className="transition-colors hover:text-mint">{entry.name}</Link>}
          </span>
        ))}
      </nav>
    </>
  );
}

export function PageShell({ children, active }: { children: ReactNode; active?: string }) {
  return (
    <div className="console-surface min-h-screen bg-ink text-bone selection:bg-mint selection:text-mint-ink">
      <div className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(circle_at_80%_-4%,rgba(115,245,154,0.14),transparent_38%),radial-gradient(circle_at_4%_46%,rgba(115,245,154,0.05),transparent_34%)]" />
      <PageHeader active={active} />
      <main className="mx-auto max-w-[1440px] border-x border-line">{children}</main>
      <SiteFooter />
      {/* Content pages get the same reading progress and reveal wiring as the landing page. */}
      <MotionRoot />
    </div>
  );
}

/** Consistent hero for every content page: eyebrow, H1, standfirst. */
export function PageHero({ eyebrow, title, standfirst, trail }: { eyebrow: string; title: ReactNode; standfirst: string; trail: { name: string; path: string }[] }) {
  return (
    <section className="border-b border-line px-5 py-14 sm:px-8 lg:px-11 lg:py-20">
      <Breadcrumbs trail={trail} />
      <p className="mt-8 text-[10px] font-semibold uppercase tracking-[0.18em] text-mint">{eyebrow}</p>
      <h1 className="mt-4 max-w-4xl text-balance text-[clamp(2.15rem,6vw,5.8rem)] font-medium leading-[0.9] tracking-[-0.08em] text-bone">{title}</h1>
      <p className="mt-7 max-w-2xl text-lg leading-relaxed tracking-[-0.02em] text-white/60">{standfirst}</p>
    </section>
  );
}

/** Bottom-of-page conversion block, repeated across content pages. */
export function CtaBand({ heading, body }: { heading: string; body: string }) {
  return (
    <section className="border-t border-line bg-mint px-5 py-14 text-mint-ink sm:px-8 lg:px-11 lg:py-16">
      <div className="flex flex-col justify-between gap-8 lg:flex-row lg:items-end">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-mint-ink/60">Controlled beta</p>
          <h2 className="mt-4 max-w-2xl text-balance text-[clamp(1.9rem,4.6vw,4rem)] font-medium leading-[0.92] tracking-[-0.075em]">{heading}</h2>
          <p className="mt-5 max-w-lg text-[14px] leading-relaxed text-mint-ink/70">{body}</p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-3">
          <Link href="/#access" className="ease-out-expo inline-flex items-center gap-3 rounded-full bg-mint-ink px-5 py-3 text-[11px] font-bold uppercase tracking-[0.14em] text-mint transition-transform duration-300 hover:-translate-y-0.5">
            Request access <Icon name="arrow" size={16} />
          </Link>
          <Link href="/docs" className="inline-flex items-center gap-2 rounded-full border border-mint-ink/30 px-5 py-3 text-[11px] font-bold uppercase tracking-[0.14em] text-mint-ink transition-colors hover:bg-mint-ink/10">
            Read the docs
          </Link>
        </div>
      </div>
    </section>
  );
}
