# TASK-226 Task Due-Date Email Reminders

Date: 2026-05-16
Branch: `feature/task-226-task-due-date-email-reminders`

## Summary

Implement task due-date reminder business logic so users receive a predictable
email reminder when assigned or owned work is three days from its due date.

This task should start only after TASK-268 has activated a production scheduler.
The reminder logic should reuse the production-grade outbound email and
notification email orchestration foundations instead of inventing a separate
cron-only path.

## Product Intent

Users should be nudged before work becomes urgent, without repeated reminder
spam.

Default product rule:

- Send one reminder per task, recipient, and due-date window when the task is
  three calendar days from its deadline.
- If a due date changes, treat the new deadline as a new reminder window only
  when it becomes eligible again.
- Do not send reminders for completed work.
- Do not send reminders to users who no longer have access to the project.
- Do not send reminders on every app visit or every scheduler invocation.

## Current Context

- Tasks currently store `deadlineAt` as a date-only value.
- Existing task APIs expose `deadlineDate`.
- TASK-227 added notification email orchestration with durable grouping,
  debounce, idempotent delivery recording, and a protected dispatcher.
- TASK-268 owns the production scheduler needed to call the dispatcher
  automatically.
- The in-app notification center should remain the durable source of truth for
  notification email delivery unless this task deliberately documents and
  justifies an email-only exception.

## Design Recommendation

Prefer creating a durable in-app notification for each eligible task reminder,
then queueing that notification into the existing notification email
orchestration.

Suggested source identity:

```text
sourceType: task_due_date_reminder
sourceId: <taskId>:<recipientUserId>:<deadlineDate>
```

Suggested notification type:

```text
task_due_date_reminder
```

Suggested metadata:

- `taskId`
- `taskTitle`
- `projectId`
- `projectName`
- `recipientUserId`
- `deadlineDate`
- `daysUntilDue`
- `targetPath`

If the final implementation uses a separate reminder table instead, it must
still provide durable idempotency and clear observability equivalent to the
notification/email state used by TASK-227.

## Eligibility Questions To Resolve In Code

Before implementation, inspect the data model and decide:

- Who receives reminders?
  - assigned user if the task has an assignee
  - owner/creator when there is no assignee
  - both owner and assignee only if that matches existing product language
- Which statuses count as completed?
  - likely exclude `Done`
  - confirm current task status enum/constants
- How date-only deadlines are interpreted across time zones.
  - Prefer calendar-day comparison through existing `lib/task-deadline` helpers
    if they fit.
- How reminder idempotency behaves if the deadline changes away and then back.

Record the decisions in `tasks/current.md` and `journal.md` before coding.

## Files To Inspect First

- `agent.md`
- `tasks/current.md`
- `tasks/backlog.md`
- `project.md`
- `README.md`
- `lib/task-deadline.ts`
- `lib/services/project-task-service.ts`
- `lib/services/notification-service.ts`
- `lib/services/project-notification-email-service.ts`
- `lib/services/outbound-email-templates.ts`
- `app/api/cron/notification-emails/route.ts`
- `prisma/schema.prisma`
- tests for task deadlines, task service, notification service, email
  orchestration, and dispatch endpoint

## Implementation Guidance

1. Start from TASK-268's scheduler reality. Do not build a second unrelated
   scheduler.
2. Add task reminder notification type and metadata mapping in the service
   layer.
3. Add a reminder discovery/reconciliation function that finds reminders due in
   the three-day window.
4. Make reminder discovery idempotent under repeated scheduler calls and safe
   under concurrent invocations.
5. Queue reminder notifications into the existing email orchestration.
6. Extend email templates with concise due-date reminder copy.
7. Ensure reminders do not mark existing notifications read/resolved.
8. Keep API routes and cron handlers thin.
9. Keep persistence access inside `lib/services/**`.
10. Add a production smoke plan that does not expose secrets.

## Acceptance Criteria

1. A task due in three days creates exactly one reminder per eligible recipient
   for that task/deadline window.
2. Repeated scheduler/dispatcher calls do not create duplicate reminders or
   duplicate emails.
3. Completed tasks do not generate due-date reminders.
4. Tasks without due dates do not generate due-date reminders.
5. Users without project access do not receive reminders.
6. Changing a task deadline is handled deterministically and is covered by
   tests.
7. Reminder emails use the shared outbound email foundation and existing email
   delivery observability.
8. Reminder notifications, if created in-app, remain unread/read independent of
   email delivery.
9. Tests cover eligibility, idempotency, date-window boundaries, completed task
   exclusion, provider failure, and scheduler integration.
10. README, runbook, `journal.md`, `tasks/backlog.md`, and `tasks/current.md`
    are updated with the final behavior.

## Validation Plan

Local and CI:

- `npm run lint`
- `npm test`
- `npm run test:coverage`
- `npm run build`

Focused tests to add or update:

- `tests/lib/task-deadline.test.ts`
- `tests/lib/notification-service.test.ts`
- `tests/lib/project-notification-email-service.test.ts`
- `tests/lib/outbound-email-templates.test.ts`
- route or service tests for scheduler/dispatcher integration

Production smoke after merge/deploy:

1. Create or identify a production test project and task visible to
   `dorian.agaesse@gmail.com`.
2. Set the task due date to exactly three calendar days from the smoke date.
3. Let the scheduler run.
4. Confirm one reminder notification/email is created.
5. Re-run or wait for another scheduler cycle.
6. Confirm no duplicate reminder is sent.
7. Mark the in-app notification read and confirm email delivery did not depend
   on read state.

## Out Of Scope

- Scheduler provisioning; that is TASK-268.
- Actor attribution/self-notification cleanup; that is TASK-265.
- Instant in-app push delivery; that is TASK-263.
- Reminder preference UI or unsubscribe/suppression preferences unless required
  by a legal/compliance decision.

## Validation Evidence

2026-05-22 implementation evidence:

- `git diff --check`
- focused reminder/email tests: 5 files, 45 tests
- `npm run lint`
- local PostgreSQL env `npm test`: 108 files passed, 827 tests passed, 2
  skipped
- `npm run test:coverage`: 91.23% statements, 81.2% branches, 93.42%
  functions, 91.75% lines
- local placeholder runtime env `npm run build`
