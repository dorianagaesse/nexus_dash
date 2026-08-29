# Current Task

## TASK-377: Agent task API server-side epic and label filters

## Status

In progress on `feature/task-377-task-list-filters` (worktree
`../nexus_dash_task377`, stacked on `feature/task-373-labels-canonical-field`).

## Context

`GET /api/projects/{projectId}/tasks` returns the entire board with no
filtering, so agents must download and filter client-side. Agents need
server-side `epicId` and `label` filters on the list route with defined
composition, empty/unknown behavior, and response metadata.

## Scope

- Extend `listProjectKanbanTasks` in `lib/services/project-service.ts` with
  an optional `filters` argument (`epicId` exact match; `label` matches the
  legacy singular label case-insensitively or the `labelsJson` encoded
  array via quoted-JSON containment, which matches whole array elements
  only). Filters compose with AND; an unknown epicId returns an empty list.
- Parse `epicId` and `label` query parameters on the GET route, treat empty
  strings as absent, and echo the effective filters back in the response.
- Document the query parameters on the OpenAPI GET path, add the `filters`
  object to `TaskListResponse`, and update endpoint notes.
- Dashboard callers keep the existing no-filter behavior.

## Acceptance Criteria

1. `?epicId=...` returns only tasks linked to that epic; an unknown epicId
   returns an empty `tasks` array with 200.
2. `?label=...` matches tasks carrying that label case-insensitively across
   legacy single-label and `labelsJson` storage; partial substrings do not
   match whole labels.
3. Combined filters apply both conditions (AND).
4. The response includes a `filters` object echoing the effective applied
   filters (null when absent).
5. Unfiltered requests behave exactly as before.

## Definition Of Done

- Service tests assert the composed `where` clauses for epic-only,
  label-only, combined, and no-filter queries in
  `tests/lib/project-service.test.ts`.
- Route tests assert filter parsing, service forwarding, and the response
  echo in `tests/api/task-create.route.test.ts` GET coverage.
- Contract tests assert the query parameters and `TaskListResponse.filters`
  schema.
- `npm run lint`, `npm run rls:check`, `npm test`, `npm run test:coverage`,
  and `npm run build` pass; `npm run release:check` passes with the
  `feature/*` minor version bump from the 373 base (`0.38.0` → `0.39.0`).
- A ready-for-review PR is open targeting the TASK-373 branch, with
  retargeting to `origin/main` noted after 373 merges.
- `tasks/current.md`, `tasks/backlog.md`, `journal.md`, and `CHANGELOG.md`
  are updated in the same PR.

## Runtime Assumptions

- No pagination exists in v1; filters apply to the existing full-board list
  and remain compatible with future pagination parameters.
