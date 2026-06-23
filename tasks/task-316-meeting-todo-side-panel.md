# TASK-316 Meeting Todo Floating Panel

## Status
Done in PR #345.

## Source
- User feedback on TASK-098 on 2026-06-10: add a project-level surface with
  open todos externalized from all meeting notes.
- Follow-up feedback on PR #345: the todos should feel like a small floating
  table that is visible anywhere on the project page, not a button inside the
  Meeting Notes section.
- TASK-098 now captures per-meeting personal todos but keeps them inside the
  meeting note modal.

## Problem
Meeting todos are useful follow-ups, but users should not have to open each
meeting note or scroll back to the Meeting Notes section to see what is still
outstanding. A project-wide floating open-todo table keeps follow-up work
scan-friendly while users move through context, kanban, roadmap, and calendar
areas.

## Goal
Add a project-level floating panel that aggregates open meeting todos across all
meeting notes:
- open todos are grouped or sorted by urgency/meeting date;
- each item links back to its source meeting note;
- users can complete/reopen todos from the panel when they have edit access;
- overdue todos are visually aligned with TASK-098/TASK-314 overdue treatment.
- the panel can be reduced/collapsed when users need more workspace.

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

## Initial Implementation Notes
- Keep the todos surface project-level and floating rather than visually owned
  by the Meeting Notes section.
- Reuse TASK-098 overdue helper semantics: incomplete todos become overdue
  seven days after the meeting date.
- Keep source-meeting navigation simple first: open the meeting-note modal with
  that note selected, then refine deep-linking only if the app already has a
  compatible pattern.
