import type { Metadata } from "next";
import Link from "next/link";
import { CtaBand, PageHero, PageShell } from "@/components/marketing/chrome";
import { faqSchema, jsonLd, pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "Verified real-world execution for AI agents",
  description:
    "Give your AI agent a way to act in the physical world and prove it happened. Post an outcome over a REST API, get hash-addressed evidence back, and release payment only after review.",
  path: "/for/agent-builders",
  keywords: [
    "AI agent real world actions",
    "agent tool use physical tasks",
    "verified agent execution",
    "proof of action API",
    "agent payment escrow",
    "LLM agent field operations",
  ],
});

const problems = [
  ["Your agent can call an API. It cannot check the API told the truth.", "A booking confirmation, a supplier photo, a status webhook — each is a claim. Certifera returns evidence with a hash, a capture score, and named gaps, so your agent reasons over what was actually proven."],
  ["Retries are cheap. Wrong real-world actions are not.", "A hallucinated dispatch costs money and trust. Payout is authorized only after a human or policy review inside a six-hour window, so a bad outcome is a dispute, not a debit."],
  ["You do not want to build a field operations company.", "Relay vetting, coverage zones, SLA arithmetic, dispute handling, and settlement are the unglamorous 90%. Certifera runs that layer behind four scopes and one lifecycle."],
] as const;

const integration = [
  ["1", "Mint a scoped key", "Issue a cfr_ key limited to requests:write and proofs:read. Keys are rotatable, rate-limited, and audited per call."],
  ["2", "Post the outcome", "One JSON body: category, location, reward ceiling, and the proof requirements you will accept. It enters the open bid market immediately."],
  ["3", "Poll or subscribe", "Read /api/requests/:id/activity for the append-only event stream — matched, executed, proof submitted, verified, payout released."],
  ["4", "Reason over evidence", "The proof bundle carries a SHA-256 digest, a 0–100 capture score, and explicit flags like gps_unavailable. Absence of signal never reads as truth."],
] as const;

const useCases = [
  ["Supply and inventory", "Confirm a pallet arrived, a shelf is stocked, or a container seal is intact before releasing a purchase order."],
  ["Property and infrastructure", "Verify a site condition, a meter reading, or a completed repair without dispatching your own inspector."],
  ["Marketplace trust", "Settle a seller claim with third-party evidence instead of a screenshot the counterparty controls."],
  ["Compliance evidence", "Produce a hash-addressed, timestamped record that a required physical check actually took place."],
] as const;

const faqs = [
  ["Can an AI agent use Certifera without a human in the loop?", "Yes for the request and proof-consumption side. An agent holding a cfr_ key can fund an outcome, poll the activity ledger, and read the returned proof bundle autonomously. The review decision that authorizes payout is deliberately gated on an operator or reviewer role during the controlled beta."],
  ["What does the agent get back as proof?", "A proof bundle containing a SHA-256 digest of each evidence asset, a capture score from 0 to 100 derived from capture time, GPS, device metadata and payload size, plus explicit flags naming any missing signal. Evidence itself stays private and access-controlled — there is no public URL."],
  ["How is this different from calling a gig-work or errand API?", "Those APIs return a status string. Certifera returns evidence plus an append-only ledger of every state transition, and it holds payout until that evidence is reviewed. You are buying certainty about an outcome, not labor."],
  ["What happens if the relay never delivers?", "The execution deadline is arithmetic: the quoted ETA plus max(15 minutes, 20% of that ETA). A breach fires an SLA event, costs the relay 6 reputation, and can reopen the outcome to the bid market. No payout is authorized."],
  ["Is there a sandbox?", "Yes. Settlement runs in sandbox by default and emits a non-financial cert-sandbox- reference, so you can exercise the full lifecycle end to end without moving money."],
] as const;

export default function AgentBuildersPage() {
  return (
    <PageShell active="/for/agent-builders">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(faqSchema(faqs)) }} />

      <PageHero
        eyebrow="For agent builders"
        title={<>Your agent can think. <span className="text-mint">Now let it act — provably.</span></>}
        standfirst="Certifera is the execution layer between a model's decision and a physical outcome. Post a machine-readable request, get back hash-addressed evidence and a scored proof bundle, and release payment only after that proof clears review."
        trail={[{ name: "For agent builders", path: "/for/agent-builders" }]}
      />

      <section className="border-b border-line px-5 py-14 sm:px-8 lg:px-11 lg:py-18">
        <h2 className="max-w-3xl text-[clamp(2rem,4.2vw,3.6rem)] font-medium leading-[0.96] tracking-[-0.07em]">Three things break when an agent touches the physical world.</h2>
        <div className="mt-11 grid gap-px overflow-hidden rounded-sm border border-line bg-white/10 md:grid-cols-3">
          {problems.map(([title, copy], index) => (
            <article key={title} className="bg-panel p-6">
              <span className="font-mono text-[11px] text-mint">{String(index + 1).padStart(2, "0")}</span>
              <h3 className="mt-8 text-xl font-medium leading-tight tracking-[-0.04em]">{title}</h3>
              <p className="mt-4 text-[13px] leading-relaxed text-white/55">{copy}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="border-b border-line px-5 py-14 sm:px-8 lg:px-11 lg:py-18">
        <div className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-mint">Integration</p>
            <h2 className="mt-4 max-w-2xl text-[clamp(2rem,4.2vw,3.6rem)] font-medium leading-[0.96] tracking-[-0.07em]">Four calls from decision to settled proof.</h2>
          </div>
          <Link href="/docs" className="shrink-0 text-[10px] font-bold uppercase tracking-[0.14em] text-mint-soft transition-colors hover:text-white">Full API reference →</Link>
        </div>

        <div className="mt-11 grid gap-4 lg:grid-cols-[1fr_1fr]">
          <ol className="space-y-px overflow-hidden rounded-sm border border-line bg-white/10">
            {integration.map(([step, title, copy]) => (
              <li key={step} className="bg-panel p-5">
                <div className="flex gap-4">
                  <span className="mt-0.5 font-mono text-[11px] text-mint">{step}</span>
                  <div>
                    <h3 className="text-[15px] font-medium tracking-[-0.03em]">{title}</h3>
                    <p className="mt-2 text-[13px] leading-relaxed text-white/55">{copy}</p>
                  </div>
                </div>
              </li>
            ))}
          </ol>
          <pre className="overflow-x-auto rounded-sm border border-line bg-black/30 p-5 text-[11px] leading-relaxed text-mint-soft"><code>{`# 1 — fund the outcome
curl -X POST https://certifera.io/api/requests \\
  -H "Authorization: Bearer cfr_…" \\
  -H "Content-Type: application/json" \\
  -d '{"title":"Confirm pallet 8841 arrived intact",
       "category":"Logistics",
       "location":"Austin, TX",
       "reward":180}'

# 2 — read the append-only ledger
curl https://certifera.io/api/requests/$ID/activity \\
  -H "Authorization: Bearer cfr_…"

# → open → matched → review → verified
#   proof.sha256      = "9f2c…"
#   proof.captureScore = 95
#   proof.flags        = []`}</code></pre>
        </div>
      </section>

      <section className="border-b border-line bg-moss px-5 py-14 sm:px-8 lg:px-11 lg:py-18">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-mint">Where it pays for itself</p>
        <h2 className="mt-4 max-w-2xl text-[clamp(2rem,4.2vw,3.6rem)] font-medium leading-[0.96] tracking-[-0.07em]">Outcomes worth paying to be certain about.</h2>
        <div className="mt-11 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {useCases.map(([title, copy]) => (
            <article key={title} className="border border-line bg-panel p-5">
              <h3 className="text-[15px] font-medium tracking-[-0.03em]">{title}</h3>
              <p className="mt-3 text-[13px] leading-relaxed text-white/55">{copy}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="border-b border-line px-5 py-14 sm:px-8 lg:px-11 lg:py-18">
        <h2 className="text-[clamp(2rem,4.2vw,3.6rem)] font-medium leading-[0.96] tracking-[-0.07em]">Questions builders ask first.</h2>
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
          More in the <Link href="/faq" className="text-mint-soft underline-offset-4 hover:underline">full FAQ</Link> and the <Link href="/glossary" className="text-mint-soft underline-offset-4 hover:underline">glossary</Link>.
        </p>
      </section>

      <CtaBand
        heading="Bring us one outcome your agent can’t currently verify."
        body="Design partners get a scoped API key, a live console seat, sandbox settlement, and a direct operator escalation path."
      />
    </PageShell>
  );
}
