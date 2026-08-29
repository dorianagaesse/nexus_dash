# Current Task

## TASK-373: Agent task API labels contract — expose a canonical string array

## Status

In progress on `feature/task-373-labels-canonical-field` (worktree `../nexus_dash_task373`).

## Context

Agent clients reading tasks today must reconcile two legacy fields: the
singular `label` value and the JSON-encoded `labelsJson` string. The API
should return task labels as a first-class `labels: string[]` field while
keeping the legacy fields for compatibility. The read helper
`getTaskLabelsFromStorage` already exists and is used by the Kanban UI; the
agent API responses do not use it yet.

## Scope

- Add `labels: string[]` to every task read response the agent API serves:
  - `GET /api/projects/{projectId}/tasks` list items
  - `PATCH /api/projects/{projectId}/tasks/{taskId}` response task
  - `POST /api/projects/{projectId}/tasks` created-task response
- Keep `label` and `labelsJson` in responses for a documented compatibility
  window and mark both deprecated in the OpenAPI contract.
- Keep the write contract consistent: `labels` array is canonical on create
  and update; legacy singular `label` remains accepted on update.
- Update the OpenAPI `TaskRecord` and `TaskUpdateResponse` schemas and the
  onboarding endpoint notes.
- Cover empty, single-label, multi-label, and legacy-fallback responses with
  tests, plus contract assertions that prevent schema drift.

## Acceptance Criteria

1. Every task object in list, create, and update responses includes a
   canonical `labels: string[]` derived from `labelsJson` with the legacy
   `label` fallback, matching the Kanban UI's label resolution.
2. Legacy `label` and `labelsJson` fields remain present and are marked
   `deprecated` in the OpenAPI document.
3. OpenAPI `TaskRecord` and `TaskUpdateResponse` schemas include `labels` in
   their required property lists with `items: { type: "string" }`.
4. Empty labels serialize as `[]` (never `null`), single-label and
   multi-label tasks serialize as exact string arrays.
5. Existing create/update write behavior is unchanged.

## Definition Of Done

- Focused route tests cover empty, single, multi, and legacy-fallback label
  responses.
- OpenAPI contract tests assert the `labels` schema shape and deprecation
  markers.
- `npm run lint`, `npm run rls:check`, `npm test`, `npm run test:coverage`,
  and `npm run build` pass; `npm run release:check` passes with the
  `feature/*` minor version bump and CHANGELOG entry.
- A ready-for-review PR is open against `origin/main`.
- `tasks/current.md`, `tasks/backlog.md`, `journal.md`, and `CHANGELOG.md`
  are updated in the same PR.

## Runtime Assumptions

- `getTaskLabelsFromStorage` (`lib/task-label.ts`) is the single source of
  truth for label resolution; responses must use it rather than re-deriving
  labels inline.
