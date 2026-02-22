# Current Task: TASK-079 Projects Page Edit/Delete Safety UX

## Task ID
TASK-079

## Status
In Progress (branch `feature/task-079-project-card-edit-controls`) (2026-02-22)

## Objective
Make project-card updates intentional by replacing always-editable fields and always-visible `Save changes` with explicit edit mode and contextual actions.

## Why Now
- `Save changes` is currently always visible/clickable, even when nothing changed.
- Submitting unchanged cards can still mutate ordering (updated timestamp side effects).
- Direct adjacency of save/delete increases accidental destructive risk.

## Scope
- Projects page cards:
  - Render name/description as read-only by default.
  - Add top-right options menu with `Edit` and `Delete`.
  - Keep delete behind confirmation dialog.
  - Activate edit mode via:
    - options menu `Edit`
    - double-click name
    - double-click description
- Edit mode behavior:
  - Show editable name/description inputs only in edit mode.
  - Show `Save changes` only when values differ from persisted values.
  - Hide `Save changes` when no change is pending.
- Reuse/factor:
  - Reuse shared options-menu dismissal behavior (outside click + Escape) through a common hook.

## Out of Scope
- Auth/authz behavior.
- Project sharing/permissions model.
- Kanban/context/task domain logic changes outside shared menu behavior reuse.

## Acceptance Criteria
- Default project card fields are non-editable.
- `Save changes` appears only when the user modified name and/or description.
- Options menu exists on project cards with `Edit` and `Delete`.
- Double-click on project name/description enters edit mode.
- Deleting a project requires explicit confirmation.
- Menu open/close behavior is consistent with other options menus.
- Lint/test suites pass.

## Definition of Done
- Dedicated PR opened from `feature/task-079-project-card-edit-controls`.
- Checks pass.
- Copilot review comments are handled (valid ones implemented, threads resolved).
- Manual preview deployment is executed and shared.
- `tasks/backlog.md` and `tasks/current.md` reflect final task state.

---

Last Updated: 2026-02-22
Assigned To: User + Agent
