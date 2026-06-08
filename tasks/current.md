# Current Task: TASK-098 Meeting Notes Manager

## Task ID
TASK-098

## Status
Implemented locally; PR, Copilot review, branch-ref preview deploy, and
preview Playwright validation still in progress.

## Source
- `tasks/backlog.md`: "Meeting notes manager - structured project meeting log
  with participants, topics, decisions, and follow-ups."
- User request on 2026-06-08: add a dedicated Meeting Notes area alongside
  project context, roadmap, Kanban, and similar dashboard surfaces. Meeting
  preparation uses an `inputs` section before the meeting and an `output`
  section after the meeting, with participants and personal action items
  captured explicitly. Previous notes must be easy to find, with search as a
  must-have.

## Objective
Ship a project-scoped Meeting Notes manager that feels native to the existing
NexusDash dashboard: structured enough for meeting preparation and follow-up,
fast to scan chronologically, searchable, and protected by the same
project-membership authorization and service-layer boundaries as the rest of
the project workspace.

## Implementation Plan
1. Add persistence for project meeting notes and follow-up actions, including
   title, scheduled date/time, participants, input notes, output notes,
   decisions, and action items.
2. Add service-layer create/read/update/delete/search operations with owner and
   editor write access and viewer read access.
3. Add project API routes that keep transport concerns thin and delegate
   authorization to services.
4. Add a dedicated dashboard Meeting Notes panel with search, list/detail
   navigation, structured editor sections, action-item tracking, empty states,
   loading/error states, and responsive layout.
5. Integrate the panel into the project dashboard navigation and live project
   activity refresh model where appropriate.
6. Cover the service/API/UI behavior with focused tests and add Playwright
   coverage for the main meeting-notes workflow.
7. Complete repository workflow: branch/worktree, PR, Copilot review handling,
   explicit branch-ref preview deployment, and Playwright against preview.

## Acceptance Criteria
1. Project members can open a dedicated Meeting Notes area from the project
   dashboard without leaving the workspace flow.
2. Users can create, view, edit, and delete meeting notes with title, meeting
   time, participants, inputs, outputs, decisions, and personal follow-up
   actions.
3. Search filters previous meeting notes across title, participants, inputs,
   outputs, decisions, and actions.
4. The list is readable for past-note lookup, ordered by meeting time, and
   provides useful scan-time metadata such as participants and action status.
5. Authorization follows project roles: owner/editor can mutate notes, viewer
   can read but not mutate.
6. Persistence and route code respect existing architecture boundaries:
   Prisma access stays in `lib/services/**`, and API routes stay as thin
   adapters.
7. Automated tests cover the new service/API behavior and the core UI workflow.
8. Documentation/tracking files are updated consistently.

## Definition Of Done
- [x] Dedicated feature branch/worktree is used for TASK-098.
- [ ] `tasks/current.md` and `journal.md` record the task plan,
      implementation, validation, PR, preview, and Playwright outcomes.
- [x] Schema/migration, service, API, UI, and tests are implemented.
- [x] `npm run lint`, `npm test`, `npm run test:coverage`, `npm run build`,
      and relevant Playwright tests pass.
- [ ] PR is opened ready for review and Copilot review feedback is monitored
      and addressed or explicitly dispositioned.
- [ ] Preview deploy workflow is triggered with
      `git_ref=feature/task-98-meeting-notes-manager`; logs confirm that branch
      ref was checked out.
- [ ] Playwright runs against the deployed preview with
      `PLAYWRIGHT_BASE_URL=<preview-url>`.
