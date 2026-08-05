# TASK-355: Meeting-todo overdue grace experiment

## Status

Reverted on 2026-08-05 by PR #416. The product policy is again a seven-day
grace period.

## Outcome

PR #414 temporarily reduced the grace period to 24 hours. Product direction
subsequently restored the established seven-day policy across the meeting-todo
helper, project Todos list, navigation badge, dashboard copy, notification
candidate cutoff, reminder copy, metadata, and tests.

The useful consistency work remains: every runtime consumer derives its
threshold from `MEETING_TODO_OVERDUE_GRACE_DAYS`, and the notification query
uses the same precise rolling cutoff as the UI. There is no retained one-day
runtime branch, fallback, or duplicate grace constant.

## Verification

- `MEETING_TODO_OVERDUE_GRACE_DAYS` is `7`.
- The notification dispatcher derives its threshold from that shared constant.
- Boundary coverage verifies exactly seven days and one millisecond before it.
- Archived meetings and completed todos remain excluded from overdue status.
- User-facing dashboard and reminder copy both say seven days.
