# Current Task: TASK-226 Task Due-Date Email Reminders

## Task ID
TASK-226

## Status
In Review

## Source
- Dedicated brief:
  `tasks/task-226-task-due-date-email-reminders.md`.
- Scheduler dependency satisfied by TASK-268, which added the GitHub Actions
  notification-email dispatcher bridge every 3 hours.

## Objective
Create durable, idempotent task due-date reminder notifications and route them
through the existing notification email orchestration so eligible users receive
one reminder when work is three calendar days from its deadline.

## Implementation Decisions
- Recipient: send to the task assignee when present; otherwise send to the task
  creator as the task owner fallback.
- Access: create no reminder unless that recipient is still the project owner or
  an active project member.
- Completion: exclude tasks in `Done` and archived tasks.
- Deadline window: compare date-only task deadlines to the local calendar date
  plus `TASK_DEADLINE_SOON_DAYS` (`3`) using the shared task-deadline helpers.
- Idempotency: use durable notification source
  `task_due_date_reminder` with source id
  `<taskId>:<recipientUserId>:<deadlineDate>`, so repeated scheduler runs and
  changing a deadline away and back to the same date do not create duplicate
  reminders for the same task/recipient/deadline window.
- Email path: queue the reminder notification into the existing
  `ProjectNotificationEmail` project digest pipeline instead of adding a second
  scheduler or email-only path.

## Scope
- Add task due-date reminder notification metadata/content mapping.
- Reconcile eligible deadline reminders during notification-email dispatch.
- Include due-date reminder items in the grouped project notification digest
  email copy.
- Keep API routes and cron handlers thin.
- Update docs and tests for the final behavior.

## Acceptance Criteria
1. A task due in three days creates exactly one reminder per eligible recipient
   for that task/deadline window.
2. Repeated scheduler/dispatcher calls do not create duplicate reminders or
   duplicate emails.
3. Completed or archived tasks do not generate due-date reminders.
4. Tasks without due dates do not generate due-date reminders.
5. Users without project access do not receive reminders.
6. Changing a task deadline is handled deterministically and covered by tests.
7. Reminder emails use the shared outbound email foundation and existing email
   delivery observability.
8. Reminder notification read/unread state stays independent from email delivery
   side effects.
9. Tests cover eligibility, idempotency, date-window boundaries, completed task
   exclusion, provider failure, and scheduler integration.
10. README, `journal.md`, `tasks/backlog.md`, and this file are updated with the
    final behavior.

## Definition Of Done
- Service changes stay inside `lib/services/**` except shared deadline helpers
  and presentation labels.
- The protected dispatch endpoint remains a thin adapter.
- Focused unit/API tests pass for deadline helpers, notification service,
  notification email orchestration, outbound templates, and the dispatch route.
- Local validation runs:
  - `npm run lint`
  - `npm test`
  - `npm run test:coverage`
  - `npm run build`
- A ready-for-review PR is opened, checks and Copilot review are monitored, and
  the final handoff includes delivered commit SHA(s).

## Validation Plan
- `git diff --check`
- `npm test -- --run tests/lib/task-deadline.test.ts tests/lib/notification-service.test.ts tests/lib/project-notification-email-service.test.ts tests/lib/outbound-email-templates.test.ts tests/api/notification-email-dispatch.route.test.ts`
- `npm run lint`
- `npm test`
- `npm run test:coverage`
- `npm run build`

## Validation Evidence
- `git diff --check` passed.
- Focused reminder/email tests passed: 5 files, 45 tests.
- `npm run lint` passed.
- `npm test` passed with local PostgreSQL env after migrations: 108 files
  passed, 827 tests passed, 2 skipped.
- `npm run test:coverage` passed: 91.23% statements, 81.2% branches, 93.42%
  functions, 91.75% lines.
- `npm run build` passed with local runtime placeholder secrets.

## Out Of Scope
- Scheduler provisioning; TASK-268 owns the active production bridge.
- Notification actor attribution/self-notification cleanup; TASK-265 owns that.
- Reminder preference UI, unsubscribe controls, or instant push delivery.
