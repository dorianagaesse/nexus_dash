# Current Task: TASK-263 Real-Time Notification Updates

## Task ID
TASK-263

## Status
Backlog captured on dedicated worktree `../nexus_dash_task263` and branch
`feature/task-263-realtime-notification-updates`.

## Source
- Follow-up after PR #262 made in-app notifications atomic and kept grouped
  digest behavior email-only.
- User confirmed that instant push-style updates are a separate architecture
  concern from the email digest feature.
- Existing related task: TASK-118 covers broader realtime project refresh.

## Objective
Capture a dedicated notification realtime task that can update the notification
center, unread counts, and in-app awareness banner without navigation/manual
refresh, while reusing or aligning with the broader TASK-118 realtime
transport decision.

## Product Decision
In-app notifications should remain atomic rows: one notification per
assignment, mention, invitation, or future notification-producing action.
Realtime delivery, if implemented, changes how quickly those rows appear in
the UI; it must not turn the in-app notification center into an email-style
digest.

Email remains the grouped/debounced channel.

## Acceptance Criteria
1. `tasks/backlog.md` contains a notification-specific realtime task.
2. The new task is explicitly related to TASK-118 so the app does not grow two
   independent realtime architectures.
3. TASK-260 is marked complete now that PR #262 has merged.
4. The task scope distinguishes live in-app updates from email digest grouping.

## Definition Of Done
- `tasks/backlog.md`, `tasks/current.md`, and `journal.md` are updated.
- Validation is limited to docs/task tracking inspection because no app code is
  changed.
- A ready-for-review PR is opened for the tracking update.

## Validation Plan
- `git diff --check`
- Review the changed Markdown for task consistency.

## Out Of Scope
- Implementing SSE/WebSocket/polling.
- Changing notification or email digest runtime behavior.
- Changing scheduler provisioning or smoke-test procedure.
