# Contributing to Certifera

## Development rules

1. Do not weaken server-side authorization for UI convenience.
2. Do not add financial side effects without an idempotency strategy.
3. Do not store evidence in public URLs or client-controlled paths.
4. Do not log credentials, raw API tokens, private evidence, or payment details.
5. Add lifecycle and security audit coverage whenever a new privileged mutation is introduced.

## Before opening a pull request

```bash
npx next typegen
npm exec tsc -- --noEmit --pretty false
npx vitest run
npm run lint
npm run build
```

## Pull request checklist

- [ ] Authorization roles/scopes reviewed
- [ ] State transition remains idempotent or conflict-safe
- [ ] Audit event added where needed
- [ ] Private evidence and secrets not exposed
- [ ] Mobile and keyboard interaction checked
- [ ] Docs and README updated for public API or environment changes
