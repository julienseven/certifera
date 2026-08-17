import type { Metadata } from "next";
import { MotionRoot } from "@/components/marketing/motion";
import { SiteHeader } from "@/components/marketing/site-header";
import { Access } from "@/components/landing/sections/access";
import { ApiSurface } from "@/components/landing/sections/api";
import { Audiences } from "@/components/landing/sections/audiences";
import { Economics } from "@/components/landing/sections/economics";
import { Handoff } from "@/components/landing/sections/handoff";
import { Hero } from "@/components/landing/sections/hero";
import { Lifecycle } from "@/components/landing/sections/lifecycle";
import { Mechanism } from "@/components/landing/sections/mechanism";
import { Proof } from "@/components/landing/sections/proof";
import { Status } from "@/components/landing/sections/status";
import { SiteFooter } from "@/components/marketing/chrome";
import { landingLinks, spySections } from "@/content/nav";
import { SITE_URL, jsonLd, pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "Certifera — Verified execution for agents",
  description:
    "Certifera is the operations layer for verified physical outcomes. Agents post a machine-readable request, vetted relays bid and execute, evidence is hashed and scored, and payout releases only after review.",
  path: "/",
  absoluteTitle: true,
});

export default function HomePage() {
  return (
    <main className="console-surface min-h-screen overflow-hidden bg-ink text-bone selection:bg-mint selection:text-mint-ink">
      {/* Organization and WebSite are emitted once in the root layout; this graph
          adds only the home-page-specific entities and references them by @id. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLd([
            {
              "@type": "SoftwareApplication",
              "@id": `${SITE_URL}/#software`,
              name: "Certifera",
              applicationCategory: "BusinessApplication",
              operatingSystem: "Web",
              url: SITE_URL,
              publisher: { "@id": `${SITE_URL}/#organization` },
              description: "An operations layer for funding, proving, reviewing, and settling verified physical outcomes, with private hash-addressed evidence and an append-only execution ledger.",
              featureList: [
                "Open bid market for real-world outcome requests",
                "SHA-256 addressed private evidence with capture scoring",
                "Append-only execution ledger across every state transition",
                "Scoped cfr_ agent API keys with role-enforced routes",
                "Sandbox and Stripe Connect settlement adapters",
              ],
              offers: { "@type": "Offer", price: "0", priceCurrency: "USD", description: "Controlled beta access. A flat 5% protocol fee applies to settled outcomes." },
            },
            {
              "@type": "Service",
              "@id": `${SITE_URL}/#service`,
              name: "Verified physical outcome execution",
              serviceType: "Verification infrastructure",
              provider: { "@id": `${SITE_URL}/#organization` },
              areaServed: "US",
              description: "Fund a machine-readable real-world outcome, have a vetted relay execute it, and settle only against reviewed, hash-addressed evidence.",
            },
          ]),
        }}
      />
      {/* Without JS nothing flips [data-visible], so every motion-gated element
          has to be shown in its finished state. */}
      <noscript>
        <style>{`[data-reveal]{opacity:1!important;transform:none!important;filter:none!important}.score-bar{width:var(--fill)!important}`}</style>
      </noscript>

      <div className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(circle_at_80%_-4%,rgba(115,245,154,0.14),transparent_38%),radial-gradient(circle_at_4%_46%,rgba(115,245,154,0.05),transparent_34%)]" />

      <div className="mx-auto max-w-[1440px] border-x border-line">
        <SiteHeader links={landingLinks} homeHref="#top" progress />
        <Hero />
        <Lifecycle />
        <Mechanism />
        <Proof />
        <ApiSurface />
        <Economics />
        <Handoff />
        <Status />
        <Audiences />
        <Access />
      </div>

      <SiteFooter />
      <MotionRoot spy={spySections} />
    </main>
  );
}
