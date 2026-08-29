# Current Task

## TASK-374: Agent task API single-task status transition

## Status

In progress on `feature/task-374-single-task-status` (worktree `../nexus_dash_task374`).

## Context

Today the only way an agent can change a task's status is
`POST /api/projects/{projectId}/tasks/reorder`, which requires submitting the
ordering of every Kanban column. Agents need a focused project-scoped
mutation that moves one task to another status column (optionally at a
position inside the destination column) without rewriting the whole board.

## Scope

- New `POST /api/projects/{projectId}/tasks/{taskId}/status` agent route
  accepting `{ status, position? }`.
- New `moveTaskStatusForProject` service in
  `lib/services/project-task-service.ts` that preserves deterministic
  ordering in both source and destination columns, mirrors the reorder
  service's `completedAt` semantics, unarchives on move, and returns the
  updated task.
- OpenAPI contract: `TaskStatusTransitionRequest` and
  `TaskStatusTransitionResponse` schemas, a new path entry, an
  `AGENT_API_ENDPOINTS` entry, and updated onboarding notes so agents prefer
  this route over full-board reorder for single moves.
- Full-board reorder remains available and unchanged for bulk reordering.

## Acceptance Criteria

1. Moving one task to another column without a position appends it at the
   end of the destination column; an explicit position inserts at the
   clamped index and shifts existing destination tasks deterministically.
2. Same-column moves shift tasks between the old and new index without
   corrupting ordering.
3. Moving into `Done` sets `completedAt`; moving within `Done` preserves the
   existing `completedAt`; moving out of `Done` clears it. A move also
   clears `archivedAt`.
4. A request that would not change the task is a no-op that still returns
   the current task payload.
5. The route requires `task:write` scope and editor-or-better project role,
   mirrors the existing activity-version header and error conventions, and
   returns the complete updated task.
6. The OpenAPI contract documents the route, its schema, and the ordering
   semantics; onboarding guidance points single-task moves at this route.

## Definition Of Done

- New `tests/api/task-status.route.test.ts` covers payload validation, 404s,
  append/insert/same-column moves, `completedAt` semantics, unarchive,
  no-op, and 500 behavior.
- `npm run lint`, `npm run rls:check`, `npm test`, `npm run test:coverage`,
  and `npm run build` pass; `npm run release:check` passes with the
  `feature/*` minor version bump and CHANGELOG entry.
- A ready-for-review PR is open against `origin/main`.
- `tasks/current.md`, `tasks/backlog.md`, `journal.md`, and `CHANGELOG.md`
  are updated in the same PR.

## Runtime Assumptions

- TASK-378 (bounded bulk operations) will branch from this line and reuse
  `moveTaskStatusForProject` for bulk status operations.
