# Current Task

## TASK-381: Bounded Kanban Height With Independently Scrollable Lanes

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
