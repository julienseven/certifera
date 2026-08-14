import type { Metadata } from "next";
import Link from "next/link";
import { CtaBand, PageHero, PageShell } from "@/components/marketing/chrome";
import { faqSchema, jsonLd, pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "Security, evidence integrity, and what we don’t claim",
  description:
    "How Certifera protects credentials, evidence, and settlement: scrypt password hashing, AES-256-GCM field encryption, scoped cfr_ API keys compared in constant time, private SHA-256 addressed evidence, and an append-only audit ledger.",
  path: "/security",
  keywords: [
    "evidence integrity",
    "tamper evident proof",
    "SHA-256 evidence hashing",
    "API key security",
    "audit log append only",
    "verification platform security",
  ],
});

const pillars = [
  {
    id: "01",
    title: "Identity and authority",
    lede: "Every mutation has a named actor and a server-enforced role.",
    items: [
      ["Passwords derived with scrypt", "64-byte derivation over a per-user random salt, compared with a constant-time equality check. No password ever reaches a log or an error payload."],
      ["Sessions are HTTP-only cookies", "Not readable from JavaScript, so an XSS foothold cannot exfiltrate a session. Browser operators and agent keys travel on separate paths."],
      ["Scoped cfr_ API keys", "Four scopes — requests:read, requests:write, proofs:read, proofs:write. Only the SHA-256 hash of a key is stored, and lookups compare digests in constant time so response latency never leaks a partial match."],
      ["MFA secrets sealed at rest", "TOTP secrets are encrypted with AES-256-GCM under a dedicated field key, so a database read alone does not yield a working second factor."],
      ["Roles enforced server-side", "Operator, reviewer, relay, and admin checks run inside the route, not in the UI. The console is a view onto the same API, never a privileged path around it."],
    ],
  },
  {
    id: "02",
    title: "Evidence integrity",
    lede: "Evidence is treated as a claim to be tested, not a file to be trusted.",
    items: [
      ["Declared type is verified against the bytes", "The content type is checked against the file's real signature before anything is written. A .pdf that is secretly something else is rejected at the boundary."],
      ["SHA-256 on upload", "Every asset is hashed as it arrives, and the digest travels inside the proof bundle, so any later substitution is detectable by anyone holding the bundle."],
      ["Private by construction", "Evidence is never represented by a public URL. Reads require an authenticated, authorized actor, and responses are marked no-store. Object storage writes use AES-256 server-side encryption."],
      ["Bounded payloads", "An 8 MB ceiling and an empty-file rejection are applied at the boundary rather than after write."],
      ["Optional malware gate", "A scan webhook can hold proof submission until an asset clears. When the scanner errors, the failure is written as an operational event rather than silently passing."],
      ["Absence is a flag, not a pass", "Missing capture time, GPS, or device metadata produces a named flag and a lower capture score. Certifera never reads missing signal as evidence of truth."],
    ],
  },
  {
    id: "03",
    title: "Money movement",
    lede: "Exactly one payout per outcome, guarded in the database rather than in application logic.",
    items: [
      ["Compare-and-set on every transition", "A review decision only applies if the outcome is still in review. Two concurrent reviewers cannot both settle or both dispute the same outcome."],
      ["One payout, enforced by a unique index", "Release is idempotent by construction, not by convention. A retried release cannot double-pay."],
      ["Signed, replay-resistant webhooks", "Stripe signatures are verified with an HMAC comparison in constant time, and each event id is recorded so a replayed delivery is a no-op."],
      ["Out-of-order events cannot resurrect a payout", "A late transfer.created arriving after a failure only applies to a payout still authorized; otherwise it is ignored and recorded as an operational warning."],
      ["Sandbox by default", "Settlement emits a non-financial cert-sandbox- reference unless production credentials are explicitly configured."],
    ],
  },
  {
    id: "04",
    title: "Auditability",
    lede: "The record is append-only, so history can be read but not quietly rewritten.",
    items: [
      ["An execution ledger per outcome", "Every transition — funded, matched, executed, proof submitted, reviewed, authorized, released — writes an immutable lifecycle event."],
      ["Audit records on privileged actions", "Actor, action, resource, and request context are recorded for administrative and review operations."],
      ["Operational events for failures", "Scanner errors, unknown-payout webhooks, stale transfers, and SLA breaches are recorded as first-class events rather than console noise."],
      ["Rate limits on unauthenticated surfaces", "Login, password reset, and other anonymous endpoints are throttled per identifier, and login latency is held constant so it cannot be used to enumerate accounts."],
    ],
  },
] as const;

const notYet = [
  "SOC 2, ISO 27001, or any completed third-party audit",
  "KYC/KYB, sanctions screening, or a published compliance policy",
  "Custody or escrow of customer funds",
  "A published bug-bounty programme or a formal incident-response SLA",
  "Open, self-serve relay onboarding without human vetting",
] as const;

const faqs = [
  ["Is evidence uploaded to Certifera publicly accessible?", "No. Private evidence is never represented by a public URL. Reads require an authenticated, authorized actor and are returned no-store. When object storage is enabled, assets are written with AES-256 server-side encryption."],
  ["How does Certifera prove evidence has not been swapped?", "Every asset is SHA-256 hashed as it is uploaded, and that digest is carried inside the proof bundle. Anyone holding the bundle can re-hash the asset and detect a substitution. Separately, the declared content type is validated against the file's real signature before storage."],
  ["What stops a payout being released twice?", "A unique index guarantees one payout per outcome, and each state transition is guarded by a database compare-and-set. Stripe webhooks are signature-verified, deduplicated by event id, and only applied to a payout still in the expected state."],
  ["Is Certifera SOC 2 compliant?", "Not today, and we will not imply otherwise. Certifera is controlled-beta infrastructure. Third-party audit, KYC/KYB, and a published compliance policy are explicitly on the pre-production list rather than shipped."],
  ["How do I report a vulnerability?", "Email the address on our access request form, or open a private advisory on the GitHub repository. There is no paid bounty programme during the beta, and we will say so plainly rather than imply one exists."],
] as const;

export default function SecurityPage() {
  return (
    <PageShell active="/security">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(faqSchema(faqs)) }} />

      <PageHero
        eyebrow="Security & evidence"
        title={<>Trust is a claim. <span className="text-mint">Here is the mechanism.</span></>}
        standfirst="Certifera exists to answer whether something actually happened, so a vague security page would undercut the product. This is what is implemented today, in specifics — followed by an equally specific list of what is not."
        trail={[{ name: "Security", path: "/security" }]}
      />

      {pillars.map((pillar) => (
        <section key={pillar.id} className="grid border-b border-line lg:grid-cols-[300px_minmax(0,1fr)]">
          <div className="border-b border-line px-5 py-8 sm:px-8 lg:border-b-0 lg:border-r lg:px-11 lg:py-10">
            <span className="font-mono text-[11px] text-mint">{pillar.id}</span>
            <h2 className="mt-4 text-2xl font-medium leading-tight tracking-[-0.05em]">{pillar.title}</h2>
            <p className="mt-3 max-w-[200px] text-[13px] leading-relaxed text-white/48">{pillar.lede}</p>
          </div>
          <div className="divide-y divide-line px-5 sm:px-8 lg:px-10">
            {pillar.items.map(([title, copy]) => (
              <div key={title} className="py-5">
                <h3 className="text-[15px] font-medium tracking-[-0.03em] text-white/88">{title}</h3>
                <p className="mt-2 max-w-3xl text-[13px] leading-relaxed text-white/55">{copy}</p>
              </div>
            ))}
          </div>
        </section>
      ))}

      <section className="border-b border-line bg-moss px-5 py-14 sm:px-8 lg:px-11 lg:py-18">
        <div className="grid gap-10 lg:grid-cols-[1fr_1fr] lg:gap-14">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-mint">What we do not claim</p>
            <h2 className="mt-4 text-[clamp(2rem,4.2vw,3.6rem)] font-medium leading-[0.96] tracking-[-0.07em]">The absence list.</h2>
            <p className="mt-6 max-w-md text-[14px] leading-relaxed text-white/58">
              A security page that only lists strengths is a marketing page. These are the controls Certifera does not have yet. If one of them is a hard requirement for you, that is useful for both of us to know before a pilot, not after.
            </p>
            <Link href="/launch" className="mt-6 inline-flex text-[10px] font-bold uppercase tracking-[0.14em] text-mint-soft transition-colors hover:text-white">Full launch readiness plan →</Link>
          </div>
          <ul className="space-y-3 self-center">
            {notYet.map((item) => (
              <li key={item} className="flex gap-3 border border-line bg-panel px-4 py-3.5 text-[13px] leading-relaxed text-white/60">
                <span aria-hidden className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-white/25" />
                {item}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="border-b border-line px-5 py-14 sm:px-8 lg:px-11 lg:py-18">
        <h2 className="text-[clamp(2rem,4.2vw,3.6rem)] font-medium leading-[0.96] tracking-[-0.07em]">Security questions.</h2>
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
      </section>

      <CtaBand
        heading="Run your security review before the pilot, not after."
        body="We will answer architecture questions directly and tell you where a control does not exist yet. Certifera is open source — read the implementation rather than take our word for it."
      />
    </PageShell>
  );
}
