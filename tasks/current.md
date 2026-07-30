# Current Task

## Task

- ID: TASK-350
- Title: Complete related-task candidate list
- Status: Ready for review
- Branch: `fix/task-350-related-task-picker`
- GitHub issue: [#396](https://github.com/dorianagaesse/nexus_dash/issues/396)
- Brief: [`task-350-related-task-picker.md`](./task-350-related-task-picker.md)

## Objective

Ensure the create-task and task-detail `Related to` pickers expose every
eligible active task in the authorized current project, including Blocked
tasks, with complete search and accessible scrolling through long result sets.

## Scope

- Trace candidate construction in create and task-detail flows across every
  Kanban status.
- Preserve project authorization, archived-task rules, current-task exclusion,
  and intentional selected/already-related behavior.
- Provide bounded result-list scrolling without moving the underlying modal or
  page.
- Keep keyboard focus and the active option visible through the complete
  filtered result set.
- Cover clear empty and no-search-results states.
- Add focused component and Playwright regression coverage with enough tasks to
  overflow the picker.
- Record before/after candidate counts by status and visual evidence.

## Runtime Assumptions

- Installed dependencies and Playwright Chromium are available locally.
- The local PostgreSQL Compose service may be started for browser validation.
- Preview validation will use
  `git_ref=fix/task-350-related-task-picker` if the local UI evidence cannot
  cover the complete authenticated flow.

## Acceptance Criteria

1. All eligible active tasks from Backlog, In Progress, Blocked, and Done are
   present in or discoverable through both related-task pickers.
2. The current task is excluded; selected and already-related tasks retain
   intentional behavior; archived tasks remain unavailable.
3. Search filters the complete eligible candidate set rather than a visible or
   status-limited subset.
4. Long results scroll inside the picker without clipping rows or scrolling
   the underlying modal/page.
5. Keyboard navigation reaches every filtered result and keeps the active
   option visible.
6. Empty and no-search-results states are distinct and clear.
7. Cross-project and unauthorized tasks remain unavailable.
8. Focused component and Playwright regression coverage passes at desktop and
   narrow viewports.
9. Before/after candidate counts by status and overflowing-list screenshots or
   recordings are recorded.
10. Repository task tracking and journal context are updated in the same PR.

## Definition Of Done

- Root cause is documented as data filtering, visual clipping, interaction
  handling, or a combination.
- Candidate logic is shared or aligned between create and detail flows.
- Focused unit/component and Playwright coverage passes.
- Lint, RLS inventory, unit tests, coverage, production build, and relevant E2E
  validation are green.
- Product version and tracking docs are updated consistently.
- The branch is committed, pushed, and opened as a ready-for-review PR with
  initial automated feedback handled.

## Progress

- Confirmed GitHub issue #396 maps to TASK-350 in the execution backlog.
- Created a dedicated worktree and fix branch from `origin/main` because the
  root checkout is concurrently occupied by issue #395.
- Confirmed create and detail callers already aggregate every active status and
  exclude archived tasks; the shared selector truncated both default and
  searched suggestions to eight and lacked keyboard option navigation.
- Replaced the cap with a viewport-aware, overscroll-contained listbox and
  combobox keyboard behavior that keeps the active option visible.
- Recorded detail candidate counts before/after with four tasks per status:
  source 4/4/4/4 in both cases, rendered 8 total before and 4/4/4/4 after.
- Added passing component coverage and a passing Chromium regression spanning
  detail/create selection, final-row scrolling, Blocked-task search,
  authorization boundaries, archived exclusion, persistence, and 375 px
  containment.
- Captured before, final-row, and narrow-create screenshots under
  `.tmp/task-350-evidence`.
- Passed lint, RLS inventory, version policy, all 140 runnable Vitest files
  (981 tests; 2 files/tests skipped), coverage at 91.37% statements / 81.33%
  branches / 92.2% functions / 91.88% lines, the standard Turbopack production
  build, and all 28 Chromium scenarios.
