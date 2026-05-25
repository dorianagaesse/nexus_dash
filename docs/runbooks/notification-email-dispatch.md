# Notification Email Dispatch Runbook

This runbook covers the protected notification email dispatcher used by the
current GitHub Actions production bridge.

## Dispatcher Contract

- Endpoint: `GET /api/cron/notification-emails`
- Auth header: `x-notification-email-dispatch-secret`
- Secret source: `NOTIFICATION_EMAIL_DISPATCH_SECRET`, falling back to
  `CRON_SECRET`
- Production scheduler: `.github/workflows/notification-email-dispatch.yml`
  every 3 hours
- Manual workflow dispatch can target production or a preview URL

The dispatcher reconciles eligible notification sources, queues project email
groups, claims due groups, and sends recipient-level digest emails with project
sections. Email delivery never marks in-app notifications read or resolved.

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

## Production Smoke Plan

1. Create or identify a production test project visible to the target account.
2. Create an active task assigned to that account, or leave it unassigned if the
   account is the task creator.
3. Set the task due date to exactly 3 local calendar days from the smoke date.
4. Run the notification email dispatch workflow manually, or wait for the next
   3-hour scheduled run.
5. Confirm the dispatcher summary reports due-date reminder reconciliation and
   that one in-app reminder notification exists.
6. Let the digest send through the existing email queue and confirm the email
   includes a concise due-date reminder item.
7. Re-run the dispatcher for the same task/date and confirm no duplicate
   reminder notification or sent email is produced.
8. Mark the in-app notification read and confirm read state remains independent
   from the recorded email delivery.

Do not print or commit scheduler secrets, Resend provider payloads, or full
recipient tokens while collecting evidence.
