# Current Task: TASK-078 UX Polish Phase 1 - Context/Task Interaction and Safety Flows

## Task ID
TASK-078

## Status
In Progress (2026-02-22)

## Objective
Deliver a first-pass UX quality upgrade on project dashboard interaction surfaces (Context cards + Kanban tasks) so common actions are clearer, safer, and faster.

## Why Now
- Recent work improved async behavior and performance, but daily interaction ergonomics still feel inconsistent.
- Current inline icon actions are dense and error-prone.
- Destructive actions need stronger safety affordances.
- A visual regression remains when opening the task-create modal (top-edge color strip).

## Scope
- Context cards:
  - Clicking a card opens an expanded read-only preview (same base color family as card).
  - Replace inline edit/delete icons with a dot-options action menu.
  - Move edit/delete into options menu.
  - Add stronger destructive visibility for delete (danger styling).
  - Add explicit delete confirmation dialog.
  - Enable double-click edit activation on editable fields.
- Kanban tasks:
  - Add dot-options menu on task cards.
  - Include: `Edit`, `Move to`, `Delete`.
  - Add hover-driven `Move to >` submenu listing all kanban lists.
  - Add delete confirmation dialog.
  - Enable double-click edit activation on editable fields.
- Visual polish:
  - Fix the top-edge bar artifact shown when opening the create-task modal.

## Out of Scope
- Multi-user authorization boundaries and principal scoping (TASK-076).
- Global toast system and mutation-feedback unification (TASK-077), except ensuring this task produces the required action hooks/states.
- New backend auth flows.

## Acceptance Criteria
- Context card options menu replaces visible inline edit/delete buttons in collapsed grid.
- Context card preview opens on click and is read-only.
- Context card delete uses confirmation dialog; destructive action is visually distinct.
- Task card options menu exists with `Edit`, `Move to`, and `Delete`.
- `Move to` submenu supports direct move between kanban lists without drag-and-drop.
- Task delete uses confirmation dialog and updates board state correctly.
- Double-click edit activation works for task and context-card editable fields.
- Task-create modal top-edge visual artifact is resolved in desktop and mobile layouts.
- Lint/tests/build remain green.

## Definition of Done
- UX behavior is implemented with no functional regression in task/context create/edit/delete flows.
- Upon completion, mark `TASK-078` as done and update `tasks/current.md` to the next task in the queue.
- Dedicated PR opened for TASK-078 scope only.
- PR checks pass and preview deployment is validated for target interactions.

## Implementation Notes
- Prefer composable UI primitives (shared menu/confirmation patterns) to avoid divergence between task and context implementations.
- Keep accessibility first: keyboard-reachable menus, focus handling in dialogs, and clear labels for destructive actions.

---

Last Updated: 2026-02-22
Assigned To: User + Agent
