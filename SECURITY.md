# Security policy

## Reporting a vulnerability

Do **not** open a public GitHub issue for a security vulnerability, private evidence exposure, authentication bypass, payout flaw, or authorization concern.

Until an official security address is published, report through the project operator channel and include:

- affected route or workflow
- reproduction steps
- impact assessment
- proof of concept, redacted of credentials and private evidence

We aim to acknowledge credible reports within two business days.

## Security boundaries

- Every private marketplace API route requires authentication.
- Sensitive actions use server-side role checks; UI visibility is not authorization.
- API keys are only displayed once and stored as SHA-256 hashes.
- Browser sessions use HTTP-only, same-site cookies.
- Evidence uploads are type- and size-checked, SHA-256 hashed, and access controlled.
- Payout releases use a database state guard and provider idempotency key.

## Before production money movement

A full third-party security review is required for:

- identity and session handling
- permission and tenant isolation
- evidence access and object storage configuration
- payout state transitions and reconciliation
- Stripe/escrow configuration and webhooks
- rate limiting, abuse handling, observability, and incident response
