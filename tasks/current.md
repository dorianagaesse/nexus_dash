# Current Task: TASK-104 Invite Email Delivery

## Task ID
TASK-104

## Status
Complete on `feature/task-104-invite-email-delivery`; PR #245 is open with
required checks green and Copilot review feedback resolved.

## Objective
Add app-managed email delivery for project collaboration invitations so project
owners can send invite links directly from NexusDash while preserving the
identity-bound invite model, copy-link fallback, notification-center behavior,
and outbound-email observability foundation.

## Context
- TASK-103 shipped email-bound project invitations whose links are delivery
  mechanisms only; acceptance still requires a verified signed-in account whose
  email matches the invited address.
- TASK-123 sends in-app notifications for verified invitees.
- TASK-125 shipped `sendOutboundEmail`, durable `OutboundEmailDelivery` records,
  delivery modes, and `buildProjectInvitationEmail`.
- Current owner UI creates/copies invite links, but does not send email.

## Scope
- Send project invitation emails through the shared outbound email foundation
  using the `project_invitation` template key.
- Resolve absolute invite URLs from the trusted request origin in the API route,
  then keep email composition and delivery inside service-layer code.
- Keep invitation creation authoritative in the collaboration service:
  successful, skipped, or failed email delivery must not make the invite link an
  anonymous bearer token or weaken email-bound acceptance.
- Preserve copyable invite links as a fallback for every pending invitation.
- Add owner-visible delivery feedback for newly created invites and pending
  invite resend attempts, including skipped/failed states in development,
  preview, disabled, or provider-failure cases.
- Add a resend path for active pending invitations so owners can trigger email
  delivery again without creating a replacement invite.
- Record safe delivery metadata that ties outbound records to invitation,
  project, role, and actor identifiers without storing secrets or raw provider
  payloads.
- Update docs/runbooks only where behavior or env expectations change.

## Acceptance Criteria
1. `tasks/current.md` records TASK-104 scope, acceptance criteria, definition of
   done, and validation evidence.
2. Owner-created project invites trigger app-managed invitation email delivery
   through `sendOutboundEmail` when delivery mode permits, and record sent,
   skipped, or failed outcomes in `OutboundEmailDelivery`.
3. Owners can resend email for active pending invitations from the project
   contributors/sharing surface without replacing the invitation link.
4. Email delivery failure is visible to the owner, logged safely, and does not
   silently revoke, accept, replace, or otherwise mutate the underlying invite.
5. Invite emails use absolute trusted-origin URLs, sanitized project/inviter
   fields, role-aware copy, and the existing expiration timestamp.
6. Existing in-app notification behavior for verified invitees remains intact
   and is not duplicated into a second notification system.
7. Direct email-only invites and verified-user invites both keep copy-link
   fallback behavior.
8. API/service contracts stay thin and layered: Prisma access remains in
   `lib/services/**`, provider access stays in the outbound email service, and
   routes only parse request data, resolve request context, call services, and
   map responses.
9. Focused Vitest coverage exercises create-send success, skipped delivery,
   provider failure, resend success/failure, inactive-invite resend rejection,
   route payload/context forwarding, and relevant owner UI rendering states.
10. `journal.md` records implementation decisions and validation evidence before
    handoff.

## Definition Of Done
- TASK-104 uses the dedicated branch required by `agent.md`.
- The implementation preserves TASK-103's verified-email acceptance boundary and
  TASK-125's outbound email delivery-mode semantics.
- Local validation passes: `npm run lint`, `npm test`,
  `npm run test:coverage`, and `npm run build`.
- UI-affecting sharing changes are covered by focused component/API tests; run
  `npm run test:e2e` if the implemented interaction requires browser-level
  verification beyond static/component coverage.
- A live invitation-email smoke is attempted only if a usable Resend API key and
  safe recipient are locally available; otherwise the skipped/failure path is
  documented in validation evidence without exposing secrets.
- The branch is pushed, a PR is opened, required checks are green, and Copilot
  review feedback is addressed or explicitly resolved.

## Validation Evidence
- `npm ci` passed on 2026-05-07 in the TASK-104 worktree.
- `npx prisma generate` passed on 2026-05-07.
- `npm run db:local:up` could not bind worktree Postgres to `5432` because an
  existing NexusDash local PostgreSQL service already owned the port; the failed
  task104 Compose container was removed with `docker compose down`.
- `npm run db:migrate` passed on 2026-05-07 against
  `postgresql://postgres:postgres@127.0.0.1:5432/nexusdash?schema=public` with
  no pending migrations.
- Focused validation passed on 2026-05-07:
  `npm test -- tests/components/project-dashboard-owner-sharing-panel.test.tsx tests/components/project-dashboard-owner-access-panel.test.tsx tests/lib/project-collaboration-service.test.ts tests/api/project-sharing.route.test.ts tests/api/project-sharing-invitation-email.route.test.ts`
  with 5 files and 23 tests passing.
- `npm run lint` passed on 2026-05-07.
- Full local DB `NODE_ENV=test npm test` passed on 2026-05-07 with 105 files
  passed, 2 skipped; 778 tests passed, 2 skipped.
- Full local DB `NODE_ENV=test npm run test:coverage` passed on 2026-05-07
  with 91.23% statements, 81.2% branches, 93.42% functions, and 91.75% lines.
- A first `npm run build` attempt failed because non-Vercel production build
  validation treated outbound email `auto` as live and no local
  `RESEND_API_KEY` was intentionally exposed to the build command.
- Production-guarded `OUTBOUND_EMAIL_DELIVERY_MODE=disabled npm run build`
  passed on 2026-05-07 with local PostgreSQL, trusted localhost origins, and a
  local agent token signing secret.
- `npm run test:e2e` passed on 2026-05-07 with local PostgreSQL,
  `OUTBOUND_EMAIL_DELIVERY_MODE=disabled`, trusted localhost origins, and all 8
  Playwright tests passing.
- Manual live invite smoke passed on 2026-05-07 against the local app:
  created project `cmovu31nw0000swsz9nhd1q80`, invited
  `galo.guccy@gmail.com` as an email-only recipient and
  `dorian.agaesse@gmail.com` as a matched verified local account, and recorded
  two `project_invitation` outbound delivery rows with `sent` status and
  provider message ids present.
- PR #245 was opened ready for review on 2026-05-07. Copilot's three
  actionable review threads were addressed in commit `49ea2e4` by validating
  invite URL origins, separating original inviter metadata from resend actor
  metadata, and restoring jsdom globals in roadmap component tests.
- Post-review focused validation passed on 2026-05-07:
  `npm test -- tests/lib/project-collaboration-service.test.ts tests/components/project-roadmap-panel.test.tsx`,
  `npm run lint`, and production-guarded
  `OUTBOUND_EMAIL_DELIVERY_MODE=disabled npm run build`.
- PR #245 required checks passed on 2026-05-07: `check-name`,
  `Quality Core (lint, test, coverage, build)`, `E2E Smoke (Playwright)`, and
  `Container Image (build + metadata artifact)`.

## Out Of Scope
- Background retry workers, bounce webhooks, suppression lists, digesting, and
  notification preference UI.
- Changing invite token/identity semantics or allowing anonymous link claiming.
- App-managed outbound email for notification digests or due-date reminders;
  those remain TASK-225 and TASK-226.
- Calendar, attachment, and agent API scope changes.
