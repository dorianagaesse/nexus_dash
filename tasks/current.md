# Current Task: TASK-098 Meeting Notes Manager

## Task ID
TASK-098

## Status
Feedback pass implemented, pushed, preview-deployed, and Playwright-validated on
2026-06-09. PR #331 remains open for review.

## Source
- `tasks/backlog.md`: "Meeting notes manager - structured project meeting log
  with participants, labels, outputs, and todos."
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

## 2026-06-09 Feedback Pass
- Add task-style labels to each meeting note.
- Use modal workflows instead of raw inline editing.
- Separate meeting preparation from after-meeting note taking: preparation
  captures title, participants, labels, date/time, and inputs; opening the note
  later captures outputs and todos.
- Add note state: `prepared`, `actions_in_progress`, and `done`; show `done`
  notes in a separate Archived list.
- Do not auto-select a meeting note; clicking the selected note closes it.
- Use the shared task date picker, with a theme-aware calendar icon.
- Remove the Decisions section from the meeting note UI.
- Add participant chips from Enter, comma, or space.

## Implementation Plan
1. Add persistence for project meeting notes and follow-up actions, including
   title, scheduled date/time, participants, labels, state, input notes, output
   notes, and action items.
2. Add service-layer create/read/update/delete/search operations with owner and
   editor write access and viewer read access.
3. Add project API routes that keep transport concerns thin and delegate
   authorization to services.
4. Add a dedicated dashboard Meeting Notes panel with search, list/detail
   navigation, preparation/note-taking modals, action-item tracking, empty states,
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
2. Users can prepare a meeting with title, meeting time, participants, labels,
   and inputs, then open that note later to capture outputs and personal todos.
3. Search filters previous meeting notes across title, participants, labels,
   inputs, outputs, and actions.
4. The list is readable for past-note lookup, ordered by meeting time, and
   provides useful scan-time metadata such as participants, labels, action
   status, note state, and active/archived grouping.
5. Authorization follows project roles: owner/editor can mutate notes, viewer
   can read but not mutate.
6. Persistence and route code respect existing architecture boundaries:
   Prisma access stays in `lib/services/**`, and API routes stay as thin
   adapters.
7. Automated tests cover the new service/API behavior and the core UI workflow.
8. Documentation/tracking files are updated consistently.

## Definition Of Done
- [x] Dedicated feature branch/worktree is used for TASK-098.
- [x] `tasks/current.md` and `journal.md` record the task plan,
      implementation, validation, PR, preview, and Playwright outcomes.
- [x] Schema/migration, service, API, UI, and tests are implemented.
- [x] `npm run lint`, `npm test`, `npm run test:coverage`, `npm run build`,
      and relevant Playwright tests pass.
- [x] PR is opened ready for review and Copilot review feedback is monitored
      and addressed or explicitly dispositioned.
- [x] Preview deploy workflow is triggered with
      `git_ref=feature/task-98-meeting-notes-manager`; logs confirm that branch
      ref was checked out.
- [x] Playwright runs against the deployed preview with
      `PLAYWRIGHT_BASE_URL=<preview-url>`.

## Outcome
- PR: #331 (`TASK-098 Add meeting notes manager`) on
  `feature/task-98-meeting-notes-manager`.
- Latest implementation commit validated by preview before the feedback pass:
  `5547655731e5e371cc4edcbe79670644d1075e6d`.
- Copilot review generated three actionable comments. Addressed them in
  `5547655` by acknowledging meeting-note remote events before reload, routing
  meeting-note mutations through `fetchProjectActivityMutation`, and renaming
  the stat label to `Meeting notes`; the original review threads became
  outdated.
- Branch-ref preview workflow run `27170848710` deployed
  `https://nexus-dash-3bk1wylcj-dorian-agaesses-projects.vercel.app`; logs show
  `ref: feature/task-98-meeting-notes-manager`, checkout of
  `refs/remotes/origin/feature/task-98-meeting-notes-manager`, and
  `git log -1 --format=%H` =
  `5547655731e5e371cc4edcbe79670644d1075e6d`.
- Preview Playwright:
  `PLAYWRIGHT_BASE_URL=https://nexus-dash-3bk1wylcj-dorian-agaesses-projects.vercel.app npx playwright test tests/e2e/smoke-project-task-calendar.spec.ts`
  passed 6/6 specs, including the meeting-notes preparation, output, action,
  and search flow.
- 2026-06-09 feedback pass local validation: `npm run lint` passed;
  `npm test` passed (122 files passed, 2 skipped; 905 passed, 2 skipped);
  `npm run test:coverage` passed at 91.37% statements, 81.33% branches, 92.2%
  functions, and 91.88% lines; preview-style `npm run build` passed; full
  local Playwright `npm run test:e2e` passed 9/9 after setting local
  `NEXTAUTH_URL`, `NEXTAUTH_SECRET`, and `TRUSTED_ORIGINS` for production-mode
  password-reset origin checks.
- Feedback pass commit `c7ac74164f41077d97ce244b1c76cebeb2b8a97f` was deployed
  by branch-ref preview workflow run `27204436282` to
  `https://nexus-dash-4ansd69jm-dorian-agaesses-projects.vercel.app`; logs show
  `ref: feature/task-98-meeting-notes-manager`, checkout of
  `refs/remotes/origin/feature/task-98-meeting-notes-manager`, and
  `git log -1 --format=%H` =
  `c7ac74164f41077d97ce244b1c76cebeb2b8a97f`.
- Feedback pass preview Playwright:
  `PLAYWRIGHT_BASE_URL=https://nexus-dash-4ansd69jm-dorian-agaesses-projects.vercel.app npx playwright test tests/e2e/smoke-project-task-calendar.spec.ts`
  passed 6/6 specs, including the modal-based meeting preparation, outputs,
  todos, archive, and search flow.
