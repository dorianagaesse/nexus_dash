# Current Task: TASK-227 Production-Grade Notification Email Orchestration

## Task ID
TASK-227

## Status
Done via PR #254. Production scheduler activation for the non-upgraded Vercel
Hobby plan is tracked separately as TASK-228.

## Objective
Own the project notification email dispatch feature end to end and turn the
TASK-225 digest/reminder work into production-grade notification email
orchestration. Users should receive useful email about project activity without
being spammed, especially when they belong to many projects or agent activity
creates bursts of mentions and assignments.

## Context And Audit Notes
- TASK-123 shipped the in-app notification center, which remains the source of
  truth. Email delivery must not mark notifications read or resolved.
- TASK-125 shipped the reusable outbound email foundation and
  `OutboundEmailDelivery` records.
- TASK-225/PR #246 added useful digest/reminder service code, templates, tests,
  and a protected endpoint, but its dispatcher scanned notifications at send
  time, had no durable pending debounce queue, sent per project rather than
  recipient-level project sections, and made GitHub Actions the primary
  scheduler after Vercel Hobby rejected `*/15` cron.
- PR #252 usefully identified production failure evidence and hardened endpoint
  auth, but it still preserved GitHub Actions as the primary scheduler. Keep the
  header-parsing lesson; do not keep the scheduler as the production design.
- Recent run evidence:
  - run `25752062859` failed before reaching the app because dispatch URL and
    secret were empty in the workflow context.
  - run `25826658473` on `fix/task-225-notification-dispatch-workflow` reached
    Vercel deployment protection and returned 401 HTML.
  - run `25826921991` on `main` still returned 401 through the bearer path.
- Current Vercel docs confirm Hobby cron is daily only; a sub-hour scheduler
  needs Vercel Pro Cron or an external managed scheduler. TASK-227 documents
  this blocker and removes GitHub Actions as the production scheduler.

## Product Behavior
- Email-eligible project activity is grouped by recipient, project, and delivery
  kind.
- New eligible activity creates or refreshes a pending group instead of sending
  immediately.
- Project activity groups use debounce timing:
  - quiet window: 30 minutes by default
  - max delay: 60 minutes from the first unsent activity in the group
  - `sendAfterAt = min(latestPendingNotificationAt + quietWindow,
    firstPendingNotificationAt + maxDelay)`
- If several project groups are due for a recipient in one dispatcher run, send
  one recipient-level email with project sections.
- Invitation reminders are due once an invited verified user has not opened,
  accepted, declined, or otherwise resolved the invitation notification for 6
  hours. Reminder idempotency is once per invitation/recipient reminder window.
- TASK-226 owns task due-date reminder business logic. This task leaves a clean
  extension point but does not implement due-date reminders.

## Scheduler Decision
- Preferred production scheduler: Vercel Cron on a plan that supports sub-hour
  cadence, configured to invoke the protected endpoint on production only.
- Current blocker: Vercel Hobby cron rejects sub-daily schedules, so the current
  account cannot deploy the required cadence through Vercel Cron.
- Production alternative when the account stays on Hobby: use a managed HTTP
  scheduler with retries/visibility, such as Upstash QStash Schedule, to invoke
  the same protected endpoint. GitHub Actions remains only as manual diagnostic
  tooling, not the primary production scheduler.
- Preview validation manually invokes the protected endpoint/service because
  Vercel Cron runs only on production deployments.

## Acceptance Criteria
1. Durable DB-backed notification email state tracks grouping key, first pending
   notification time, latest pending notification time, send-after time,
   max-send time, status, source notification membership/idempotency, claim
   state, and outbound delivery correlation.
2. Email-eligible notification creation/refresh paths update the correct pending
   group in the service layer.
3. Normal project activity is delayed until quiet, but no later than about one
   hour from the first unsent activity.
4. Dispatcher safely claims due groups and is idempotent under repeated or
   concurrent invocations.
5. Due groups are batched into recipient-level emails with concise project
   sections when multiple projects are ready together.
6. Email content is deterministic, safely escaped, and concise for bursty
   agent-generated activity.
7. Provider sent/skipped/failed outcomes are recorded through TASK-125 outbound
   delivery records and linked back to orchestration groups without logging
   secrets.
8. Invitation reminders are sent only after 6 hours of no user action and only
   once per invitation/recipient reminder window.
9. Sending email does not mutate notification `readAt` or `resolvedAt`.
10. Runtime secrets flow through `lib/env.server.ts`; routes/cron endpoints stay
    thin and persistence access stays in `lib/services/**`.
11. GitHub Actions scheduled dispatch is demoted to manual diagnostics, and docs
    explain the production scheduler decision.
12. Focused tests cover debounce timing, max delay, grouping by project,
    multi-project recipient batching, idempotency, concurrent claim behavior,
    invitation reminders, provider failure, and endpoint authorization.
13. README, env runbook, journal, backlog, and current task docs are updated
    with behavior, ops, validation, and caveats.

## Definition Of Done
- Work remains on
  `feature/task-227-production-grade-notification-email-orchestration`.
- Local validation passes: `npm run lint`, `npm test`,
  `npm run test:coverage`, and `npm run build`.
- Focused notification email orchestration tests pass and are named in
  validation evidence.
- Playwright is run only if UI-visible behavior changes.
- A safe real-smoke plan for `dorian.agaesse@gmail.com` is documented without
  exposing secrets.
- Branch is pushed, a ready-for-review PR is opened, CI is monitored, Copilot
  review feedback is inspected and addressed/resolved, and final handoff
  includes PR URL, commit SHA(s), validation results, scheduler decision, and
  operational caveats.

## Validation Plan
- Focused:
  - `npm test -- --run tests/lib/project-notification-email-service.test.ts tests/api/notification-email-dispatch.route.test.ts tests/lib/outbound-email-templates.test.ts tests/lib/env.server.test.ts`
- Baseline:
  - `npm run lint`
  - `npm test`
  - `npm run test:coverage`
  - `npm run build`
- Preview/manual smoke:
  - deploy preview with explicit `git_ref=<branch>` if live endpoint validation
    is needed
  - confirm workflow logs checked out the branch ref
  - create mention/assignment activity for `dorian.agaesse@gmail.com`
  - invoke the protected dispatch endpoint after the debounce window using a
    secret supplied outside the repo

## Validation Evidence
- `npm ci` passed and generated Prisma Client.
- `npx prisma validate` passed.
- Focused orchestration validation passed:
  `npm test -- --run tests/lib/project-notification-email-service.test.ts tests/api/notification-email-dispatch.route.test.ts tests/lib/outbound-email-templates.test.ts tests/lib/env.server.test.ts`
  with 4 files and 81 tests initially, then 83 tests after Copilot review
  fixes.
- Focused notification producer regression passed:
  `npm test -- --run tests/lib/notification-service.test.ts tests/api/task-comments.route.test.ts tests/api/task-update.route.test.ts`
  with 3 files and 41 tests.
- `npm run lint` passed.
- First plain `npm test` failed because this shell lacked `DATABASE_URL`; reran
  with documented local PostgreSQL env.
- `npm run db:local:up` could not bind port `5432` because an existing local
  PostgreSQL container was already using it; used the existing
  `127.0.0.1:5432` service instead.
- `npm run db:migrate` passed against
  `postgresql://postgres:postgres@127.0.0.1:5432/nexusdash?schema=public`,
  applying `20260513120000_task227_notification_email_orchestration`.
- Local DB `NODE_ENV=test npm test` passed with 107 files passed, 2 skipped;
  800 tests passed, 2 skipped initially, then 802 tests passed, 2 skipped after
  Copilot review fixes.
- Local DB `NODE_ENV=test npm run test:coverage` passed with 91.23% statements,
  81.2% branches, 93.42% functions, and 91.75% lines.
- First `npm run build` attempt failed because the inherited shell had
  `NEXTAUTH_URL` without an effective matching `NEXTAUTH_SECRET`; reran with
  both explicitly set.
- Production-guarded `npm run build` passed with local PostgreSQL, disabled
  outbound delivery mode, localhost trusted origins, local agent signing secret,
  local Google token key, and explicit `NEXTAUTH_URL`/`NEXTAUTH_SECRET`.
- Copilot review fixes replayed all migrations against a fresh temporary local
  database `nexusdash_task227_migration_check`; `npm run db:migrate` applied
  all 35 migrations successfully, then the temporary database was dropped.

## Out Of Scope
- TASK-226 task due-date reminder business rules.
- User notification preference UI, unsubscribe management, bounce webhooks, and
  suppression-list UX.
- A broad background job framework unrelated to notification email dispatch.
- Marking in-app notifications read/resolved as a side effect of email sending.
