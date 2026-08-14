import type { Metadata } from "next";
import Link from "next/link";
import { CtaBand, PageHero, PageShell } from "@/components/marketing/chrome";
import { faqSchema, jsonLd, pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "Get paid to verify real-world outcomes",
  description:
    "Certifera relays bid on nearby verification jobs, capture evidence from a phone, and get paid after review. Transparent 5% protocol fee, reputation you own, and an SLA defined by arithmetic instead of a rating whim.",
  path: "/for/relays",
  keywords: [
    "get paid to verify",
    "field verification work",
    "proof of delivery gig",
    "on-demand inspection work",
    "relay network operator",
    "site verification jobs",
  ],
});

const earnings = [
  ["5%", "Protocol fee", "Flat 500 basis points on the gross quote. You keep 95% of what you bid. No lead fees, no subscription, no bidding credits."],
  ["You set the price", "Open bid market", "You quote the price and the ETA. Operators pick on price, reputation, coverage, and recency — not on a hidden ranking."],
  ["+8 / −12", "Reputation", "A verified outcome adds 8. A disputed one costs 12. A missed execution deadline costs a further 6. Every change is written to a ledger you can read."],
  ["6 h", "Review window", "The clock on the buyer is as real as the clock on you. Past six hours from proof submission, the breach is recorded against them, not you."],
] as const;

const flow = [
  ["Match", "See only outcomes inside your approved categories and coverage zones. Dispatch preflight ranks supply on reputation, coverage, zone, and a recent heartbeat, and shows the reasons in plain language."],
  ["Quote", "Post a price and an ETA you can actually hit. The execution deadline is your quoted ETA plus max(15 minutes, 20% of it) — generous, fixed, and known before you bid."],
  ["Capture", "Upload JPG, PNG, WEBP, or PDF straight from the field. Keep capture time, GPS, and device metadata on and your capture score lands at 100."],
  ["Get paid", "Approval authorizes a payout instruction immediately. Release runs through the settlement adapter — sandbox during beta, Stripe Connect transfers once compliance clears."],
] as const;

const scoring = [
  ["Base score", "55", "Awarded for any accepted, signature-checked file."],
  ["Capture time present", "+15", "Leave timestamps enabled in your camera app."],
  ["GPS coordinates present", "+15", "Grant location access before you shoot."],
  ["Device make / model", "+10", "Native camera apps preserve this; most share-sheet re-encodes strip it."],
  ["Payload at least 1 KB", "+5", "Do not compress or screenshot the original."],
] as const;

const faqs = [
  ["How much does a Certifera relay earn per job?", "You set the price by bidding. Certifera takes a flat 5% protocol fee on the gross quote and you net the remaining 95%, split at the moment of payout authorization. There are no lead fees, subscriptions, or bidding credits."],
  ["When do I actually get paid?", "Payout is authorized the moment a reviewer approves your proof bundle, and the buyer's review window is capped at six hours from submission. Release then runs through the settlement adapter — a non-financial sandbox reference during the controlled beta, and a Stripe Connect transfer once compliance clears."],
  ["What makes a proof bundle pass review?", "Evidence that carries its own context. Shoot with the native camera app, with timestamps and location enabled, and upload the original file rather than a screenshot or a messaging-app re-encode. That path reliably scores 100 out of 100 and emits no flags."],
  ["What happens if my proof is disputed?", "The outcome moves to disputed, no payout is authorized, and your reputation drops 12. A named operator owns every dispute during the beta, and a disputed outcome can be reopened to the bid market rather than silently written off."],
  ["Do I need my own insurance or business entity?", "During the controlled beta, relays are vetted individually and matched to approved categories and coverage zones. Requirements depend on the category — tell us what you cover and we will confirm what applies before you take a live outcome."],
  ["Can a software agent operate as a relay?", "Yes. A reference relay worker ships in the repository: npm run agent:relay polls the open market, bids within its coverage, uploads evidence, and submits proof with no human in the loop."],
] as const;

export default function RelaysPage() {
  return (
    <PageShell active="/for/relays">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(faqSchema(faqs)) }} />

      <PageHero
        eyebrow="For field relays"
        title={<>You’re already nearby. <span className="text-mint">Get paid to prove it.</span></>}
        standfirst="Certifera relays bid on verification work inside their own coverage zone, capture evidence from a phone, and get paid after a reviewed proof. Flat 5% fee, a reputation ledger you can read, and deadlines set by arithmetic rather than a rating algorithm."
        trail={[{ name: "For relays", path: "/for/relays" }]}
      />

      <section className="border-b border-line px-5 py-14 sm:px-8 lg:px-11 lg:py-18">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-mint">The deal, in full</p>
        <h2 className="mt-4 max-w-2xl text-[clamp(2rem,4.2vw,3.6rem)] font-medium leading-[0.96] tracking-[-0.07em]">No hidden take rate. No mystery ranking.</h2>
        <div className="mt-11 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {earnings.map(([figure, label, copy]) => (
            <article key={label} className="border border-line bg-panel p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
              <p className="font-mono text-[clamp(1.5rem,2.6vw,2.2rem)] font-medium leading-none tracking-[-0.05em] text-mint">{figure}</p>
              <h3 className="mt-6 text-[10px] font-semibold uppercase tracking-[0.15em] text-white/45">{label}</h3>
              <p className="mt-2 text-[12px] leading-relaxed text-white/58">{copy}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="border-b border-line px-5 py-14 sm:px-8 lg:px-11 lg:py-18">
        <h2 className="max-w-2xl text-[clamp(2rem,4.2vw,3.6rem)] font-medium leading-[0.96] tracking-[-0.07em]">Match, quote, capture, get paid.</h2>
        <div className="mt-11 grid gap-px overflow-hidden rounded-sm border border-line bg-white/10 md:grid-cols-2 lg:grid-cols-4">
          {flow.map(([title, copy], index) => (
            <article key={title} className="bg-panel p-6">
              <span className="font-mono text-[11px] text-mint">{String(index + 1).padStart(2, "0")}</span>
              <h3 className="mt-8 text-xl font-medium tracking-[-0.045em]">{title}</h3>
              <p className="mt-3 text-[13px] leading-relaxed text-white/55">{copy}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="border-b border-line bg-moss px-5 py-14 sm:px-8 lg:px-11 lg:py-18">
        <div className="grid gap-10 lg:grid-cols-[1fr_1fr] lg:gap-14">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-mint">Capture score</p>
            <h2 className="mt-4 text-[clamp(2rem,4.2vw,3.6rem)] font-medium leading-[0.96] tracking-[-0.07em]">How to score 100 every time.</h2>
            <p className="mt-6 max-w-md text-[14px] leading-relaxed text-white/58">
              Certifera scores what a file can actually prove, and names what it cannot. A missing signal becomes a named flag — never an assumption in your favour, and never one against you either.
            </p>
            <p className="mt-5 max-w-md text-[13px] leading-relaxed text-white/45">
              The one habit that costs relays the most points: sending a photo through a messaging app before uploading. That strips capture time, GPS, and device metadata in a single step, dropping a 100 to a 55.
            </p>
          </div>
          <div className="rounded-sm border border-line bg-panel p-5 sm:p-7">
            <dl className="font-mono text-[12px]">
              {scoring.map(([label, value, hint]) => (
                <div key={label} className="border-b border-line py-3 last:border-0">
                  <div className="flex items-baseline justify-between gap-4">
                    <dt className="text-white/70">{label}</dt>
                    <dd className="tabular-nums text-mint">{value}</dd>
                  </div>
                  <p className="mt-1.5 font-sans text-[12px] leading-relaxed text-white/42">{hint}</p>
                </div>
              ))}
            </dl>
            <div className="mt-5 flex items-baseline justify-between gap-4 border-t border-line pt-4">
              <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/45">Maximum</span>
              <span className="font-mono tabular-nums text-mint">100</span>
            </div>
          </div>
        </div>
      </section>

      <section className="border-b border-line px-5 py-14 sm:px-8 lg:px-11 lg:py-18">
        <h2 className="text-[clamp(2rem,4.2vw,3.6rem)] font-medium leading-[0.96] tracking-[-0.07em]">Relay questions.</h2>
        <div className="mt-10 divide-y divide-line border-y border-line">
          {faqs.map(([question, answer]) => (
            <details key={question} className="group py-5">
              <summary className="flex cursor-pointer list-none items-start justify-between gap-6 text-[16px] font-medium tracking-[-0.03em] text-white/88 transition-colors hover:text-mint">
                {question}
                <span aria-hidden className="mt-1 shrink-0 font-mono text-mint transition-transform duration-300 group-open:rotate-45">+</span>
              </summary>
              <p className="mt-4 max-w-3xl text-[14px] leading-relaxed text-white/58">{answer}</p>
            </details>
          ))}
        </div>
        <p className="mt-8 text-[13px] text-white/45">
          See also: <Link href="/security" className="text-mint-soft underline-offset-4 hover:underline">how your evidence is stored</Link> and the <Link href="/glossary" className="text-mint-soft underline-offset-4 hover:underline">glossary</Link>.
        </p>
      </section>

      <CtaBand
        heading="Tell us what you cover and where."
        body="Relay onboarding is vetted and metro-by-metro during the controlled beta. Approved relays get category coverage, a console seat, and a named operator on every dispute."
      />
    </PageShell>
  );
}
