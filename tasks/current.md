# Current Task: TASK-265 Notification Actor Attribution And Self-Notification Rules

## Task ID
TASK-265

## Status
Active

## Source
- Backlog execution queue item:
  `tasks/backlog.md`
- Dedicated brief:
  `tasks/task-265-notification-actor-attribution-and-self-notification-rules.md`
- Production observation: agent-authored assignment/mention notifications can
  read as if the credential owner's human account directly performed the
  action.

## Objective
Make notification creation, in-app copy, and email digest copy distinguish the
authorization actor from the product notification actor. Human self-actions
should be suppressed when they would only notify the same human about their own
assignment or mention, while agent-to-user activity should remain notifiable
even when the agent credential is owned by the recipient.

## Current Baseline
- Notification email digest grouping is working and in-app notifications remain
  atomic per action/artifact.
- Agent API writes currently authorize through the credential owner's user id.
- Notification producers pass user-centric fields such as actor/user display
  names, which can make agent-authored activity look human-authored.
- TASK-271 already fixed repeated email delivery for previously emailed
  notification IDs; this task must preserve that behavior.

## Scope
- Trace notification producers for task assignment and comment mentions.
- Add or thread explicit notification actor identity through service boundaries
  where agent-authenticated writes can create notifications.
- Store/use durable metadata that distinguishes human, agent, and system
  actors without weakening authorization/RLS behavior.
- Suppress self-notifications only for human actor-to-same-recipient
  assignment/mention cases.
- Update in-app notification copy and email digest copy to use the same actor
  attribution model.
- Add focused tests for human self suppression, human-to-human delivery,
  agent-to-owner delivery, and digest copy.

## Acceptance Criteria
1. Human self-assignment does not create an in-app notification or queued email.
2. Human self-mention does not create an in-app notification or queued email.
3. Human-to-other-user assignment and mention still create one atomic in-app
   notification per action.
4. Agent-to-user assignment and mention create notifications even when the
   credential owner is the recipient.
5. Agent-authored notification copy clearly attributes the action to an agent,
   not to the credential owner's human display name.
6. Email digest copy uses the same actor attribution as the in-app
   notification.
7. Existing TASK-260/TASK-271 behavior remains intact: in-app notifications are
   atomic, email grouping is in the email orchestration layer, and sent email
   items suppress repeated dispatch by notification ID.
8. Tests cover human self suppression, human-to-human delivery,
   agent-to-owner delivery, and email template copy.

## Definition Of Done
- Service-layer notification rules distinguish authorization actor from
  notification actor.
- Routes remain thin and continue delegating authorization-sensitive behavior to
  services.
- Relevant unit/service tests pass locally.
- Full validation passes or any blocker is documented.
- `tasks/backlog.md`, `tasks/current.md`, and `journal.md` reflect TASK-265
  progress.
- A PR is opened from `feature/task-265-notification-actor-attribution`, Copilot
  and check feedback are monitored, actionable review comments are addressed,
  and the handoff includes delivered commit SHA(s).

## Local Prerequisites
- Node.js must satisfy `.node-version` / `package.json` engines.
- PostgreSQL must be reachable for full Vitest/build validation. The repo-owned
  local Docker database can be started with `npm run db:local:up`.
- Runtime env should follow `README.md` and
  `docs/runbooks/vercel-env-contract-and-secrets.md`; no new secrets are
  expected for this task.

## Validation Plan
- `git diff --check`
- Focused tests once touched paths are known, likely:
  - `npm test -- --run tests/lib/notification-service.test.ts`
  - `npm test -- --run tests/lib/project-notification-email-service.test.ts`
  - `npm test -- --run tests/lib/outbound-email-templates.test.ts`
  - relevant task/comment/agent API tests
- `npm run lint`
- `npm test`
- `npm run test:coverage`
- `npm run build`

## Deploy/Review Workflow
- Branch/worktree:
  `feature/task-265-notification-actor-attribution` at
  `../nexus_dash_task265`.
- Open a ready-for-review PR once implementation and local validation are
  reviewable.
- Preview validation is not required by default because this is service/copy
  behavior, but if acceptance depends on deployed UI/email smoke, trigger the
  Vercel preview workflow with explicit `git_ref` per `agent.md`.

## Out Of Scope
- Realtime notification updates; that is TASK-263.
- Scheduler cadence or activation changes; that is TASK-268/TASK-269.
- Due-date reminder business logic; that is TASK-226.
- Redesigning the notification center beyond copy required for attribution.
