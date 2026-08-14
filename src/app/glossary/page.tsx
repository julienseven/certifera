import type { Metadata } from "next";
import Link from "next/link";
import { CtaBand, PageHero, PageShell } from "@/components/marketing/chrome";
import { definedTermSetSchema, jsonLd, pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "Glossary of verified execution",
  description:
    "Definitions for the vocabulary Certifera's API and console use: outcome request, relay, proof bundle, capture score, execution ledger, SLA arithmetic, protocol fee, reputation delta, and settlement adapter.",
  path: "/glossary",
  keywords: [
    "verified execution glossary",
    "proof bundle definition",
    "capture score",
    "execution ledger",
    "relay network terminology",
    "outcome request",
  ],
});

const terms = [
  ["Outcome request", "A machine-readable description of something that must happen in the physical world: category, location, reward ceiling, and the proof requirements the buyer will accept. Posting one places it in the open bid market."],
  ["Relay", "A vetted party — human or software — approved for specific categories and coverage zones, who bids on outcome requests, executes them, and submits evidence. Relays hold a reputation score that moves with every resolved outcome."],
  ["Bid market", "The open round in which relays quote a price and a committed ETA against a posted outcome. An operator selects the winner, which starts the execution clock. Nothing bypasses this market — dispatch ranking is advisory and read-only."],
  ["Proof bundle", "The artefact a relay submits to close an outcome. It carries a SHA-256 digest for each evidence asset, a capture score, and any emitted flags. It is what a reviewer approves or disputes, and what an agent reasons over downstream."],
  ["Capture score", "A 0–100 measure of what an evidence file can actually prove. A base of 55 for an accepted, signature-checked file, plus 15 for capture time, 15 for GPS coordinates, 10 for device make and model, and 5 for a payload of at least 1 KB."],
  ["Evidence flag", "A named gap emitted when a signal is missing — for example capture_time_unavailable or gps_unavailable. Flags exist so that absence of signal is never silently read as presence of truth."],
  ["Execution ledger", "The append-only stream of lifecycle events recorded against a single outcome. Every transition writes to it, so the history of an outcome can be read but not quietly rewritten."],
  ["SLA arithmetic", "Certifera's deadlines are computed rather than promised. The execution deadline is the quoted ETA plus max(15 minutes, 20% of that ETA); the review deadline is six hours after proof submission."],
  ["SLA breach", "A recorded event fired when either side misses its computed deadline. A missed execution deadline costs the relay 6 reputation and can reopen the outcome; a missed review deadline is recorded against the buyer."],
  ["Reputation delta", "The change applied to a relay's score when an outcome resolves: +8 verified, −12 disputed, and a further −6 for a missed execution deadline. Every delta is written as its own event with a stated reason."],
  ["Protocol fee", "The flat 5% — 500 basis points — taken from the gross quote at payout authorization. The relay nets the remainder. There are no lead fees, subscriptions, or bidding credits."],
  ["Payout authorization", "The moment an approved review creates a payout instruction. It is distinct from release: authorization records what is owed, release moves it. Exactly one payout exists per outcome, enforced by a unique index."],
  ["Settlement adapter", "The pluggable layer that executes a release. Sandbox mode emits a non-financial cert-sandbox- reference; the Stripe Connect adapter performs a real transfer behind a per-payout idempotency key."],
  ["Dispute", "A reviewer's rejection of a proof bundle. It holds settlement, costs the relay 12 reputation, and records a written reason. A disputed outcome can be reopened to the bid market rather than written off."],
  ["Reopen", "Returning a disputed outcome to the open market for a fresh bidding round, clearing the selected relay and the execution clock while preserving the full prior ledger."],
  ["Scoped API key", "A bearer credential prefixed cfr_, limited to some combination of requests:read, requests:write, proofs:read, and proofs:write. Only its SHA-256 digest is stored, and lookups compare digests in constant time."],
  ["Dispatch preflight", "A read-only ranking of available relay supply on reputation, category coverage, local zone, and recency of heartbeat, returned with human-readable reasons. It informs matching and never bypasses the bid market."],
  ["Coverage zone", "The geographic area a relay is approved to serve. Combined with category approval, it determines which outcomes a relay can even see, let alone bid on."],
] as const;

export default function GlossaryPage() {
  return (
    <PageShell active="/glossary">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(definedTermSetSchema("Certifera glossary of verified execution", "/glossary", terms)) }} />

      <PageHero
        eyebrow="Glossary"
        title={<>The vocabulary of <span className="text-mint">verified execution.</span></>}
        standfirst="Certifera's API and console use precise terms on purpose. These are their definitions, matching exactly what the implementation does rather than what a category deck would like them to mean."
        trail={[{ name: "Glossary", path: "/glossary" }]}
      />

      <section className="px-5 py-12 sm:px-8 lg:px-11 lg:py-16">
        <dl className="divide-y divide-line border-y border-line">
          {terms.map(([term, definition]) => (
            <div key={term} id={term.toLowerCase().replace(/[^a-z0-9]+/g, "-")} className="grid scroll-mt-[92px] gap-3 py-6 lg:grid-cols-[260px_minmax(0,1fr)] lg:gap-8">
              <dt className="text-[17px] font-medium tracking-[-0.04em] text-mint-soft">{term}</dt>
              <dd className="max-w-3xl text-[14px] leading-relaxed text-white/60">{definition}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-10 text-[13px] text-white/45">
          Each of these appears in the <Link href="/docs" className="text-mint-soft underline-offset-4 hover:underline">API documentation</Link>. For the reasoning behind the incentive numbers, see the <Link href="/#economics" className="text-mint-soft underline-offset-4 hover:underline">economics section</Link>.
        </p>
      </section>

      <CtaBand
        heading="Read the terms, then read the ledger."
        body="Design partners get a scoped API key and a console seat, so every term on this page becomes something you can observe rather than take on trust."
      />
    </PageShell>
  );
}
