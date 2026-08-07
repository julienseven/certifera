# Certifera operator documentation

## Operating model

Certifera coordinates verified physical-world outcomes through a narrow, auditable workflow:

1. An authenticated operator or agent funds an outcome request.
2. Approved relays quote a price and committed execution ETA.
3. An operator selects one relay.
4. The selected relay uploads private evidence and submits an observation.
5. A reviewer approves, disputes, or reopens the outcome.
6. Approval creates a payout instruction; an authorized operator releases it.

## Roles

| Role | Primary authority |
| --- | --- |
| `admin` | All platform controls, user onboarding, settlement, and review |
| `operator` | Create requests, select bids, view activity, release payouts, escalate SLAs |
| `reviewer` | View evidence, approve/dispute/reopen review cases |
| `relay` | Quote only as their linked relay profile; upload private evidence; submit their proof |

## Evidence handling

Private evidence is intentionally not represented by a public URL.

- Accepted types: JPG, PNG, WEBP, PDF
- Maximum file size: 8 MB
- Server validates declared type against file signatures and calculates SHA-256
- `CERTIFERA_EVIDENCE_STORAGE=database` is a sandbox fallback only
- `CERTIFERA_EVIDENCE_STORAGE=s3` writes to a private S3-compatible bucket with AES-256 server-side encryption and non-public keys
- Evidence reads require an authenticated, authorized actor and are served with `private, no-store`
- `CERTIFERA_MALWARE_SCAN_WEBHOOK` can validate files before proof submission; set `CERTIFERA_EVIDENCE_SCAN_REQUIRED=true` in production to block unscanned evidence
- Deletion removes the object from storage and soft-deletes the database asset record

## Identity hardening

- Sessions are HTTP-only and same-site.
- API keys are scoped, hashed, and revocable.
- Email verification tokens expire after 24 hours; enable `CERTIFERA_EMAIL_VERIFICATION_REQUIRED=true` for production.
- Password recovery tokens expire after one hour and reset invalidates active sessions.
- TOTP MFA secrets are AES-256-GCM encrypted with `CERTIFERA_FIELD_ENCRYPTION_KEY`.
- Enable MFA for every admin and operator before real-money beta.
- Login has IP-based throttling, persistent per-account route throttles, and lockout after repeated failures.

## Reliability and maintenance

`POST /api/internal/maintenance` evaluates overdue execution/review windows, reopens missed execution, records review breaches, and clears expired sessions, one-time tokens, and rate-limit windows.

- Configure `CERTIFERA_CRON_SECRET` for external schedulers, or `CRON_SECRET` for Vercel Cron.
- Vercel deployments run the endpoint hourly through `vercel.json`.
- Other platforms should schedule the same authenticated request.
- `/api/health` reports database, evidence, mail, settlement, and cron readiness without exposing secrets.

## Cohort command

`/cohorts` is the operational launch workflow for the first task run:

1. Create one city + one task-category cohort.
2. Enroll only active partners with signed agreements and approved relays.
3. Activate the cohort only after eligibility checks pass.
4. Fund cohort-attributed tasks through the normal request, bid, proof, review, and settlement lifecycle.

Sandbox cohorts require the controlled-test policy plus one signed active partner and two approved relays. Stripe cohorts require every production readiness check plus three signed active partners and ten approved relays. The system will block activation if those conditions are missing.

## Supply, templates, and operational insights

- `/supply` creates relay profiles and manages coverage categories, service radius, verification notes, approval, suspension, and availability. Relay accounts can update their own heartbeat through `POST /api/relays/heartbeat`.
- Open requests expose dispatch preflight ranking in the operator console. Ranking uses only available relays, category coverage, zone affinity, recent heartbeat, and reputation; it never bypasses the bid market.
- `/templates` stores active-cohort, signed-partner task templates and can run bounded batches of 1–25 independently auditable tasks.
- `/api/admin/finance/export` produces a private CSV for payout reconciliation ownership.
- `/insights` ranks the next product/operating sprint based on live task volume, bid density, review SLA, partner repeat demand, evidence signal quality, payout failures, and unresolved critical alerts.

## Pilot command center

`/pilot` is the closed-beta workflow for four operational tracks:

1. **Deployment proof** — automatic configuration checks plus manual attestations for backup restore, incident response, legal package, relay verification, payout ownership, and security review.
2. **Partner onboarding** — create design partners, track contract and activation status, and attribute funded requests to an active signed partner.
3. **Customer learning loop** — record satisfaction, risk, feedback, and next actions through structured partner check-ins.
4. **Go/no-go scorecard** — evaluate task sample size, proof completion, review SLA, bid density, repeat demand, customer satisfaction, critical alerts, and deployment readiness against published thresholds.

A pilot partner must be `active` with a `signed` agreement before it can be attached to a paid request.

## Operations, observability, and reconciliation

`/operations` is an admin-only control plane for:

- production readiness configuration checks
- persistent operational alerts and resolution acknowledgements
- on-demand maintenance runs
- pilot operator/reviewer/relay onboarding
- scoped agent API key issuance and revocation
- recent maintenance and Stripe webhook reconciliation records

Operational errors are written to `operational_events`. Configure `CERTIFERA_ALERT_WEBHOOK` to forward error and critical events to your incident channel. The alert webhook is additive: database auditability remains intact if the webhook is unavailable.

Stripe transfer webhooks are verified through `CERTIFERA_STRIPE_WEBHOOK_SECRET`, deduplicated by Stripe event ID, and reconcile payouts as released or failed. Never enable Stripe settlement without a live webhook endpoint and reconciliation owner.

## Automated verification

The repository includes Vitest coverage for evidence scoring, encrypted MFA material, payout math, sandbox settlement references, and Stripe webhook signatures. GitHub Actions runs the unit suite before each production build.

## Settlement modes

### Sandbox

Default mode. Payout release creates a non-financial reference to test the entire operating lifecycle.

```env
CERTIFERA_SETTLEMENT_MODE=sandbox
```

### Stripe Connect

The adapter can create a Stripe transfer only when a relay has a connected account ID and the server has an API secret. Stripe transfer calls use the payout ID as an idempotency key.

```env
CERTIFERA_SETTLEMENT_MODE=stripe
CERTIFERA_STRIPE_SECRET_KEY=sk_...
```

Before enabling it, complete legal review, KYC/KYB, sanctions policy, tax obligations, refunds/chargebacks, reconciliation, and incident response.

## SLA policy

- Relay execution deadline: quote ETA plus max(15 minutes, 20% of quote ETA)
- Review deadline: six hours after proof submission
- Breaches are visible, evented, and may reopen the market
- A missed execution applies a transparent relay reputation penalty

## Launch gates

- All payout-capable relays have authenticated, approved accounts
- Evidence is private, hash-addressed, and accessible only by role
- Pilot tasks have a clear support and dispute owner
- Match-to-proof completion is at least 90%
- Review resolution inside SLA is at least 95%
- Repeat paid demand and positive contribution margin are demonstrated

See the in-product `/launch` brief for the complete go/no-go matrix.
