import type { Metadata } from "next";
import Link from "next/link";
import { CtaBand, PageHero, PageShell } from "@/components/marketing/chrome";
import { faqSchema, jsonLd, pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "Frequently asked questions",
  description:
    "What Certifera is, how verified execution works, what a proof bundle contains, how relays are paid, what the 5% protocol fee covers, and exactly what does not exist yet during the controlled beta.",
  path: "/faq",
  keywords: [
    "what is verified execution",
    "proof of physical action",
    "agent infrastructure FAQ",
    "how does Certifera work",
    "relay network FAQ",
  ],
});

type FaqGroup = { id: string; heading: string; faqs: readonly (readonly [string, string])[] };

const groups: readonly FaqGroup[] = [
  {
    id: "01",
    heading: "The basics",
    faqs: [
      ["What is Certifera?", "Certifera is verified-execution infrastructure. An agent or operator funds a machine-readable real-world outcome, vetted relays bid to execute it, evidence is captured and scored, and payment is released only after that evidence passes review. Every state transition is written to an append-only ledger."],
      ["What problem does it actually solve?", "AI can decide, plan, and transact, but it cannot reliably answer whether a physical thing actually happened. Certifera turns that question into an API call that returns hash-addressed evidence and a scored proof bundle rather than a status string a counterparty controls."],
      ["Is Certifera a marketplace, an API, or a protocol?", "An API first. There is an open bid market underneath it and a console on top of it, but the console is a view onto the same API rather than a privileged path around it. Agents are the intended primary user."],
      ["Who is it for?", "Agent builders who need their software to act in the physical world with proof, marketplace and platform operators who need third-party evidence to settle claims, and field relays who want to be paid for verification work at a transparent rate."],
    ],
  },
  {
    id: "02",
    heading: "How the lifecycle works",
    faqs: [
      ["What are the states an outcome moves through?", "open, matched, review, then either verified or disputed. A disputed outcome can be reopened back to open for a new bidding round. Verified outcomes continue to payout authorized and payout released. Every one of those transitions writes a lifecycle event."],
      ["How are deadlines set?", "By arithmetic, not by promise. The execution deadline is the relay's quoted ETA plus max(15 minutes, 20% of that ETA). The review deadline is six hours after proof submission. A breach on either side fires an SLA event that is visible to both parties."],
      ["What happens when a deadline is missed?", "A missed execution deadline costs the relay 6 reputation, fires an SLA event, and can reopen the outcome to the bid market. A missed review deadline is recorded against the buyer, so the clock genuinely runs in both directions."],
      ["What is in a proof bundle?", "A SHA-256 digest for each evidence asset, a capture score from 0 to 100 derived from capture time, GPS coordinates, device metadata, and payload size, plus explicit flags naming any missing signal — for example gps_unavailable. The evidence itself stays private and access-controlled."],
      ["Who decides whether a proof passes?", "A reviewer or operator, inside the six-hour window. Approval authorizes payout and adds 8 to the relay's reputation. A dispute holds settlement and costs 12. During the controlled beta every dispute has a named human owner."],
    ],
  },
  {
    id: "03",
    heading: "Money and incentives",
    faqs: [
      ["What does Certifera charge?", "A flat 5% protocol fee — 500 basis points on the gross quote — taken at payout authorization. The relay nets the remainder. There are no lead fees, subscriptions, or bidding credits."],
      ["Is real money moving today?", "Not by default. Settlement runs in sandbox and emits a non-financial cert-sandbox- reference so the entire lifecycle can be exercised without moving funds. Stripe Connect transfers are implemented behind a per-payout idempotency key and stay gated on compliance review."],
      ["Can a payout be released twice?", "No. There is exactly one payout per outcome, enforced by a unique database index rather than by application convention, and every state transition is guarded by a compare-and-set. Release is idempotent by construction."],
      ["Is there a token?", "No. No wallet, chain, staking, or governance code ships in Certifera today. A utility layer is a post-product-market-fit decision gated on observable task fees, repeat buyers, and real security demand — not a launch mechanic."],
    ],
  },
  {
    id: "04",
    heading: "Access and status",
    faqs: [
      ["Can I sign up today?", "Access is invite-only during the controlled beta. Design partners get a scoped API key, a live console seat, sandbox settlement, and a direct operator escalation path. Request access and tell us the one outcome you cannot currently verify."],
      ["What is deliberately not built yet?", "Production compliance, KYC/KYB and sanctions policy, real-money custody or escrow of any kind, and open self-serve relay onboarding. The status section on the home page keeps that line explicit and current."],
      ["What are the go/no-go gates for expanding the beta?", "At least 90% of matched tasks reaching proof, at least 95% of reviews resolving inside SLA, and at least 40% 30-day repeat demand. The full readiness plan is public."],
      ["Is Certifera open source?", "The implementation is on GitHub. For a security or architecture review, reading the code is faster and more honest than reading a claims page."],
    ],
  },
];

const allFaqs = groups.flatMap((group) => group.faqs);

export default function FaqPage() {
  return (
    <PageShell active="/faq">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(faqSchema(allFaqs)) }} />

      <PageHero
        eyebrow="FAQ"
        title={<>Straight answers, <span className="text-mint">including the unflattering ones.</span></>}
        standfirst="Everything a buyer, a builder, or a relay asks before a pilot — how the lifecycle works, what a proof bundle contains, what the fee covers, and what is deliberately not built yet."
        trail={[{ name: "FAQ", path: "/faq" }]}
      />

      {groups.map((group) => (
        <section key={group.id} className="grid border-b border-line lg:grid-cols-[300px_minmax(0,1fr)]">
          <div className="border-b border-line px-5 py-8 sm:px-8 lg:border-b-0 lg:border-r lg:px-11 lg:py-10">
            <span className="font-mono text-[11px] text-mint">{group.id}</span>
            <h2 className="mt-4 text-2xl font-medium leading-tight tracking-[-0.05em]">{group.heading}</h2>
          </div>
          <div className="divide-y divide-line px-5 sm:px-8 lg:px-10">
            {group.faqs.map(([question, answer]) => (
              <details key={question} className="group py-5" open>
                <summary className="flex cursor-pointer list-none items-start justify-between gap-6 text-[16px] font-medium tracking-[-0.03em] text-white/88 transition-colors hover:text-mint">
                  <h3>{question}</h3>
                  <span aria-hidden className="mt-1 shrink-0 font-mono text-mint transition-transform duration-300 group-open:rotate-45">+</span>
                </summary>
                <p className="mt-4 max-w-3xl text-[14px] leading-relaxed text-white/58">{answer}</p>
              </details>
            ))}
          </div>
        </section>
      ))}

      <section className="border-b border-line px-5 py-12 sm:px-8 lg:px-11">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/38">Keep reading</p>
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["/for/agent-builders", "For agent builders", "Integration path, code, and use cases."],
            ["/for/relays", "For field relays", "Fees, reputation, and how to score 100."],
            ["/security", "Security & evidence", "The mechanism, plus the absence list."],
            ["/glossary", "Glossary", "Every term the API and console use."],
          ].map(([href, title, copy]) => (
            <Link key={href} href={href} className="ease-out-expo border border-line bg-panel p-5 transition-[transform,border-color] duration-300 hover:-translate-y-[3px] hover:border-mint/40">
              <h3 className="text-[15px] font-medium tracking-[-0.03em]">{title}</h3>
              <p className="mt-2 text-[13px] leading-relaxed text-white/52">{copy}</p>
            </Link>
          ))}
        </div>
      </section>

      <CtaBand
        heading="Still holding a question this page didn’t answer?"
        body="Ask it directly. We would rather lose a pilot for the right reason than win one on a claim we cannot support."
      />
    </PageShell>
  );
}
