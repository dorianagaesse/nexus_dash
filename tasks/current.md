# Current Task: TASK-125 Outbound Email Foundation

## Task ID
TASK-125

## Status
Implementation and local validation complete on
`feature/task-125-outbound-email-foundation`; PR publication and review
follow-through are pending.

## Objective
Establish a reusable NexusDash-owned outbound email foundation so transactional
emails can be sent through one provider-aware service with explicit sender
identity, template identity, durable delivery observability, and consistent
failure handling.

## Scope
- Keep Resend as the outbound email provider because the existing
  verification/password-reset path already uses `RESEND_API_KEY` and
  `RESEND_FROM_EMAIL`.
- Replace the current narrow transactional email helper with an
  app-owned outbound email service that records each delivery attempt.
- Track provider, sender, recipient, template key, subject, status, provider
  response id/status, error code/message, timestamps, and safe metadata in the
  database.
- Refactor email verification and password reset sends to use the shared
  foundation without changing their token security or user-facing flows.
- Add a future-ready project invitation template contract without enabling
  owner-triggered invite email delivery yet.
- Document provider/env behavior and the explicit no-background-retry decision.
- Run a live email smoke to `dorian.agaesse@gmail.com` if a usable Resend API
  key is locally available, without committing or logging secrets.

## Acceptance Criteria
1. `tasks/current.md` records TASK-125 scope, acceptance criteria, definition
   of done, and validation evidence.
2. Outbound email delivery has a single service entry point with typed template
   keys and provider configuration resolved through `lib/env.server.ts`.
3. Delivery attempts are durably recorded in Prisma/PostgreSQL with sent,
   skipped, and failed outcomes.
4. Email verification and password reset flows continue to create and clean up
   tokens correctly when delivery succeeds, is skipped, or fails.
5. The foundation includes a project-invitation template shape for TASK-104 but
   does not add app-managed invite sending UX/API behavior.
6. Provider failures return consistent typed errors and structured logs without
   exposing secrets.
7. Focused Vitest coverage exercises provider config, skipped delivery,
   successful Resend delivery, provider rejection, delivery-record updates, and
   auth email service integration.
8. Docs/env examples describe the outbound email provider, sender identity, and
   current retry/preview behavior.
9. `journal.md` records implementation decisions and validation evidence.
10. `tasks/backlog.md` marks TASK-125 complete only after implementation,
    validation, PR checks, and Copilot review are handled.

## Definition Of Done
- TASK-125 uses the dedicated branch/worktree required by `agent.md`.
- The implementation keeps persistence inside `lib/services/**` and avoids
  leaking secrets into logs, tests, docs, or commits.
- Local validation passes: `npm run lint`, `npm test`,
  `npm run test:coverage`, and `npm run build`.
- A live email smoke to `dorian.agaesse@gmail.com` is attempted and the result
  is recorded without exposing credentials.
- The branch is pushed, a PR is opened, required checks are green, and Copilot
  review feedback is addressed or explicitly resolved.

## Validation Evidence
- `npx prisma generate` passed on 2026-05-07 after installing worktree
  dependencies with `npm ci`.
- Focused validation passed on 2026-05-07:
  `npm test -- --run tests/lib/outbound-email-service.test.ts tests/lib/email-verification-service.test.ts tests/lib/password-reset-service.test.ts tests/lib/env.server.test.ts`
  with 90 tests passing.
- `npm run lint` passed on 2026-05-07.
- `npm test` passed on 2026-05-07 with local DB env and `NODE_ENV=test`: 98
  files passed, 2 skipped; 758 tests passed, 2 skipped.
- `npm run test:coverage` passed on 2026-05-07 with 91.23% statements, 81.2%
  branches, 93.42% functions, and 91.75% lines.
- `npm run build` passed on 2026-05-07 with local PostgreSQL env and
  production guard variables.
- Live outbound email smoke passed on 2026-05-07:
  `RUN_OUTBOUND_EMAIL_SMOKE=1 OUTBOUND_EMAIL_DELIVERY_MODE=live OUTBOUND_EMAIL_SMOKE_TO=dorian.agaesse@gmail.com npm test -- --run tests/lib/outbound-email-service.live.test.ts`.
- `npm run test:e2e` first failed because production-mode password recovery had
  no trusted local request origin; rerunning with
  `TRUSTED_ORIGINS=http://localhost:3000,http://127.0.0.1:3000` passed on
  2026-05-07 with all 8 Playwright tests passing.
- Local database note: the task worktree's Compose Postgres could not bind
  port `5432` because `nexus_dash_issue214_codex-postgres-1` was already
  running there. Validation used that reachable local PostgreSQL service and
  applied the TASK-125 migration successfully.

## Out Of Scope
- Owner-facing project invite email delivery; this remains TASK-104.
- Background workers, automatic retry queues, bounce webhooks, suppression
  lists, and notification-preference UI.
- Changing auth token TTLs, verification/reset copy beyond shared template
  plumbing, or widening agent/API scopes.
