import type { Metadata } from "next";
import Link from "next/link";
import { DocsSidebar } from "@/components/docs/sidebar";
import { ProseBlock } from "@/components/docs/prose";
import { SiteFooter } from "@/components/marketing/chrome";
import { Icon } from "@/components/marketing/icon";
import { MotionRoot } from "@/components/marketing/motion";
import { SiteHeader } from "@/components/marketing/site-header";
import { docGroups, docSectionIds, docSections, docsMeta } from "@/content/docs";
import { siteLinks } from "@/content/nav";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "API documentation — outcomes, evidence, and settlement",
  description:
    "Developer and operator documentation for Certifera: the outcome lifecycle, scoped cfr_ API key authentication, private evidence upload, proof bundles, rate limits, and the settlement release path.",
  path: "/docs",
  keywords: ["Certifera API", "outcome lifecycle API", "evidence upload API", "proof bundle", "agent API keys", "REST verification API"],
});

export default function DocsPage() {
  return (
    <div className="console-surface min-h-screen bg-ink text-bone selection:bg-mint selection:text-mint-ink">
      <SiteHeader links={siteLinks} active="/docs" progress />

      <div className="mx-auto grid max-w-[1440px] border-x border-line lg:grid-cols-[264px_minmax(0,1fr)]">
        <DocsSidebar />

        <main className="min-w-0">
          <header className="border-b border-line px-5 py-12 sm:px-10 lg:py-16">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-mint">{docsMeta.eyebrow}</p>
            <h1 className="mt-4 max-w-3xl text-balance text-[clamp(2.2rem,4.6vw,3.9rem)] font-medium leading-[0.92] tracking-[-0.07em]">
              {docsMeta.title}
              <span className="text-mint">.</span>
            </h1>
            <p className="mt-6 max-w-2xl text-[15px] leading-[1.7] text-white/58">{docsMeta.standfirst}</p>
          </header>

          <div className="px-5 pb-16 sm:px-10">
            {docGroups.map((group) => (
              <section key={group.title} aria-label={group.title}>
                {group.sections.map((section) => (
                  <article key={section.id} id={section.id} className="scroll-mt-[84px] border-b border-line py-12 last:border-0">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/32">{group.title}</p>
                    {/* The heading is the anchor target and its own permalink. */}
                    <h2 className="group/heading mt-3 flex items-baseline gap-2 text-[clamp(1.6rem,2.6vw,2.1rem)] font-medium tracking-[-0.05em] text-bone">
                      {section.title}
                      <a
                        href={`#${section.id}`}
                        aria-label={`Link to ${section.title}`}
                        className="text-mint opacity-0 transition-opacity duration-200 group-hover/heading:opacity-100 focus-visible:opacity-100"
                      >
                        <span aria-hidden className="text-[0.6em]">#</span>
                      </a>
                    </h2>
                    <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-white/42">{section.summary}</p>

                    <div className="max-w-[74ch]">
                      {section.blocks.map((block, index) => (
                        <ProseBlock key={index} block={block} />
                      ))}
                    </div>
                  </article>
                ))}
              </section>
            ))}

            <div className="mt-12 flex flex-col gap-4 rounded-sm border border-mint/25 bg-mint/[0.06] p-6 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-mint">Controlled beta</p>
                <p className="mt-2 max-w-md text-[13px] leading-relaxed text-white/65">
                  Bring one outcome you cannot currently verify. Design partners get an API key, a console seat, and a direct escalation path.
                </p>
              </div>
              <Link
                href="/#access"
                className="cta-primary inline-flex w-fit shrink-0 items-center gap-3 rounded-full bg-mint px-5 py-3 text-[11px] font-bold uppercase tracking-[0.14em] text-mint-ink"
              >
                Request access <Icon name="arrow" size={16} />
              </Link>
            </div>

            <p className="mt-8 text-[11px] uppercase tracking-[0.14em] text-white/28">
              {docSections.length} sections · last reviewed against the shipping API
            </p>
          </div>
        </main>
      </div>

      <SiteFooter />
      <MotionRoot spy={docSectionIds} />
    </div>
  );
}
