# Current Task: TASK-095 Related Tasks - Symmetric Task Linking and Hover Highlighting

## Task ID
TASK-095

## Status
In Progress

## Objective
Add lightweight `Related tasks` links inside a project so tasks that belong together can be connected bidirectionally, surfaced in task create/edit/read-only flows, and softly highlighted together on hover in the Kanban board.

## Scope
- Add a symmetric same-project task-link model and migration.
- Allow selecting active related tasks during task creation and task editing.
- Preserve related-task information when a linked task is later archived.
- Remove links automatically when a task is deleted.
- Show related tasks in the task detail modal with archived styling.
- Highlight connected visible tasks on hover with a subtle green border treatment.

## Out of Scope
- Cross-project links.
- Blocking/dependency semantics or execution-order logic.
- Graph visualizations beyond lightweight hover highlighting.

## Acceptance Criteria
- A task can link to one or more active tasks in the same project.
- The relationship is visible from both linked tasks without duplicate rows.
- Archived linked tasks remain visible as informational context.
- Deleted tasks are removed from all related-task references automatically.
- Hovering a task softly highlights connected visible tasks.
- Local validation stays green.

## Plan
1. Add the symmetric relation table, migration, and project-scope validation.
2. Extend task create/update APIs and services to persist related-task links safely.
3. Add reusable related-task UI in create/edit/read-only flows.
4. Add Kanban hover highlighting and validate end to end.

---

Last Updated: 2026-03-11
Assigned To: User + Agent
