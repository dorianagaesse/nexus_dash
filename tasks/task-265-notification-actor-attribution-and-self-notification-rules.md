# TASK-265 Notification Actor Attribution And Self-Notification Rules

Date: 2026-05-16
Branch: `feature/task-265-notification-actor-attribution-self-notification`

## Summary

Make notification copy and notification creation rules correctly distinguish
human-authored activity from agent-authored activity, and suppress human
self-notifications where they do not make product sense.

Production notification email smoke confirmed that digest grouping works, but
agent-authored assignment or mention copy can currently read as if the human
credential owner performed the action, for example `dorian1 assigned you...`.
That is confusing when the action came from an agent API credential owned by
that user.

## Product Intent

Notifications should answer two questions clearly:

- what happened?
- who or what caused it?

Expected behavior:

- If a human user mentions another user, copy names the human actor.
- If an agent acts through an agent credential, copy names the agent or clearly
  says the action came from an agent/system context.
- If a human user assigns a task to themselves, no assignment notification is
  created for that human.
- If a human user mentions themselves, no mention notification is created for
  that human.
- If an agent owned by a user assigns or mentions that same user, notification
  is allowed because the actor is the agent, not a human self-action.
- In-app notifications stay atomic: one notification per artifact/action.
- Email digests group those atomic notifications; do not reintroduce in-app
  grouping in this task.

## Current Likely Root Cause

Agent API requests currently execute with the credential owner's user id as the
effective actor for authorization/RLS. Notification builders receive fields like
`actorUserId`, `actorDisplayName`, `authorUsername`, and `authorDisplayName`,
which can make an agent action look like a direct human action.

The fix should preserve the authorization actor used for RLS while adding or
passing a separate notification actor identity for display and self-notification
decisions.

## Recommended Model

Keep two concepts separate:

- authorization actor: the user id used to enforce project access and RLS
- notification actor: the product actor displayed to recipients and used for
  self-notification suppression

Suggested notification actor shape:

```ts
type NotificationActorKind = "user" | "agent" | "system";

interface NotificationActorSummary {
  kind: NotificationActorKind;
  userId?: string;
  displayName: string;
  credentialId?: string;
  credentialName?: string;
}
```

Implementation does not have to use this exact type, but metadata should remain
durable and explicit enough that email templates and in-app notification views
do not infer actor kind from display text.

## Files To Inspect First

- `agent.md`
- `tasks/current.md`
- `tasks/backlog.md`
- `project.md`
- `README.md`
- `lib/services/notification-service.ts`
- `lib/services/project-notification-email-service.ts`
- `lib/services/outbound-email-templates.ts`
- `lib/services/project-task-service.ts`
- `lib/services/project-agent-access-service.ts`
- `app/api/projects/[projectId]/tasks/route.ts`
- `app/api/projects/[projectId]/tasks/[taskId]/comments/route.ts`
- agent API task/comment routes under `app/api/agent/**`, if present
- tests covering task assignment, task comments, notification service, and email
  templates

## Implementation Guidance

1. Trace all notification producers for:
   - task assignments
   - task comment mentions
   - project invitations, if actor copy is touched
2. Identify how agent-authenticated task/comment writes pass actor identity.
3. Add an explicit actor summary at the service boundary instead of only passing
   display strings.
4. Store actor kind and stable actor fields in notification metadata.
5. Update in-app notification body generation to use the actor summary.
6. Update email digest rendering to use the same durable metadata.
7. Suppress notifications only when the actor is a human user and
   `actor.userId === recipientUserId`.
8. Do not suppress agent-to-owner notifications solely because the agent
   credential belongs to that user.
9. Keep routes thin; service-layer notification logic should own the rules.
10. Avoid broad notification schema rewrites unless they are required for
    durable metadata.

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
7. Existing TASK-260 behavior remains intact: in-app notifications are atomic,
   email digest grouping happens only in the email orchestration layer.
8. Tests cover human self suppression, human-to-human delivery, agent-to-owner
   delivery, and email template copy.

## Validation Plan

Local and CI:

- `npm run lint`
- `npm test`
- `npm run test:coverage`
- `npm run build`

Focused tests to add or update:

- `tests/lib/notification-service.test.ts`
- `tests/lib/project-notification-email-service.test.ts`
- `tests/lib/outbound-email-templates.test.ts`
- task/comment route or service tests for human self-assignment/self-mention
- agent API tests that prove agent-authored activity is attributed as agent

Manual smoke after production deploy:

1. As a human user, assign a task to yourself.
2. Confirm no in-app notification is created for that self-assignment.
3. As a human user, mention yourself in a comment.
4. Confirm no in-app notification is created for that self-mention.
5. Through an agent credential, assign or mention the credential owner.
6. Confirm an in-app notification appears and names the agent/system actor.
7. Let the email digest send.
8. Confirm the digest also names the agent/system actor and does not say the
   human user assigned themselves.

## Out Of Scope

- Adding instant push/SSE/WebSocket updates; that is TASK-263.
- Changing scheduler activation; that is TASK-268.
- Implementing due-date reminder business logic; that is TASK-226.
- Redesigning the notification center UI beyond copy required for attribution.
