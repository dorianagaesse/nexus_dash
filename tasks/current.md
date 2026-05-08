# Current Task: TASK-225 Project Notification Email Digests

## Task ID
TASK-225

## Status
In progress on `feature/task-225-project-notification-email-digests`.

## Objective
Extend the notification center with project-grouped outbound email digests so
important unread in-app activity can reach users by email without sending one
email per notification. The implementation should keep the in-app notification
inbox as the source of truth, batch eligible notifications by recipient and
project, collapse repetitive agent-heavy activity, and enforce a predictable
quiet-window/rate-limit policy before sending through the TASK-125 outbound
email foundation.

## Background
- TASK-123 shipped the durable in-app notification center.
- TASK-124 and later work added task comment mention notifications.
- TASK-125 shipped the reusable outbound email service and delivery records.
- TASK-104 shipped app-managed initial project invitation email delivery and
  owner-triggered resend for active invitations.
- Current notification types include project invitations, task comment
  mentions, and task assignments.
- The intended product behavior is debounce-style: avoid sending while a user
  is still receiving clustered notifications, then send one grouped email after
  the user's eligible notification activity has been quiet long enough.
- There is no general background job runner in the app yet, so this task must
  introduce a narrow, documented scheduled dispatch path instead of hiding
  digest sends inside ordinary page loads.

## Scope
- Add a project notification digest/reminder data model for per-recipient,
  per-project delivery windows, idempotency, and rate limiting.
- Add a digest selection service that reads unresolved, unread notification
  records, groups them by recipient and project, and excludes notifications
  that are already resolved, already read, or already covered by a sent/skipped
  digest.
- Add a digest template key and builder to
  `lib/services/outbound-email-templates.ts` with plain text and HTML summaries
  that link back to the relevant project or notification targets.
- Send digests through `sendOutboundEmail`, recording safe metadata that
  identifies digest window, recipient user id, project id, notification count,
  and source notification ids without exposing secrets.
- Collapse repetitive activity from the same project/task/source type so several
  tags, comments, or assignments within a few minutes produce one grouped digest
  section instead of one email or one noisy line per raw notification.
- Enforce a quiet-window cadence: a project digest becomes eligible only when
  the latest eligible notification for that recipient/project is at least 30
  minutes old.
- Keep an additional rate limit so repeated scheduled dispatches cannot send
  more than one project digest per recipient/project inside the configured
  cadence window.
- Include a project-invitation reminder path for existing in-app invitation
  notifications: if the invited verified user has not opened/accepted/declined
  the invitation after 6 hours, send a reminder email. This reminder must reuse
  the existing invitation email template/delivery foundation and add separate
  reminder idempotency.
- Add a protected dispatch endpoint for scheduled execution. Protect it with a
  dedicated server-side secret and document the required runtime env contract.
- Document the production dispatch path. If Vercel Cron is used, add the repo
  cron config and note how preview/manual validation should invoke the same
  service safely.
- Keep notification reads/resolution user-driven; sending a digest or reminder
  must not mark notifications as read or resolved.

## Assumptions
- First release uses a 30-minute quiet window after the latest eligible
  recipient/project notification, plus a conservative scheduled dispatcher. This
  is not a literal per-user timer; the scheduler periodically selects groups
  whose latest activity is old enough.
- Regular activity digests include active project-scoped notification types with
  reliable `projectId` metadata: task comment mentions and task assignments.
- Project invitations are included only as delayed reminders for verified users
  who already have an in-app invitation notification and have not acted within 6
  hours. Initial invite email delivery and owner manual resend remain TASK-104
  behavior.
- Users do not get notification preference UI in this task. The first release
  uses verified account email addresses and global delivery-mode behavior from
  TASK-125.
- Digest dispatch failures should be recorded on outbound email delivery rows
  and in digest/reminder state without retrying in a tight loop. Automatic
  retry/backoff workers remain out of scope unless introduced by a later
  background-jobs task.

## Acceptance Criteria
1. `tasks/current.md` records TASK-225 scope, acceptance criteria, definition of
   done, assumptions, and validation evidence.
2. Prisma/PostgreSQL includes durable tracking that supports per-recipient,
   per-project windowing, idempotency, status, notification membership, and
   links to outbound email delivery attempts where available.
3. A service-layer digest collector selects only eligible unresolved/unread
   notifications for verified users, groups by recipient and project, and
   preserves project access boundaries.
4. A digest composer collapses repetitive notification activity and produces
   deterministic plain text and HTML content with safe escaping/sanitization.
5. The outbound email template contract includes a typed
   `project_notification_digest` template key and tests for the generated email
   shape.
6. Digest dispatch uses the TASK-125 outbound email service and records sent,
   skipped, and failed outcomes without logging secrets or raw provider
   credentials.
7. Quiet-window logic prevents sending a digest until the latest eligible
   notification in that recipient/project group is at least 30 minutes old.
8. Rate limiting prevents more than one digest or invitation reminder for the
   same recipient/project/source window when dispatch is called repeatedly.
9. Project invitation reminders are sent only for unresolved/unread existing
   invitation notifications that are at least 6 hours old and have not already
   produced a reminder for that invitation/recipient.
10. Sending a digest or reminder does not mutate notification `readAt` or
    `resolvedAt`; the notification center remains the source of truth.
11. A protected operational endpoint exists for running digest dispatch, with
    documented environment variables and safe local/preview invocation steps.
12. Focused tests cover eligibility filtering, grouping, collapse semantics,
    idempotency/rate limiting, successful sends, skipped delivery, provider
    failure handling, delayed invitation reminders, and endpoint authorization.
13. `README.md`, `docs/runbooks/vercel-env-contract-and-secrets.md`, and
    `journal.md` are updated with digest behavior, env/cron assumptions,
    validation outcomes, and any operational caveats.

## Definition Of Done
- Work runs on the dedicated TASK-225 branch/worktree and follows
  `1 task = 1 branch = 1 PR`.
- Persistence access remains inside `lib/services/**`; routes stay thin
  transport adapters.
- Runtime secrets flow through `lib/env.server.ts` and are documented without
  committing secret values.
- Local validation passes: `npm run lint`, `npm test`, `npm run test:coverage`,
  and `npm run build`.
- Focused digest tests pass and are named in validation evidence.
- The dispatch endpoint has an authorization-negative test and a safe manual
  dispatch smoke recorded.
- If UI-visible notification behavior changes, run the relevant Playwright smoke
  flow. If preview validation is required, use `PLAYWRIGHT_BASE_URL=<preview-url>`
  as documented in `agent.md` and `README.md`.
- Branch is pushed, PR is opened ready for review, required checks are green,
  Copilot review feedback is addressed or resolved, and the final handoff
  includes the delivered commit SHA or SHAs.
- A preview deploy is triggered from this branch via `deploy-vercel.yml` with an
  explicit `git_ref`, and preview validation sends real test email to
  `dorian.agaesse@gmail.com` without exposing credentials.

## Validation Evidence
- `npm ci` passed on 2026-05-08 in the TASK-225 worktree.
- `npx prisma generate` passed on 2026-05-08 after adding the TASK-225 digest
  tracking models.
- `npm run db:local:up` started a fresh local PostgreSQL container for the
  TASK-225 worktree.
- `npm run db:migrate` passed on 2026-05-08 against
  `postgresql://postgres:postgres@127.0.0.1:5432/nexusdash?schema=public`,
  applying all 34 migrations including
  `20260508110000_task225_project_notification_email_digests`.
- Focused validation passed on 2026-05-08:
  `npm test -- --run tests/lib/project-notification-email-service.test.ts tests/api/notification-email-dispatch.route.test.ts tests/lib/outbound-email-templates.test.ts tests/lib/env.server.test.ts`
  with 4 files and 76 tests passing.
- `npm run lint` passed on 2026-05-08.
- Full local DB `NODE_ENV=test npm test` passed on 2026-05-08 with 107 files
  passed, 2 skipped; 795 tests passed, 2 skipped.
- Full local DB `NODE_ENV=test npm run test:coverage` passed on 2026-05-08
  with 91.23% statements, 81.2% branches, 93.42% functions, and 91.75% lines.
- A first `npm run build` attempt passed TypeScript after two TASK-225 type
  fixes, then failed during page data collection because `NEXTAUTH_URL` was set
  without `NEXTAUTH_SECRET` in the local build shell.
- Production-guarded `npm run build` passed on 2026-05-08 with local
  PostgreSQL, `OUTBOUND_EMAIL_DELIVERY_MODE=disabled`, localhost trusted
  origins, local `AGENT_TOKEN_SIGNING_SECRET`, and local `NEXTAUTH_SECRET`.
- Pending: PR checks, Copilot review, branch preview deploy, and real preview
  email smoke to `dorian.agaesse@gmail.com`.

## Out Of Scope
- TASK-226 task due-date reminder emails.
- Per-user notification preference UI, unsubscribe management, bounce webhooks,
  suppression lists, or provider webhook processing.
- A general-purpose background job framework beyond the narrow digest dispatch
  path needed for this task.
- Marking notifications read/resolved as a side effect of email delivery.
