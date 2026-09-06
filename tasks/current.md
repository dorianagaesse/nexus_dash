# Current Task

## ND-408: Unified Kanban task search and filter bar

## Status

Delivered: PR #483 (https://github.com/dorianagaesse/nexus_dash/pull/483) is
open from `feature/nd-408-kanban-search-filter`, superseding PR #469 (TASK-382
server-backed task search + label filters) and #470 (TASK-384 epic filter),
which were both commented with pointers and closed. The Nexus Dash board card
(ND-408) reflects In Progress.

Local validation passed against a dockerized PostgreSQL with env overrides
(runbook `docs/runbooks/local-validation.md`): production build green, ND-408
Playwright spec 6/6, focused vitest 50/50 with scoped coverage above
thresholds, lint/rls:check/diff checks clean. Full `npm test` /
`npm run test:coverage` remain red only on a pre-existing main breakage
(`prisma.$transaction is not a function`, reproduced on a pristine tree) that
predates this branch; see the PR body.

Review iteration (2026-09-05): popover anchored directly below the Filter
trigger (flip-above only when under 240px of room below, capped at 520px so it
never stretches to the viewport top), Labels/Epics rendered as compact wrap
chips in the card-label visual language, an in-popover search field that
filters options live, and groups beyond 12 chips collapsing behind a
"Show all N" toggle (auto-expanded while searching). New component tests
added; ND-408 e2e spec stays green. Nexus Dash card ND-408 description
rewritten with a precise Rationale/Scope/Acceptance Criteria/Definition of
Done brief and the `feature` label per the authoring contract in `agent.md`.

Mobile review iteration (2026-09-05, second round): on viewports under 640px
the popover sizes to the Filter trigger's own rect (the button is centered
beneath the search row and narrower than it), so it is pixel-aligned with the
button; the popover footer is now always rendered with an explicit **Done**
button (Check icon) that closes the panel and restores focus to the trigger,
alongside the conditional Clear all filters. Component suite at 15 tests and
the 375px e2e assertion (popover box matches the trigger within 1px, Done
visible) cover both. Committed 49a9227; PR #483 remains open.

Reconciliation + Copilot round (2026-09-06): `origin/main` advanced past the
fork point with TASK-381 (v0.52.0), docs/dependabot merges, and then ND-397
(PR #488, v0.53.0), so main was merged into the branch twice. The
kanban-columns-grid conflict was resolved by keeping the TASK-381
lane-scroller structure and re-applying the ND-408 archive auto-open,
filtered empty copy, and data attributes on it; ND-397's comment
expand/collapse files merged cleanly. Product version advanced to v0.54.0
(both sides claimed v0.53.0 after main released it via ND-397; ND-421
targets v0.52.1), and the CHANGELOG Unreleased keeps only the ND-408
entries. The Copilot review thread on PR #483 was triaged: the Archive
open state is now derived from user intent plus a dismissible filter-driven
auto-open, so clearing filters returns the group to its pre-filter
open/closed state instead of leaving a filter auto-open behind, with three
component regression tests. Thread replied to and resolved on GitHub;
revalidation green.

## Context

PR #469 and PR #470 both add task-filter UI to the same Kanban board area and
share the same merge base; `main` has not touched Kanban files since, so their
changes apply cleanly onto current main except version/docs conflicts. Rather
than merging two visually heavy, overlapping surfaces (stacked toolbar cards
with helper text and result-count pills), this task delivers one united,
self-evident surface: search and filter live on a single compact row.

## Scope

- Port the server-backed search foundation unchanged: `searchProjectTaskIds`
  service, `/api/projects/{projectId}/tasks/search` route, and the
  `useKanbanTaskSearch` hook (200ms debounce, abort, error + retry).
- Unified filter core in `components/kanban/kanban-filter-utils.ts`:
  search IDs AND labels (all selected) AND epics (any selected, "No epic"
  matches tasks without an epic), with an identity short-circuit when nothing
  is active, and filtered drag-drop mapping that keeps hidden tasks in place.
- `KanbanFilterBar`: search input (clear button, loading spinner, error + retry
  only) and one Filter trigger (active count badge) opening a portal popover
  grouping Labels and Epics as multi-select wrap chips (`aria-pressed`, color
  dot when idle, pastel fill + check when selected). A small search field at
  the top of the popover filters label/epic options live, groups larger than
  12 chips collapse behind a "Show all N labels/epics" toggle (auto-expanded
  while searching), and a footer with an always-present **Done** button (closes
  the panel, restores focus to the trigger) plus a "Clear all filters" action
  that appears only while anything is active. The popover opens directly under
  the trigger and only flips above when there is under 240px of room below; on
  narrow viewports it sizes to the trigger so it stays aligned with it.
- Filtered board: empty columns say `No matching <status> tasks`, archived
  Done matches auto-open the Archive group, and the mobile status navigation
  keeps working.
- Viewers keep the filter surface but never get create or drag affordances.

## Out Of Scope

- Reintroducing the superseded stacked toolbar UI, helper/explanation copy, or
  "X / Y tasks" result-count pills (superseding #469/#470 changes them).
- Clickable label chips on task cards as a second filter surface (the popover
  is the only filter surface).
- Server-side filtering/pagination of the board beyond the existing search
  route; label/epic filtering stays client-side over loaded tasks.
- Changing Kanban drag behavior, persistence semantics, or board data loading.

## Acceptance Criteria

1. One search row sits above the board: typing searches server-side across
   titles, descriptions, references, statuses, labels, epics, assignees,
   comments, attachments, and related tasks, with debounced loading feedback,
   a clear button, and an error state offering retry.
2. One Filter button opens a popover directly under it (flipping above only
   when there is under 240px of room below, and never stretching to the top of
   the viewport) grouping Labels and Epics (plus "No epic") as wrap chips with
   `aria-pressed` and check marks. The trigger shows an active-selection count
   (labels + epics only); an in-popover search field narrows label/epic
   options and groups beyond 12 chips hide behind a "Show all N" toggle;
   "Clear all filters" appears only while search or selections are active and
   resets everything.
3. Search, labels (AND), and epics (OR, including "No epic") combine; tasks
   from other projects never appear, and a task detail modal is not required
   to understand any state.
4. Dragging a visible task while filters are active lands relative to visible
   cards only; tasks hidden by the filter keep their relative order after
   persistence and reload.
5. Archived Done tasks matching the active filters surface in an open Archive
   group; clearing filters restores the un-filtered board exactly.
6. The filter surface contains no helper text and no result-count pill; at
   375px, in landscape, and in dark mode the popover stays fully on-screen
   without horizontal page scroll.

## Definition Of Done

- Kanban search route/service, filter utilities, filter bar, board wiring, and
  columns grid are covered by focused unit, component, and Playwright specs
  (combined filter semantics, filtered drag with interleaved hidden tasks,
  viewer read-only affordances, clear-all, popover containment).
- `npm run lint`, `npm run rls:check`, `npm test`, `npm run test:coverage`,
  `npm run build`, and `npm run test:e2e` pass; `git diff --check` is clean.
- `package.json`/`package-lock.json` advance to v0.54.0, `CHANGELOG.md`
  carries the `## Unreleased` entry, and `journal.md` logs the execution.
- The branch is pushed and a ready-for-review PR superseding #469 and #470 is
  open; both superseded PRs are commented and closed; the Nexus Dash board
  card reflects the final status.

## Runtime Assumptions

- Local database-backed validation uses the repository `.env` contract and a
  reachable PostgreSQL instance when migration or E2E execution requires it.
- The Nexus Dash task card exists (ND-408, created via the agent API) and
  drives the branch/PR identity; no secrets leave `.env`/`.config` files.

## Previous Task Snapshot

The previous `tasks/current.md` brief (TASK-342, released in v0.51.0) is
preserved verbatim below for history.

---

# Current Task

## TASK-342: Context Knowledge Stewardship and Attachment Provenance

## Status

In review via PR #459 on `feature/task-381-bounded-kanban-lanes`. On
2026-09-02 the branch was reconciled twice with current `origin/main`: first
against the agent API program, calendar, meeting-stewardship, and dependabot
changes (release advanced from the stale `v0.38.0` to `v0.51.0`), then again
after TASK-342 (PR #451) merged and advanced main itself to `v0.51.0`. Both
rounds resolved PR #459 conflicts without product-code changes; the release
now sits at `v0.52.0` (merge 7293cd6) and revalidation on the final merged
tree was green: lint, rls:check, release:check, 1,216 tests passed / 2
skipped, coverage 91.52/81.57/92.3/92.01, and a production build. Copilot
then completed a review on the reconciled head (2026-09-02/03) and its three
threads were triaged on 2026-09-03: the archived Done scroller received the
same visible focus-visible ring as the lane scrollers, read-only (viewer)
task cards became keyboard-operable with a button role, tab stop, and
Enter/Space activation, and the stale version-description thread was closed
against the reconciled v0.52.0 release notes with rationale (no code change
needed). Regression coverage was added in the component and Playwright
suites; revalidation is green.

## Objective

Keep dense Kanban boards usable by bounding each visible lane to a responsive
viewport-aware height and scrolling each lane's task region independently.
Lane metadata and board actions must remain visible while long task lists are
reviewed or reordered.

## Product Decisions

- Each lane uses `clamp(20rem, 64dvh, 42rem)` so it remains useful on small
  screens without growing indefinitely on large displays.
- The lane header and count stay outside the scroll region. The existing board
  header, create action, archive control, and mobile status dock retain their
  established placement.
- The task region is an explicitly named, keyboard-focusable scroll region
  with contained overscroll and a stable scrollbar gutter.
- All lane components remain mounted while the mobile status dock changes the
  visible lane, preserving their native scroll positions.

## Scope

- Bound active Kanban lane height on mobile and desktop.
- Make every lane's task area vertically scrollable without coupling lane
  scroll positions.
- Preserve pointer and keyboard drag-and-drop, including long-lane auto-scroll
  and movement within or between lanes.
- Preserve archive access, task selection/editing, viewer behavior, live
  refresh, and mobile status navigation.
- Add focused component and Playwright coverage for layout, accessibility,
  scrolling, responsive containment, and drag behavior.

## Out Of Scope

- Task search, label filters, or Epic filters.
- Task virtualization, pagination, persistence changes, or API changes.
- Redesigning task cards, the task detail dialog, the project shell, or other
  dashboard sections.
- URL-backed or persisted lane scroll positions across full navigation.

## Runtime Assumptions

- Existing PostgreSQL, authentication, and `.env` contracts remain unchanged.
- `@hello-pangea/dnd` continues to provide pointer and keyboard sensors and
  recognizes the focusable lane task area as its scroll container.
- The user has explicitly reprioritized TASK-381 ahead of the still-pending
  broad TASK-100 and TASK-133 UX passes.
- Preview validation uses `feature/task-381-bounded-kanban-lanes` as the
  explicit workflow `git_ref`.

## Acceptance Criteria

1. Every visible lane is `clamp(20rem, 64dvh, 42rem)` high and cannot grow with
   its task count.
2. Lane title and visible task count remain fixed while only that lane's task
   region scrolls; scrolling one lane does not move another lane.
3. Each task region has an accessible lane-specific name, keyboard focus, a
   visible focus indicator, contained overscroll, and stable scrollbar space.
4. Pointer and keyboard drag-and-drop continue to work within and across long
   lanes, with destination auto-scroll and no unrelated scroll reset.
5. The Done archive remains reachable outside the Done task-list overflow and
   the global create action remains outside all lane scroll regions.
6. Switching lanes through the mobile status dock preserves each mounted
   lane's scroll position and produces no horizontal viewport overflow at
   375 px or in mobile landscape.
7. Owner/editor and viewer behavior, task modal actions, live refresh, light
   and dark themes, and reduced-motion behavior remain unchanged.

## Definition Of Done

- The bounded independent lane layout and accessibility semantics are
  implemented with focused automated coverage.
- UI/UX Pro Max guidance is applied for `dvh` sizing, keyboard access, visible
  focus, responsive containment, theme parity, and non-jacking scroll behavior.
- `git diff --check`, release validation, `npm run lint`, `npm run rls:check`,
  `npm test`, `npm run test:coverage`, `npm run build`, and `npm run test:e2e`
  pass.
- The explicit-branch Preview workflow succeeds and focused Preview browser
  checks pass at mobile and desktop widths.
- The branch is committed and pushed, a ready-for-review PR is open, required
  checks pass, and review state is recorded. The Copilot review threads on PR
  #459 are addressed and resolved on the updated head.
- `tasks/current.md`, `tasks/backlog.md`, `CHANGELOG.md`, and `journal.md` are
  consistent, and the final handoff records PR, commit, Preview, validation,
  and review evidence without merging the PR.
