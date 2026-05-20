# TASK-268 GitHub Actions Notification Email Scheduler

Date: 2026-05-19
Branch: `feature/task-268-github-actions-notification-email-scheduler`

## Summary

Replace the pending QStash scheduler path with a simpler production bridge:
GitHub Actions invokes the protected notification email dispatcher every three
hours. This deliberately downgrades the delivery promise from the original
TASK-227 one-hour maximum delay target to an early-production periodic digest
model while preserving the production-grade parts that already exist in the
app: durable DB-backed email state, idempotent dispatch, protected endpoint
authorization, recipient/project grouping, provider delivery records, and
manual smoke support.

## Decision

QStash is abandoned for now. It created too much operational friction for the
current stage of the project. Vercel remains on Hobby, so Vercel Cron cannot run
more than once per day. GitHub Actions scheduled dispatch is acceptable as a
temporary production scheduler because notification email delivery is useful
even when it is periodic rather than near-real-time.

The production contract becomes:

- Dispatch runs every 3 hours through GitHub Actions.
- GitHub Actions calls `GET /api/cron/notification-emails`.
- The workflow sends `x-notification-email-dispatch-secret`.
- The app remains responsible for idempotency and safe concurrency.
- Manual workflow dispatch remains available for diagnostics and preview smoke.

## Product Promise

For this bridge, notification email delivery is:

- grouped
- idempotent
- protected
- eventually delivered by scheduled production dispatch

It is not guaranteed to arrive within one hour. The expected practical delivery
window is the debounce window plus up to one scheduled cadence and any GitHub
Actions scheduling delay.

## Acceptance Criteria

1. `.github/workflows/notification-email-dispatch.yml` runs on a 3-hour
   schedule and still supports manual dispatch.
2. Scheduled dispatch defaults to `https://nexus-dash.app`.
3. Manual dispatch can still override the target URL for preview or diagnostic
   runs.
4. The workflow uses `NOTIFICATION_EMAIL_DISPATCH_SECRET` or `CRON_SECRET`
   without exposing secret values.
5. QStash is no longer presented as the active next scheduler task in
   `tasks/backlog.md`, `tasks/current.md`, README, or runbooks.
6. TASK-228 is marked superseded by this task rather than left as the active
   next step.
7. Documentation clearly states the 3-hour delivery caveat and why it is
   accepted.
8. CI and Copilot review complete cleanly.

## Validation Plan

- `git diff --check`
- Review workflow syntax and documentation for stale QStash-as-next-step
  language.
- Let GitHub PR checks run.
- After merge, confirm the workflow appears with both schedule and manual
  dispatch triggers.
- After production deployment, either wait for the next scheduled run or run
  the workflow manually once against production and verify a successful
  dispatcher response.

## Out Of Scope

- Implementing QStash or any other managed scheduler.
- Changing notification email grouping/debounce business logic.
- Implementing due-date reminders; that remains TASK-226 after scheduler
  activation.
- Changing actor attribution or self-notification rules; that remains TASK-265.
