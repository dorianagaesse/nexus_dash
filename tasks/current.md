# Current Task

## Backlog migration to Nexus Dash

## Status

Complete (2026-08-31). The full backlog previously tracked in
`tasks/backlog.md` now lives in the Nexus Dash project "Nexus Dash" at
<https://nexus-dash.app> (agent credentials in `.config/.nd-nexus-dash.env`).

## What changed

- 5 epics and 246 tasks created via the agent API, with descriptions carrying
  the original backlog entries, program-section labels, Brief/Report
  attachment links, and dependency relationships.
- Kanban columns: Backlog (72), In Progress (2: TASK-100, TASK-406),
  Done (172).
- `tasks/backlog.md` is now a migration notice; Nexus Dash is the source of
  truth for task management.

## Next task selection

The next task is picked from the Nexus Dash kanban (In Progress lane first,
then Backlog in lane order) instead of `tasks/backlog.md`.

## Acceptance Criteria

1. Every entry from the pre-migration `tasks/backlog.md` exists in Nexus Dash
   with its ID, title, status string, rationale, dependencies, and section
   grouping preserved.
2. Dependencies are represented as task relations.
3. Brief/Report files are attached where referenced.
4. Verification confirms the Nexus Dash board matches the migration plan.

## Definition Of Done

- Migration verified against the plan (columns, ordering, labels, epics,
  relations, descriptions, attachments).
- `tasks/backlog.md`, `tasks/current.md`, and `journal.md` updated in the
  same PR.
