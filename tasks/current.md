# Current Task: TASK-260 Email-Only Notification Digests

## Task ID
TASK-260

## Status
In progress on dedicated worktree `../nexus_dash_task260` and branch
`fix/task-260-email-only-notification-digests`.

## Source
- Production multi-notification smoke follow-up after TASK-227/TASK-258/TASK-259.
- User feedback: grouped notifications are desirable for email, but in-app
  notifications must remain atomic and about one action/artifact.

## Objective
Keep the notification center and in-app notification awareness surfaces focused
on individual notification artifacts, while preserving recipient/project email
digest grouping and debounce behavior for outbound email only.

## Product Decision
The durable `Notification` row remains the source-of-truth unit for in-app
notification UX. Email orchestration may group those atomic rows through
`ProjectNotificationEmail` and `ProjectNotificationEmailItem`, but in-app
surfaces must not describe several notifications as one grouped notification.

This follows the common product pattern used by activity systems: real-time or
near-real-time in-app notifications are event/activity items, while email is a
digest channel with debounce, batching, and maximum-delay controls.

## Assumptions
- No production secrets are needed for this task.
- The existing email digest service should keep recipient/project grouping,
  quiet-window debounce, and max-delay behavior.
- No websocket/realtime transport is being added here; "real time" in this task
  means in-app notifications are not email-style digests and each notification
  row remains independently actionable.

## Acceptance Criteria
1. The notification center continues to render one row per `Notification`.
2. The in-app notification awareness banner does not render digest-style text
   such as `+N more unread notifications`.
3. Email digest tests continue to prove multiple project groups can be batched
   into one recipient email.
4. Tests cover the in-app/email boundary: in-app surface stays atomic while
   email remains grouped.
5. Documentation/task tracking records the product decision.

## Definition Of Done
- Work remains on `fix/task-260-email-only-notification-digests`.
- `tasks/current.md`, `tasks/backlog.md`, and `journal.md` are updated.
- Required validation passes or any environment blocker is documented:
  - `npm run lint`
  - `npm test`
  - `npm run test:coverage`
  - `npm run build`
- A ready-for-review PR is opened.
- CI/Copilot feedback is monitored and addressed.
- Final handoff includes PR URL, commit SHA(s), validation results, and any
  remaining caveats for production smoke.

## Validation Plan
- Focused:
  - `npm test -- --run tests/components/notification-awareness-banner.test.tsx tests/lib/notification-service.test.ts tests/lib/project-notification-email-service.test.ts`
- Baseline:
  - `npm run lint`
  - `npm test`
  - `npm run test:coverage`
  - `npm run build`

## Out Of Scope
- Adding websocket/SSE realtime transport.
- Changing outbound email debounce/window timing.
- Changing production scheduler provisioning.
