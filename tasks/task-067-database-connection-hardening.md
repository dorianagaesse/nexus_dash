# TASK-067 Database Connection Hardening

## Goal
Strengthen production database connection safety by enforcing clear pooler/direct boundaries, secure remote connection settings, and operational runbook guidance.

## Scope
- Add production runtime validation guardrails in `lib/env.server.ts` for:
  - remote production `DATABASE_URL` / `DIRECT_URL` split sanity checks
  - secure transport requirements for remote hosts
  - invalid pooler usage on direct migration/admin URL
- Keep local development and CI flows compatible.
- Add unit coverage for success/failure cases.
- Document an operator-focused runbook for credentials and rotation.

## Acceptance
- Production validation fails fast on unsafe remote DB configuration.
- Local/CI DB configs remain valid without unnecessary friction.
- Test coverage includes both passing and failing hardening scenarios.
- Runbook clearly defines setup/rotation/verification steps.

## Definition of Done
- `npm run lint`
- `npm test`
- `npm run test:coverage`
- `npm run build`
- PR opened with Copilot feedback triaged/resolved.
