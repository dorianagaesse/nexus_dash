# TASK-271: Notification Email Delivery Deduplication

## Objective
Prevent already-emailed notifications from being emailed again on later
scheduled dispatcher runs. A notification email should be a delivery event for
the covered notification IDs, not a recurring reminder while the in-app
notifications remain unread.

## Context
- The production scheduler currently runs every 3 hours.
- Users should receive email for future eligible notifications, not repeated
  emails for the same unread notifications.
- In-app notification read/resolved state remains independent: sending email
  must not mark notifications read or resolved.

## Acceptance Criteria
1. Once a project digest or invitation reminder is sent for a notification,
   that notification ID is no longer eligible for a future email dispatch.
2. Pending or currently dispatching groups still use the current notification
   fingerprint so refreshes before delivery can be folded into the pending
   email.
3. Future distinct notifications remain eligible for normal debounce/grouping.
4. Stale pending groups that were created before the fix do not send if their
   notifications have already been sent by another group.
5. The behavior is covered by focused service tests.

## Definition Of Done
- The service-level coverage logic distinguishes sent items from
  pending/dispatching items.
- Tests prove sent notification IDs are suppressed from future dispatch while
  pending fingerprints remain current-sensitive.
- Relevant validation is run and the branch is opened as a focused PR.
