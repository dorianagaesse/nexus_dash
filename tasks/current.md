# Current Task

## TASK-375: Agent task OpenAPI contract for true partial PATCH semantics

## Status

In progress on `feature/task-375-partial-patch-contract` (worktree
`../nexus_dash_task375`, stacked on `feature/task-373-labels-canonical-field`).

## Context

The runtime `PATCH /api/projects/{projectId}/tasks/{taskId}` handler treats
every field as optional and presence-based, but the published OpenAPI
`TaskUpdateRequest` schema declares `title` as required. Generated clients
therefore refuse valid partial updates. The contract must document true
partial semantics: omitted fields are preserved, explicit `null` or empty
values clear, and supplied values are validated as today.

## Scope

- Remove the `required: ["title"]` declaration from `TaskUpdateRequest` in
  `lib/agent-onboarding.ts`.
- Document per-field omit-vs-null semantics in the schema descriptions:
  deadlineDate null/"" clears, labels [] clears, epicId/assigneeUserId null
  clears, relatedTaskIds [] removes all relations, legacy singular `label`
  stays accepted but is deprecated in favor of `labels`.
- Extend the PATCH endpoint onboarding notes to describe partial-update
  behavior.
- Add contract test coverage preventing the schema from drifting back to
  requiring `title` and asserting the deprecation/semantics markers.

## Acceptance Criteria

1. `TaskUpdateRequest` declares no required fields; generated clients can
   send any single-field update.
2. The OpenAPI document explains omit-vs-null semantics for every clearable
   field and marks the legacy `label` input deprecated.
3. Runtime PATCH behavior is unchanged (presence-based partial updates,
   pinned by the existing route tests).
4. Contract tests assert the schema shape so drift is caught.

## Definition Of Done

- Contract assertions pass in `tests/lib/agent-onboarding.test.ts`.
- `npm run lint`, `npm run rls:check`, `npm test`, `npm run test:coverage`,
  and `npm run build` pass; `npm run release:check` passes with the
  `feature/*` minor version bump from the 373 base (`0.38.0` → `0.39.0`).
- A ready-for-review PR is open targeting the TASK-373 branch, with
  retargeting to `origin/main` noted after 373 merges.
- `tasks/current.md`, `tasks/backlog.md`, `journal.md`, and `CHANGELOG.md`
  are updated in the same PR.

## Runtime Assumptions

- This is a contract-only task; no runtime handler or service changes.
