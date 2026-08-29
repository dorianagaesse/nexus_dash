# Current Task

## TASK-376: Agent task creation OpenAPI complete response contract

## Status

In progress on `feature/task-376-create-response-contract` (worktree
`../nexus_dash_task376`, stacked on `feature/task-373-labels-canonical-field`).

## Context

The runtime `POST /api/projects/{projectId}/tasks` response already includes
both `taskId` and the complete created `task`, but the published
`TaskCreateResponse` schema documents only `{ taskId }`, forcing generated
clients to perform a follow-up read. Additionally, the shared mutation
payload omits `completedAt`, so the runtime task shape is not fully aligned
with the `TaskRecord` schema that covers list responses.

## Scope

- Add `completedAt` to the shared mutation payload
  (`UpdatedTaskPayload` + `loadTaskMutationPayload` in
  `lib/services/project-task-service.ts`) so PATCH and create responses
  match the full `TaskRecord` contract.
- Update the OpenAPI `TaskCreateResponse` schema to require `taskId` and
  `task` with `task` referencing `TaskRecord`, describing the canonical
  labels, status, ordering, epic, assignment, and timestamps.
- Consolidate the duplicated inline `TaskUpdateResponse` task object into a
  `$ref` to `TaskRecord` now that runtime parity holds.
- Update the create endpoint onboarding notes and refresh route tests that
  pinned the legacy `{ taskId }`-only response shape.
- Keep the runtime defensive `{ taskId }` fallback branch untouched
  (unreachable with the current service contract).

## Acceptance Criteria

1. Every successful create and update response carries `taskId` (create)
   plus the complete task including `completedAt`, `labels`, attachments,
   and relations, matching `TaskRecord`.
2. `TaskCreateResponse.required` equals `["taskId", "task"]` and
   `TaskCreateResponse.properties.task` references `TaskRecord`.
3. `TaskUpdateResponse` uses `$ref: TaskRecord` for its task instead of a
   divergent inline schema.
4. Contract tests assert both schemas so drift is caught.

## Definition Of Done

- Updated route/contract tests pass in
  `tests/api/task-create.route.test.ts`, `tests/api/task-update.route.test.ts`,
  and `tests/lib/agent-onboarding.test.ts`.
- `npm run lint`, `npm run rls:check`, `npm test`, `npm run test:coverage`,
  and `npm run build` pass; `npm run release:check` passes with the
  `feature/*` minor version bump from the 373 base (`0.38.0` → `0.39.0`).
- A ready-for-review PR is open targeting the TASK-373 branch, with
  retargeting to `origin/main` noted after 373 merges.
- `tasks/current.md`, `tasks/backlog.md`, `journal.md`, and `CHANGELOG.md`
  are updated in the same PR.

## Runtime Assumptions

- `loadTaskMutationPayload` already selects everything else `TaskRecord`
  requires; `completedAt` is the only missing field (labels arrived with
  TASK-373 on this base branch).
