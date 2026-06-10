# TASK-315 Meeting Todo Side Panel

## Status
Pending.

## Source
- User feedback on TASK-098 on 2026-06-10: add a side panel with open todos
  externalized from all meeting notes.
- TASK-098 now captures per-meeting personal todos but keeps them inside the
  meeting note modal.

## Problem
Meeting todos are useful follow-ups, but users should not have to open each
meeting note to see what is still outstanding. A project-wide open-todo side
panel would make follow-up work scan-friendly and keep meeting notes from
becoming another buried archive.

## Goal
Add a project-side panel that aggregates open meeting todos across all meeting
notes:
- open todos are grouped or sorted by urgency/meeting date;
- each item links back to its source meeting note;
- users can complete/reopen todos from the panel when they have edit access;
- overdue todos are visually aligned with TASK-098/TASK-314 overdue treatment.

## Acceptance Criteria
1. Project members can open a side panel showing open todos from all meeting
   notes in the project.
2. Todos show the source meeting title, meeting date, labels, and overdue state
   where applicable.
3. Owner/editor users can complete or reopen todos from the panel without
   opening the meeting note modal.
4. Clicking a todo or source meeting opens the relevant meeting note context.
5. Viewer users can inspect open todos but cannot mutate them.
6. The panel remains responsive on mobile and does not crowd the existing
   project dashboard layout.
7. Tests cover aggregation, mutations, permissions, and the primary browser
   workflow.

## Definition Of Done
- [ ] UI design is integrated with project dashboard patterns and avoids nested
      cards.
- [ ] Service/API support reuses existing meeting-note authorization and
      activity mutation behavior.
- [ ] Open-todo counts stay in sync after create/update/delete/complete flows.
- [ ] Local validation and relevant Playwright coverage pass.
- [ ] Preview validation confirms the side panel works on the deployed branch.

## Initial Implementation Notes
- Consider whether the side panel belongs inside the Meeting Notes section or
  as a reusable project-level drawer once TASK-110 dashboard personalization is
  closer.
- Reuse TASK-098 overdue helper semantics: incomplete todos become overdue
  seven days after the meeting date.
- Keep source-meeting navigation simple first: open the meeting-note modal with
  that note selected, then refine deep-linking only if the app already has a
  compatible pattern.
