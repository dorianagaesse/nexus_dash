# Current Task: TASK-271 Notification Email Delivery Deduplication

## Task ID
TASK-271

## Status
Active

## Source
- User report after PR #274 merged: production sent repeated notification
  reminder emails for already-emailed unread notifications.
- Dedicated brief:
  `tasks/task-271-notification-email-delivery-deduplication.md`.

## Objective
Prevent already-emailed notifications from being emailed again by later
scheduled dispatcher runs. Email dispatch should cover notification IDs once,
while future distinct notifications continue through the existing
debounce/grouping pipeline.

## Current Baseline
- Notification email groups are durable and the scheduler runs every 3 hours.
- Email sending intentionally does not mark in-app notifications read or
  resolved.
- The current coverage logic is fingerprint-sensitive, which is useful for
  pending refreshes but too strict once an email has already been sent or
  skipped.

## Scope
- Tighten service-layer notification email coverage checks.
- Add focused regression tests for already-delivered notification IDs.
- Keep in-app notification read/resolved semantics unchanged.
- Keep scheduler cadence and workflow behavior unchanged.

## Acceptance Criteria
1. Sent/skipped notification email items suppress future email dispatch by
   notification ID, even if the notification row is later updated.
2. Pending/dispatching items still require the current fingerprint or timestamp
   so pre-send notification refreshes can update the pending group.
3. Future distinct notification rows remain eligible for email delivery.
4. Focused service tests cover the delivered/skipped suppression behavior.

## Definition Of Done
- Service changes are minimal and scoped to notification email coverage logic.
- Tests and relevant validation pass.
- `tasks/backlog.md`, `tasks/current.md`, and `journal.md` reflect the fix.
- A PR is opened, Copilot/check feedback is monitored, and the handoff includes
  delivered commit SHA(s).

## Validation Plan
- `git diff --check`
- `npm test -- --run tests/lib/project-notification-email-service.test.ts`
- `npm run lint`
- `npm test`
- `npm run test:coverage`
- `npm run build`

## Out Of Scope
- Changing the 3-hour scheduler bridge.
- Marking in-app notifications read/resolved after email delivery.
- Changing actor attribution or self-notification behavior from TASK-265.
