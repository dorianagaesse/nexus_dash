# Current Task: TASK-314 Meeting Todo Overdue Reminders

## Task ID
TASK-314

## Status
Implemented locally. Awaiting branch push, PR review, CI, and preview
validation.

## Branch
`feature/task-314-meeting-todo-overdue-reminders`

## Source
- User feedback on TASK-098 on 2026-06-10.
- `tasks/task-314-meeting-todo-overdue-reminders.md`

## Objective
Add durable in-app and email reminders for open meeting-note todos that remain
incomplete seven or more days after the meeting date, using the existing
notification email dispatcher and queue semantics.

## Context
- TASK-098 added `ProjectMeetingNote` and `ProjectMeetingNoteAction`, including
  meeting dates, action completion state, labels, lifecycle state, and UI-level
  overdue highlighting.
- TASK-316 added a project-wide floating panel for open meeting todos and a
  focused action-completion API path.
- The notification email dispatcher already reconciles task due-date reminders
  during `GET /api/cron/notification-emails`, creates durable `Notification`
  rows, queues `ProjectNotificationEmail` groups, honors outbound email skip
  modes, and records delivery outcomes.
- Current scheduler bridge: `.github/workflows/notification-email-dispatch.yml`
  calls the protected dispatcher every 30 minutes.

## Scope
- Identify incomplete `ProjectMeetingNoteAction` rows whose parent note has a
  scheduled meeting date at least seven local calendar days in the past.
- Send the reminder to the meeting-note owner/creator while they still have
  access to the project.
- Create one durable in-app notification per eligible meeting todo and reminder
  window.
- Queue the notification through the existing project notification email digest
  path so delivery, skipped mode, grouping, and logging remain consistent.
- Extend dispatcher summaries, runbooks, and tests so operators can distinguish
  task due-date reminder reconciliation from meeting-todo overdue reconciliation.
- Preserve existing meeting-note UI behavior; this task is about durable
  reminders and delivery, not a redesign of the floating panel or note editor.

## Implementation Notes
- Start with:
  - `lib/services/project-notification-email-service.ts`
  - `lib/services/notification-service.ts`
  - `lib/services/project-meeting-note-service.ts`
  - `prisma/schema.prisma`
  - `docs/runbooks/notification-email-dispatch.md`
  - `tests/lib/project-notification-email-service.test.ts`
  - `tests/lib/notification-service.test.ts`
  - `tests/api/notification-email-dispatch.route.test.ts`
- Prefer a durable per-action reminder state if notification/email history alone
  cannot express "same todo, same seven-day window" clearly enough for
  idempotency and future re-reminder decisions.
- If adding persistence, include Prisma migration, RLS inventory/policy updates,
  and indexes that support dispatcher scans without broad project reads.
- Keep persistence access inside `lib/services/**`; the cron route should remain
  a thin auth and response adapter.
- Reuse the task due-date reminder source-id pattern, but use a distinct
  notification `type` and `sourceType`, such as
  `meeting_todo_overdue_reminder`.
- The email digest item should be concise and actionable, with metadata that can
  build a target URL back to the project/meeting context.
- Preview validation must use disabled or safe outbound email behavior unless an
  explicit test recipient is intentionally configured.

## Acceptance Criteria
1. A service can find meeting-note todos that are incomplete seven or more days
   after the parent note's scheduled meeting date.
2. Reminder dispatch is idempotent per todo and reminder window.
3. The owning meeting-note user receives a durable in-app notification/reminder
   record while they still have project access.
4. The reminder is queued and sent/skipped through the existing notification
   email dispatcher, outbound email mode controls, and delivery logging.
5. Dispatcher responses and runbooks document how meeting-todo overdue
   reminders are triggered manually and by the scheduler bridge.
6. Tests cover overdue selection, idempotency, email payload shape, skipped
   delivery behavior, and permission/tenancy boundaries.

## Definition Of Done
- [x] Existing notification-email services, scheduler workflow, and runbook are
      reviewed.
- [x] Reminder eligibility is implemented in the service layer with project and
      recipient access checks.
- [x] Persistence changes, if needed, are added through Prisma migrations and
      RLS inventory/policy updates. No new persistence table was needed; the
      existing `Notification` unique key and email item coverage provide the
      durable per-window idempotency record.
- [x] In-app notification metadata and email digest rendering support
      meeting-todo overdue reminders.
- [x] API/cron dispatcher output includes meeting-todo reminder reconciliation
      evidence.
- [x] Tests cover service, API/scheduler, email grouping/rendering, skipped
      delivery, and tenancy behavior.
- [x] Documentation explains local, preview, and production reminder behavior.
- [ ] Preview validation proves the reminder path can run safely without sending
      unintended external email.

## Validation Plan
- [x] `npm run lint`
- [x] `npm run rls:check`
- [x] `npm test`
- [x] `npm run test:coverage`
- [x] `npm run build`
- Run focused notification dispatcher and meeting-note tests during development.
- If Prisma/RLS changes are introduced, also run:
  - `npm run test:rls:setup`
  - `npm run test:rls`
- For preview validation, dispatch the notification email workflow with
  `git_ref=feature/task-314-meeting-todo-overdue-reminders`, confirm logs check
  out that ref, and capture the dispatcher summary plus safe outbound email
  outcome.
