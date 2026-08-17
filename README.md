# Certifera

**Verified execution for agents.**

Certifera is an operations layer for funding, matching, proving, reviewing, and settling real-world outcomes. It is designed for AI agents and operators that need a trustworthy answer to a simple question: *did the action actually happen?*

> Status: controlled-beta infrastructure. GitHub: [github.com/julienseven/certifera](https://github.com/julienseven/certifera) (private during closed beta). X: [x.com/certiferaxyz](https://x.com/certiferaxyz).

## What is implemented

- Outcome request marketplace with relay quotes and operator matching
- Role-aware review, dispute, reopen, SLA, and settlement lifecycle
- Append-only execution ledger, payout records, and relay reputation events
- Session authentication, role-based permissions, and scoped agent API keys
- Private evidence uploads with file signature checks, 8 MB limits, SHA-256 hashes, EXIF/GPS signal extraction, scan gating, and S3-compatible encrypted storage
- Persistent operations alerts, maintenance runs, rate limits, MFA, email verification, password recovery, and an admin Operations Center
- Sandbox settlement plus optional Stripe Connect transfer adapter, signed webhook reconciliation, and payout failure handling
- Public landing page, docs, launch readiness brief, protected operator console, Security Center, and admin Operations Center

## Local development

```bash
npm install
npm run db:migrate       # apply schema migrations
npm run db:seed:sandbox  # optional: demonstration relays, outcomes, and bids
npm run dev
```

Create the first administrator at `/access`, then open `/console`.

## Database schema changes

Schema is versioned in `./drizzle` and applied by an explicit migration step. Never
run `drizzle-kit push` against a deployed database: it diffs `schema.ts` straight
against whatever `DATABASE_URL` points at and executes the result, so a renamed
column reaches production as `DROP` + `ADD` with no record and no rollback.

```bash
# 1. edit src/db/schema.ts, then generate the migration that carries the change
npm run db:generate -- --name add_something

# 2. review the emitted SQL in ./drizzle, then apply it
npm run db:migrate
```

CI applies migrations and fails if `schema.ts` and `./drizzle` have drifted apart.

Production migrations run from the `Apply migrations` workflow on every push to
`main`, alongside the deploy that push triggers. It needs
`PRODUCTION_DATABASE_URL` and `PRODUCTION_DATABASE_URL_UNPOOLED` as repository
secrets, and fails loudly when they are missing rather than skipping quietly.

Because code and schema land together, migrations must be additive: expand in
one release, contract in a later one. A migration that drops or renames anything
has to be split across two releases, or the running version breaks during the
minutes the two overlap. This is not theoretical — `0001` shipped with the code
that reads its columns, nothing applied the DDL, and the hourly sweep returned
500 for two days on a column that did not exist.

Adopting migrations on a database that already has the schema (one time, per
environment): confirm the schema matches, then record the baseline as applied
rather than re-running its DDL. Until this is done, `db:migrate` will try to
replay `0000_baseline.sql` against objects that already exist; it fails inside
its own transaction and rolls back, so the schema is never left half-changed.

```bash
npm run db:baseline -- 0000_baseline
```

## Required environment

```env
DATABASE_URL=postgresql://...
```

## Production environment

Start from [`.env.example`](.env.example). Production requires:

```env
NEXT_PUBLIC_SITE_URL=https://certifera.example
CERTIFERA_SETUP_CODE=replace-with-a-long-random-value
CERTIFERA_CRON_SECRET=replace-with-a-second-long-random-value
CERTIFERA_EMAIL_VERIFICATION_REQUIRED=true
CERTIFERA_FIELD_ENCRYPTION_KEY=base64-encoded-32-byte-key
CERTIFERA_EVIDENCE_STORAGE=s3
CERTIFERA_S3_BUCKET=certifera-private-evidence
CERTIFERA_S3_REGION=us-east-1
CERTIFERA_EVIDENCE_SCAN_REQUIRED=true
CERTIFERA_MALWARE_SCAN_WEBHOOK=https://scanner.example/scan
```

Database evidence storage is a sandbox-only fallback. In production, Certifera writes private object keys to S3-compatible storage with server-side encryption and gates proof submission on scan status. Configure hourly `/api/internal/maintenance` execution using the `vercel.json` cron or your platform scheduler.

Settlement mode defaults to sandbox. Use Stripe only after compliance review:

```env
CERTIFERA_SETTLEMENT_MODE=sandbox
CERTIFERA_STRIPE_SECRET_KEY=sk_live_or_test_...
```

To use production Stripe settlement, each payout-capable relay also requires a verified Stripe Connect account ID in its relay profile. Do not set `CERTIFERA_SETTLEMENT_MODE=stripe` until KYC/KYB, legal, reconciliation, and incident procedures are in place.

## API authentication

Browser users authenticate with a secure HTTP-only session. Server-to-server agents use an API key created from the operator workspace.

```bash
curl https://your-certifera-domain/api/requests \
  -H "Authorization: Bearer cfr_..."
```

Available API scopes:

- `requests:read`
- `requests:write`
- `proofs:read`
- `proofs:write`

Never ship an agent API key to a browser or mobile client.

## Product lifecycle

```text
open → matched → review → verified → payout authorized → payout released
                    ↘ disputed → reopened → open
```

Each state transition writes to the execution ledger. A payout can be released only after proof approval and is protected by a database compare-and-set plus provider-level idempotency key.

## Project map

```text
src/app/            Public site, docs, access UI, operator console, API routes
src/db/schema.ts    Drizzle models
src/lib/auth.ts     Sessions, roles, API keys, audit records
src/lib/lifecycle.ts Lifecycle policy and event helpers
src/lib/settlement.ts Sandbox / Stripe settlement adapter
docs/               Operator and launch documentation
```

## Production checklist

See `/launch` in the application and [`docs/README.md`](docs/README.md). The app-side controls for object storage, malware-scan gating, observability, maintenance, identity hardening, and payout reconciliation are implemented. Remaining real-money beta blockers are external production configuration, compliance, Stripe Connect/KYC, operational staffing, backup/restore drills, and completed relay onboarding.

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md) and [SECURITY.md](SECURITY.md) before submitting a change. No financial or access-control change should be merged without explicit idempotency, audit, and authorization review.

## License

Proprietary / all rights reserved until an explicit repository license is added.
