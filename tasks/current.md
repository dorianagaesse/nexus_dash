# Current Task: TASK-316 Meeting Todo Floating Panel

## Task ID
TASK-316

## Status
Done. Delivered in PR #345.

## Source
- User feedback on TASK-098 on 2026-06-10.
- `tasks/task-316-meeting-todo-side-panel.md`

## Objective
Add a project-level floating panel that aggregates open meeting todos across all
meeting notes without requiring users to open each historical note or scroll
back to the Meeting Notes section.

## Scope
- Show project-wide open meeting todos in a small floating table grouped or
  sorted by urgency and meeting date.
- Let users reduce/collapse the floating table when they need more workspace.
- Include source meeting title, date, labels, and overdue state.
- Let owner/editor users complete or reopen todos from the panel.
- Keep viewer access read-only.
- Open the source meeting context when a todo or meeting link is selected.
- Preserve responsive dashboard behavior on mobile.

## Acceptance Criteria
1. Project members can see a floating, reducible panel showing open todos from
   all meeting notes in the project.
2. Todos show the source meeting title, meeting date, labels, and overdue state
   where applicable.
3. Owner/editor users can complete or reopen todos from the panel without
   opening the meeting note modal.
4. Clicking a todo or source meeting opens the relevant meeting note context.
5. Viewer users can inspect open todos but cannot mutate them.
6. The panel remains responsive on mobile, can collapse to a compact control,
   and does not crowd the existing project dashboard layout.
7. Tests cover aggregation, mutations, permissions, and the primary browser
   workflow.

## Definition Of Done
- [x] UI design is integrated with project dashboard patterns and avoids nested
      cards.
- [x] Service/API support reuses existing meeting-note authorization and
      activity mutation behavior.
- [x] Open-todo counts stay in sync after create/update/delete/complete flows.
- [x] Local validation and relevant Playwright coverage pass.
- [x] Preview validation confirms the floating panel works on the deployed branch.
