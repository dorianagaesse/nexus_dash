# Current Task: UI Decomposition Phase (Dashboard Panels)

## Task ID
TASK-062

## Status
In Review (2026-02-20)

## Summary
Complete the unfinished frontend decomposition pass by splitting oversized dashboard orchestration components into focused modules/hooks while preserving current UX and API contracts.

Current pain points in codebase (as of 2026-02-20):
- `components/kanban-board.tsx` is ~1547 lines and mixes board rendering, drag persistence, task-modal orchestration, edit-state handling, and attachment mutations.
- `components/project-context-panel.tsx` is ~1284 lines and mixes panel layout, create/edit modal rendering, attachment flows, and mutation status lifecycle.
- `components/project-calendar-panel.tsx` is ~869 lines and mixes calendar fetch orchestration, weekly grid rendering, and event modal CRUD behavior.

## Acceptance Criteria
- Extract feature-level UI modules for each oversized dashboard panel:
  - Kanban: header/board column rendering and task modal surface split into dedicated modules.
  - Context panel: modal/frame + create/edit card UI surfaces split into dedicated modules.
  - Calendar panel: week grid/event list and event modal UI split into dedicated modules.
- Keep transport/business behavior unchanged:
  - Existing API routes, payload shapes, and error mappings remain compatible.
  - Existing interaction flows remain intact (drag reorder, task edit/attachments, context-card CRUD/attachments, calendar create/edit/delete).
- Improve local maintainability:
  - Parent panel files become orchestration-focused (state + callbacks), with rendering-heavy sections moved out.
  - No regression in accessibility semantics (button roles, keyboard handlers, focus-safe modal close actions).
- Project docs remain aligned:
  - `tasks/backlog.md` reflects TASK-074 done and TASK-062 in progress.
  - `tasks/current.md` tracks this decomposition scope.

## Definition of Done
- `npm run lint` passes.
- `npm test` passes.
- `npm run test:coverage` passes.
- `npm run build` passes.
- Branch pushed and PR opened.
- PR checks pass on GitHub.
- Copilot review triaged/resolved (apply valid findings, challenge non-actionable findings).
- Any architecture-impacting decisions logged in `adr/decisions.md`.
- Manual smoke validated for `/projects/[projectId]`: no functional regressions in Kanban/context/calendar interactions.

## Required Input
No blocking input expected for implementation.

## Next Step
Await PR review/approval for `TASK-062` (`#36`), merge once approved, then mark task done and move to the next backlog item.

---

Last Updated: 2026-02-20
Assigned To: User + Agent
