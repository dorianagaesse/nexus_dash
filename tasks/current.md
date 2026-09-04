# Current Task

## ND-421: Match Kanban lane scrollbars to the app-wide smooth scrollbar styling

## Status

Delivered: PR #487 (https://github.com/dorianagaesse/nexus_dash/pull/487) is
open in ready-for-review state from
`fix/nd-421-kanban-lane-scrollbar-styling` and closes issue #484. Branch
created from `origin/main` (carries TASK-381 via merge 14a41af / PR #459); the
unmerged ND-408 filter-bar branch predates TASK-381 and was not touched. Local
validation is green: lint, rls:check, 1,218 tests passed / 2 skipped,
coverage 91.52/81.57/92.3/92.01, production build, and the full Playwright
suite (39 passed / 1 skipped) including both TASK-381 bounded-lane specs.
Release metadata advances patch to v0.52.1 and `npm run release:check` passes.
Nexus Dash board card ND-421 (fix label, GitHub issue #484) is the source of
truth and reflects In Progress until the PR merges.

## Context

TASK-381 (PR #459) bounded Kanban lane heights and made each lane's task
region independently scrollable; it also introduced the archived Done scroller
inside the Done lane. Those scrollers were left with the default browser
scrollbar, which looks out of place next to the smooth slim scrollbar
treatment used across the rest of the app (task detail modal, create-task
dialog, related-task field, roadmap lanes). This task applies that same
surface to the two TASK-381 scroller kinds.

## Scope

- Apply the app-wide slim scrollbar styling (thin scrollbar, 2px-wide rounded
  thumb over a transparent track, matching light/dark parity) to the Kanban
  lane task regions (`data-kanban-lane-scroll`) and the archived Done
  scroller in `components/kanban/kanban-columns-grid.tsx`.
- Keep the existing focusable scroll-region semantics (`role=region`,
  `tabIndex=0`, focus ring), `overscroll-y-contain`, and
  `[scrollbar-gutter:stable]` intact.
- Add focused component coverage asserting both scroller kinds carry the app
  scrollbar styling tokens.

## Out Of Scope

- Restyling any other default scroll region in the app (pre-existing modal
  comment lists etc.) — only the TASK-381 scrollers are in scope.
- Changes to lane sizing, drag-and-drop, archive behavior, or board semantics.
- The unmerged ND-408 Kanban search/filter work (separate branch/PR).

## Acceptance Criteria

1. Kanban lane scrollers and the archived Done scroller render the same
   scrollbar treatment as other app scroll areas in light and dark themes.
2. No regression in lane scrolling, keyboard focus, drag-and-drop, or
   375px/mobile behavior covered by the TASK-381 specs.

## Definition Of Done

- `components/kanban/kanban-columns-grid.tsx` applies the app scrollbar
  styling to both TASK-381 scroller kinds, with focused component assertions.
- TASK-381 Kanban component and Playwright specs still pass, and `npm run
  lint`, `npm run rls:check`, `npm test`, `npm run test:coverage`, `npm run
  build`, and the focused Kanban Playwright run are green.
- `package.json`/`package-lock.json` advance patch to v0.52.1 and the
  CHANGELOG `## Unreleased` entry documents the fix.
- The Nexus Dash board card ND-421 is updated (In Progress, then Done on
  delivery), keeps its relation to TASK-381, and `tasks/current.md` +
  `journal.md` reflect the execution.
- Branch is pushed with an open ready-for-review PR referencing issue #484.

## Runtime Assumptions

- Existing PostgreSQL, authentication, and `.env` contracts remain unchanged.
- This is a presentational follow-up to a merged behavior change; preview
  deployment is not an acceptance requirement, and local component +
  Playwright coverage is sufficient.

## Previous Task Snapshot

The previous `tasks/current.md` brief (TASK-381, released in v0.52.0) is
preserved verbatim below for history.

---

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
review threads were addressed and resolved on the updated head before
handoff.

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
