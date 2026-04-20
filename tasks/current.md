# Current Task: TASK-099 Task Comments - Project-Scoped Discussion Thread On Tasks

## Task ID
TASK-099

## Status
Active on `feature/task-099-task-comments` as of `2026-04-19`; implementation
is complete, PR `#180` is open, Copilot feedback has been applied/resolved, and
preview deployment plus PR checks have passed for the latest branch head.

## Objective
Add first-class task comments so execution-specific discussion, clarifications,
and follow-up decisions stay attached to the task itself, with clear chronology
and author attribution, without broadening this task into realtime messaging,
mentions, or a full notification system.

## Why This Task Matters
- The current task model already captures execution structure well
  (`description`, labels, deadlines, attachments, blocked follow-ups, related
  tasks), but it has no durable place for discussion tied to the work item.
- Important decisions and clarifications are currently easy to lose in external
  chat or generic context cards, which weakens task-level continuity.
- `TASK-076`, `TASK-079`, `TASK-095`, and `TASK-117` established the current
  service boundary, safer task interactions, relationship model, and richer
  task metadata. Comments should extend those patterns rather than introduce a
  parallel collaboration model.
- Agent-facing task APIs are now a supported product surface, so any new
  task-scoped discussion resource should stay coherent across services, routes,
  and hosted agent/OpenAPI documentation.

## Current Understanding
- Task persistence lives in `prisma/schema.prisma`, with project/task authz
  enforced in `lib/services/**` and RLS actor propagation handled through
  `lib/services/rls-context.ts`.
- Task creation/update/delete flows are handled in
  `lib/services/project-task-service.ts`, while dashboard task reads come from
  `lib/services/project-service.ts`.
- The project page currently builds Kanban task data in
  `app/projects/[projectId]/kanban-board-section.tsx`, then hands the live
  client interaction model to `components/kanban-board.tsx`.
- The task modal in `components/kanban/task-detail-modal.tsx` is the existing
  task detail/read-edit surface and is the natural home for an inline
  discussion thread.
- Current board payloads already include attachments, blocked follow-ups,
  related tasks, and deadlines for scan/read workflows; comments differ because
  they can grow without bound and should not force the dashboard to eagerly
  hydrate every thread body.
- Account identity display patterns already exist:
  `lib/services/account-identity-service.ts` provides `displayName` and
  `usernameTag`, and project-collaboration surfaces already show user identity
  in a compact consistent way.
- RLS currently protects task-scoped tables such as `Task`,
  `TaskBlockedFollowUp`, `TaskAttachment`, and `TaskRelation`; a new
  task-comment table must receive equivalent policy treatment in the migration
  layer.
- Agent docs and OpenAPI are generated from `lib/agent-onboarding.ts` and the
  `/api/docs/agent/v1/openapi.json` route, so comment endpoints or task payload
  changes need to be reflected there deliberately.

## Working Product Assumptions
- V1 comments are task-scoped only. This task does not add comments to projects,
  context cards, calendar events, or attachments.
- V1 comments are append-only:
  - supported operations: list comments, create comment
  - out of scope for v1: edit comment, delete comment, reactions, threading,
    resolution state
- Comment content should be plain text in v1 with preserved line breaks, not a
  second rich-text editor. This keeps the interaction lightweight and lowers
  implementation risk while remaining future-friendly for mention parsing.
- Comment author attribution should use the same identity hierarchy already used
  elsewhere in the product:
  - `usernameTag` when available
  - otherwise the existing display-name fallback path
- Read access should align with task visibility (`task:read` / project access),
  and write access should align with task mutation permissions (`task:write` /
  editor-or-owner role semantics).
- The Kanban/dashboard payload should expose only lightweight comment metadata
  for scan-time visibility, with the full comment thread fetched lazily when the
  task modal opens.
- Comment chronology should read oldest-to-newest in the thread so the modal
  behaves like a natural conversation log rather than a reverse-ordered audit
  table.
- Mention parsing, notifications, digests, realtime push, and unread state are
  intentionally deferred, but schema and route design should not block those
  follow-ups later.

## Scope
- Add first-class task comment persistence through Prisma schema and migration
  updates.
- Add task-comment RLS policy coverage and indexes consistent with the current
  `TASK-085` protected-table model.
- Introduce service-layer task-comment reads/writes under
  `lib/services/**`, keeping transport adapters thin.
- Add dedicated task-comment API endpoints for at least:
  - list thread for one task
  - create comment on one task
- Extend the Kanban/dashboard task shape with lightweight comment visibility,
  such as `commentCount`.
- Add a task-detail modal discussion surface that:
  - loads the thread lazily
  - renders author + timestamp + content
  - lets authorized users add a comment inline
- Add a compact board/task indicator so comments are discoverable without
  opening every task blindly.
- Keep project-role enforcement, agent scope enforcement, and RLS actor-context
  behavior intact for all new reads and writes.
- Align agent-facing task docs/OpenAPI and onboarding guidance if task comments
  become part of the supported agent surface.
- Add or update regression coverage and tracking docs in the same task PR.

## Out Of Scope
- Comment editing, deletion, reactions, emoji reactions, or nested reply
  threads.
- Rich-text comment authoring.
- File or link attachments scoped directly to comments.
- Mention parsing, mention notifications, email notifications, push
  notifications, or digest delivery.
- Realtime collaboration or live comment streaming across sessions.
- Comment search, filtering, moderation, or per-user unread state.
- Broad redesign of the Kanban/dashboard beyond the comment affordances needed
  for this task.

## Expected Implementation Touchpoints
- `prisma/schema.prisma`
- `prisma/migrations/**`
- `lib/services/project-task-comment-service.ts` (new)
- `lib/services/project-service.ts`
- `app/api/projects/[projectId]/tasks/[taskId]/comments/route.ts` (new)
- `app/api/projects/[projectId]/tasks/route.ts`
- `app/projects/[projectId]/kanban-board-section.tsx`
- `components/kanban-board-types.ts`
- `components/kanban-board.tsx`
- `components/kanban/kanban-columns-grid.tsx`
- `components/kanban/task-detail-modal.tsx`
- `lib/agent-onboarding.ts`
- `/api/docs/agent/v1/openapi.json` generation path
- relevant `tests/**`

## Resolved Implementation Decisions
1. Comments ship as a dedicated task-scoped resource:
   - do not overload `Task.description`
   - do not repurpose `TaskBlockedFollowUp`
2. Full threads load lazily per selected task:
   - dashboard/board payload stays lightweight
   - board payload should expose only compact comment metadata such as
     `commentCount`
3. V1 comment authoring is append-only plain text:
   - no edit/delete lifecycle in this task
   - preserve line breaks and timestamps for a clean chronological thread

## Expected Output
- an active `tasks/current.md` brief for `TASK-099`
- task comment persistence and RLS-aware service/API support
- task modal thread read/write UX with author attribution
- compact comment visibility on Kanban task surfaces
- aligned tests and documentation updates
- a dedicated task branch and PR that follow the repository shipping workflow,
  including initial Copilot review triage before handoff

## Implementation Status
- Completed locally:
  - Prisma schema + migration for `TaskComment`
  - task-comment service + API route (`GET`/`POST`)
  - lightweight `commentCount` support in task payloads
  - task-detail modal thread loading + inline comment composer
  - board/task comment visibility affordances
  - agent onboarding/OpenAPI updates
  - regression coverage for task comments and updated task payload contracts
- Shipping steps in progress:
  - final merge decision on PR `#180`

## Acceptance Criteria
- Tasks support a persisted comment thread with at least create and list
  behavior.
- Every comment stores stable task linkage, project scoping, author identity,
  and chronology metadata required for future follow-ups.
- Comment reads and writes remain service-authorized and project-scoped under
  the current `TASK-076` / `TASK-085` boundary model.
- The task modal renders a chronological discussion thread with clear author and
  timestamp context.
- Authorized collaborators can add comments from the task detail surface without
  degrading existing task edit, attachment, related-task, and deadline flows.
- The Kanban/task surface exposes lightweight visibility that a task has
  comments, preferably including a count.
- Agent-facing documentation is updated if comment endpoints or task payload
  contracts are added.
- Required tracking docs are updated consistently in the same PR.

## Definition Of Done
1. `TASK-099` is the active task in `tasks/current.md`.
2. Task comments are implemented end to end across schema, migration/RLS,
   services, routes, and the primary task UI surface.
3. Validation is green for the relevant scope:
   - `npm run lint`
   - `npm test`
   - `npm run test:coverage`
   - `npm run build`
   - `npm run test:e2e` if the final UI changes warrant E2E coverage or touch a
     currently covered critical flow
4. Tracking docs are updated consistently (`tasks/current.md`, `journal.md`,
   `adr/decisions.md` if the final design introduces an architecture-level
   decision).
5. The task ships through a dedicated PR whose title includes `TASK-099`, with
   Copilot's initial review state monitored and any valid feedback handled
   before handoff.

## Dependencies
- `TASK-076`
- `TASK-079`

## Evidence Plan
- Repo source of truth:
  - `agent.md`
  - `project.md`
  - `README.md`
  - `prisma/schema.prisma`
  - `lib/services/project-task-service.ts`
  - `lib/services/project-service.ts`
  - `components/kanban-board.tsx`
  - `components/kanban/task-detail-modal.tsx`
  - `components/kanban/kanban-columns-grid.tsx`
  - `lib/services/account-identity-service.ts`
  - `lib/agent-onboarding.ts`
- Validation source of truth:
  - local lint/unit/coverage/build runs
  - PR checks: `check-name`, `Quality Core`, `E2E Smoke`, and
    `Container Image`

## Outcome Target
- NexusDash gains a durable task-level discussion thread so execution context
  stays attached to the work item instead of escaping into unrelated channels.
- The resulting implementation should make future mentions/notifications
  additive rather than forcing a comment-model rewrite.

---

Last Updated: 2026-04-19
Assigned To: Agent
