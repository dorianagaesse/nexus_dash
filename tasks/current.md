# Current Task: TASK-226 Due-Date Reminder Production RLS Fix

## Task ID
TASK-226

## Status
Active

## Source
- Production smoke after TASK-226/TASK-265 promotion created tasks due within
  three days, but `GET /api/cron/notification-emails` returned
  `dueDateRemindersReconciled: 0`.
- Dedicated brief:
  `tasks/task-226-task-due-date-email-reminders.md`.

## Objective
Restore production due-date reminder reconciliation so the scheduler can find
eligible tasks under row-level security, create the durable reminder
notification, and queue the notification email without depending on an
unauthenticated global scan.

## Current Baseline
- The merged TASK-226 implementation scans due tasks through a global raw SQL
  query.
- Production RLS hides task rows from that global scan, so due-date candidates
  are not discovered.
- The previous due-date reminder creation path also relied on the later global
  notification reconciliation pass to queue email delivery.

## Scope
- Run due-date candidate discovery per verified recipient under that
  recipient's RLS context.
- Queue the due-date reminder notification immediately in the same actor
  context after creation.
- Preserve existing idempotency: one reminder per task, recipient, and due-date
  window, with pending/dispatching/sent email coverage suppressing repeats.
- Add focused regression coverage for the production RLS-shaped behavior.

## Acceptance Criteria
1. Production scheduler discovery no longer depends on reading RLS-protected
   task rows without an actor context.
2. A due task for a verified recipient creates or reuses the due-date reminder
   notification and queues it into the shared email orchestration.
3. Repeated scheduler calls do not duplicate pending, dispatching, or sent
   reminder emails for the same task/recipient/deadline window.
4. Completed, archived, undated, inaccessible, or unverified-recipient tasks
   remain ineligible.
5. Focused tests cover recipient-scoped discovery and immediate email queueing.

## Definition Of Done
- Service and test changes are scoped to TASK-226 reminder reconciliation.
- `tasks/backlog.md`, `tasks/current.md`, and `journal.md` reflect the
  production fix.
- Validation passes or any blocker is documented.
- A ready-for-review PR is opened, automated checks/review are monitored, and
  the handoff includes delivered commit SHA(s).

## Validation Plan
- `npm test -- --run tests/lib/project-notification-email-service.test.ts`
- `npm run lint`
- `npm test`
- `npm run test:coverage`
- `npm run build`

## Validation Evidence
- `npm test -- --run tests/lib/project-notification-email-service.test.ts`
  passed: 1 file, 19 tests.
- `git diff --check` passed.
- `npm run lint` passed.
- With local PostgreSQL env, `npm test` passed: 108 files passed, 832 tests
  passed, 2 skipped.
- With local PostgreSQL env, `npm run test:coverage` passed: 91.23%
  statements, 81.2% branches, 93.42% functions, 91.75% lines.
- With local PostgreSQL and preview-style runtime env, `npm run build` passed.
- After Copilot review, paginated verified recipient scanning was added.
  Follow-up validation passed: focused test file, `git diff --check`,
  `npm run lint`, local PostgreSQL `npm test` (108 files passed, 833 tests
  passed, 2 skipped), local PostgreSQL `npm run test:coverage`, and
  preview-style `npm run build`.

## Out Of Scope
- Scheduler cadence or GitHub Actions workflow changes.
- Actor attribution/self-notification changes from TASK-265.
- Email preference or unsubscribe behavior.
