# Current Task

## TASK-378: Agent task API bounded bulk operations

## Status

In progress on `feature/task-378-bulk-task-operations` (worktree
`../nexus_dash_task378`, stacked on `feature/task-374-single-task-status`).

## Context

Agent workflows that touch several tasks today need repeated single-item
calls or a full-board rewrite. Agents need bounded bulk task operations with
defined mutation types, a maximum batch size, per-item authorization and
validation, explicit partial-failure semantics, and detailed results.

## Scope

- New `POST /api/projects/{projectId}/tasks/bulk` route accepting
  `{ operations: [...] }` with at most `MAX_BULK_TASK_OPERATIONS` (50)
  items.
- Supported operation types in v1:
  - `create` — task fields, delegates to `createTaskForProject`
  - `update` — `taskId` + partial-update `changes`, delegates to
    `updateTaskForProject`
  - `status` — `taskId` + `status` (+ optional `position`), delegates to
    `moveTaskStatusForProject` from TASK-374
  - No delete operations in v1 bulk (aligned with the non-destructive
    preset story of TASK-379).
- Sequential execution for deterministic ordering. Each item is validated
  and authorized independently; failures become per-item results and never
  fail siblings. No cross-item atomicity.
- Response `{ results: [{ index, ok, status, taskId?, task?, error? }] }`
  with per-item status codes (201 create, 200 update/status).
- OpenAPI schemas (`TaskBulkRequest`, operation variants, result, response),
  path, endpoint entry, and limitations notes. Idempotency documented:
  update/status idempotent, create not.

## Acceptance Criteria

1. More than 50 operations, a non-array or empty operations list, or a
   malformed operation shape is rejected with 400.
2. A batch with a mix of valid and invalid items returns partial success:
   valid items persist with their result entries; invalid items carry their
   own error and status.
3. Each operation enforces the same `task:write` scope and editor-role
   boundaries as its single-item route.
4. Create results return 201 with `taskId` + `task`; update/status results
   return 200 with the updated task.
5. The OpenAPI contract documents the bounded batch size, operation
   schemas, partial-failure behavior, and idempotency expectations.

## Definition Of Done

- New `tests/api/tasks-bulk.route.test.ts` covers payload validation,
  partial success, delegation per operation type, per-item errors, scope
  gating, and timing headers.
- `npm run lint`, `npm run rls:check`, `npm test`, `npm run test:coverage`,
  and `npm run build` pass; `npm run release:check` passes with the
  `feature/*` minor version bump from the 374 base (`0.38.0` → `0.39.0`).
- A ready-for-review PR is open targeting the TASK-374 branch, with
  retargeting to `origin/main` noted after 374 merges.
- `tasks/current.md`, `tasks/backlog.md`, `journal.md`, and `CHANGELOG.md`
  are updated in the same PR.

## Runtime Assumptions

- `moveTaskStatusForProject` exists on this base branch (TASK-374).
- `updateTaskForProject` already applies presence-based partial updates.
- `createTaskForProject` rejects agent file attachments; bulk create items
  are JSON-only by construction.
