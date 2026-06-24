# Notification Email Dispatch Runbook

This runbook covers the protected notification email dispatcher used by the
current GitHub Actions production bridge.

For the full GitHub Actions workflow inventory and permissions contract, see
`docs/runbooks/github-actions-workflows.md`.

## Dispatcher Contract

- Endpoint: `GET /api/cron/notification-emails`
- Auth header: `x-notification-email-dispatch-secret`
- Secret source: `NOTIFICATION_EMAIL_DISPATCH_SECRET`, falling back to
  `CRON_SECRET`
- Production scheduler: `.github/workflows/notification-email-dispatch.yml`
  every 30 minutes
- Manual workflow dispatch can target production or a preview URL

The dispatcher reconciles eligible notification sources, including task due-date
reminders and meeting-todo overdue reminders, queues project email groups,
claims due groups, and sends recipient-level digest emails with project
sections. Email delivery never marks in-app notifications read or resolved.
Each successful dispatcher response includes scheduler-lag metrics for claimed
groups so operators can compare actual claim time with each group's
`sendAfterAt`.

## Active Cadence

The current no-new-cost production path is a 30-minute GitHub Actions schedule.
It keeps NexusDash on the app-owned durable email queue while reducing the
previous 3-hour batching effect.

Expected timing:

- project activity waits for the 30-minute quiet window, capped by the existing
  60-minute max-delay window;
- once a group is due, the scheduler should normally claim it within one
  30-minute cadence plus normal GitHub scheduling delay;
- task due-date reminders and meeting-todo overdue reminders are reconciled on
  each dispatcher run, so they remain reliable for same-day delivery without
  promising an exact minute.

Residual limitation: GitHub scheduled workflows are still a best-effort trigger,
not a hard real-time queue worker. If scheduler lag becomes unacceptable,
TASK-273's future decision point is to move the trigger to QStash, Vercel Pro
Cron, or another managed scheduler while keeping the same dispatcher.

## Due-Date Reminder Behavior

Task due-date reminders are created during dispatcher reconciliation when a task
is exactly 3 local calendar days from its date-only `deadlineAt`.

Eligibility:

- send to the task assignee when one exists
- otherwise send to the task creator
- require that recipient to still be the project owner or a project member
- skip tasks in `Done`
- skip archived tasks
- skip tasks without a deadline

Idempotency key:

```text
sourceType: task_due_date_reminder
sourceId: <taskId>:<recipientUserId>:<deadlineDate>
```

That makes each task, recipient, and deadline date produce at most one reminder
notification/email window. Moving a task to a different eligible due date creates
a new window. Moving it away and back to the same date reuses the original
window.

## Meeting-Todo Overdue Reminder Behavior

Meeting-todo overdue reminders are created during dispatcher reconciliation when
a meeting-note action is still incomplete seven or more local calendar days
after the parent note's `scheduledAt` meeting date.

Eligibility:

- send to the meeting-note creator
- require that recipient to have a verified email address
- require that recipient to still be the project owner or a project member
- skip actions that already have `completedAt`
- skip notes without `scheduledAt`
- skip notes in the archived `done` lifecycle state

Idempotency key:

```text
sourceType: meeting_todo_overdue_reminder
sourceId: <actionId>:<recipientUserId>:<scheduledDate>
```

That makes each meeting todo, recipient, and scheduled meeting date produce at
most one reminder notification/email window. If a meeting note is rescheduled to
a different date and remains overdue, the new scheduled date creates a distinct
window. Completing a todo stops new reminder discovery for that action.

## Production Smoke Plan

1. Create or identify a production test project visible to the target account.
2. Create an active task assigned to that account, or leave it unassigned if the
   account is the task creator.
3. Set the task due date to exactly 3 local calendar days from the smoke date.
4. Run the notification email dispatch workflow manually, or wait for the next
   30-minute scheduled run.
5. Confirm the dispatcher summary reports due-date reminder reconciliation and
   that one in-app reminder notification exists. In the workflow summary, also
   review `Scheduler lag groups measured`, `Max scheduler lag minutes`, and
   `Average scheduler lag minutes`.
6. Let the digest send through the existing email queue and confirm the email
   includes a concise due-date reminder item.
7. Re-run the dispatcher for the same task/date and confirm no duplicate
   reminder notification or sent email is produced.
8. Mark the in-app notification read and confirm read state remains independent
   from the recorded email delivery.

Do not print or commit scheduler secrets, Resend provider payloads, or full
recipient tokens while collecting evidence.

## Meeting-Todo Reminder Smoke Plan

1. Create or identify a preview or production test project visible to the target
   account.
2. Create a meeting note owned by that account with `scheduledAt` at least seven
   local calendar days in the past.
3. Add one incomplete meeting todo/action and keep the note out of the `done`
   lifecycle state.
4. For preview validation, set outbound email delivery to a safe disabled/skip
   mode unless an explicit test recipient and sender configuration are intended.
5. Run the notification email dispatch workflow manually against the target
   origin, or wait for the next 30-minute scheduled run in production.
6. Confirm the dispatcher summary reports
   `meetingTodoOverdueRemindersReconciled` greater than zero and that one
   in-app reminder notification exists for the todo.
7. Confirm the queued/sent/skipped digest includes a concise meeting-todo item
   and records the outbound delivery outcome through the normal delivery log.
8. Re-run the dispatcher for the same todo/date and confirm no duplicate
   reminder notification or sent email is produced.
