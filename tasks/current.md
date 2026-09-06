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
After PR #488 (ND-397) merged into main, the branch was reconciled a second
time; conflicts were release metadata — main had advanced to
v0.53.0, so the fix retargeted from v0.52.1 to v0.53.1 via `release:version --
fix` with the CHANGELOG bullet moved to a dated v0.53.1 section — and the
tasks/current.md brief collision, resolved by keeping ND-421 active and
preserving the ND-397 brief verbatim as a previous snapshot; no product-code
conflict). Release metadata advances patch to v0.53.1 over the current
origin/main base and `npm run release:check` passes. Earlier reconciliations:
after PR #485 merged (merge 0b992fb; journal.md top-entry collision only) PR
checks on that reconciled head were green (Quality Core, E2E Smoke, Tenant
Isolation, Container Image, check-name; merge state clean); one E2E Smoke
failure on the pre-reconciliation docs commit cbf7f03 (home-entry
`data-link-count > 780`) was confirmed as a one-off environment flake by the
fully green re-run. Copilot's initial review items were applied (changelog/
journal dates aligned to the commit UTC date; scrollbar class list as a
joined token array) with replies posted; a re-review is pending on the GitHub
UI side. Nexus Dash board card ND-421 (fix label, GitHub issue #484) is the
source of truth and reflects In Progress until the PR merges.

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

The previous `tasks/current.md` brief (ND-397, released in v0.53.0, with its
TASK-381 snapshot) is preserved verbatim below for history.

---

# Current Task

## ND-397: Constrain long task comments with expand/collapse

## Status

Implemented and validated on `feature/nd-397-comment-expand-collapse`
(worktree `../nexus_dash_task397`, branched from `origin/main` at 1daffc0).
The Nexus Dash board card ND-397 (feature label) is the source of truth and
moved to In Progress on 2026-09-05. No GitHub issue exists for this task; the
PR carries the ND-397 reference. Validation is green: lint, `rls:check`,
`release:check`, unit tests (1225 passed / 2 skipped), coverage thresholds,
production build, and the focused Playwright spec. Ready for review.

## Context

Long comments can dominate the task detail modal and make adjacent discussion
difficult to scan. Every task-comment surface should show comment bodies at a
consistent default maximum visible height, clip overflow without breaking
words or horizontal layout, and offer an explicit accessible expand/collapse
control only when a comment actually overflows. Short comments must stay fully
visible with no extra control.

## Scope

- Add a reusable comment-body presentation component
  (`components/kanban/task-comment-body.tsx`) that renders the mention-aware
  body with a consistent collapsed cap, a measured overflow decision, and an
  accessible expand/collapse toggle.
- Use that component in the task detail modal comment thread
  (`components/kanban/task-detail-modal.tsx`), the only surface that renders
  full comment bodies today, so any future comment surface inherits the same
  treatment.
- Add focused component coverage for short, long, expanded, and collapsed
  comments and a focused Playwright spec for real-browser overflow behavior.

## Product Decisions

- The collapsed cap is a fixed height derived from the comment body's own
  line height (six lines of `text-sm`/`leading-5` at the app font baseline:
  `7.5rem`), so the same cap applies on every layout and breakpoint.
- Overflow is measured against the rendered body (scroll height vs. cap)
  rather than estimated from text length, so mention chips and wrapping never
  misclassify a comment.
- The toggle is a text button with clear state copy (`Show more` / `Show
  less`), `aria-expanded`, and `aria-controls` pointing at the body it
  reveals; it appears only for overflowing comments.
- Clipping uses `max-height` + `overflow-hidden` with the existing
  `whitespace-pre-wrap break-words` body classes: lines wrap at word
  boundaries, and an unbroken string wider than the line still wraps instead
  of spilling, so no horizontal layout appears.

## Out Of Scope

- Comment authoring, editing, mention input, reactions, or agent-identity
  surfaces.
- Rich-text comment authoring/rendering (ND-398) and comment attachments
  (ND-399), which will build on the plain-text body presentation later.
- Constraining any non-comment text surface (task descriptions, meeting
  notes, context cards, roadmap notes).
- Board semantics, modal chrome, or lane behavior.

## Acceptance Criteria

1. Comment bodies have a consistent default maximum visible height in every
   task-comment surface, including responsive layouts.
2. Comments that exceed the limit are initially clipped without breaking
   words or horizontal layout.
3. An explicit, accessible expand/collapse control is shown only when a
   comment overflows; it reveals the complete comment and can restore the
   collapsed state.
4. The control has clear state text and is keyboard-operable with appropriate
   accessible semantics.
5. Short comments remain fully visible and do not show an unnecessary
   control.
6. The behavior is covered by automated UI tests for short, long, expanded,
   and collapsed comments.

## Definition Of Done

- The comment body presentation with measured expand/collapse is implemented
  in the task detail modal thread through a shared component.
- Focused component tests cover short (no control), long collapsed (control
  shown, body capped), expanded (full height, `Show less`), and re-collapsed
  states plus `aria-expanded`/`aria-controls` wiring; a focused Playwright
  spec covers real-browser overflow behavior for short and long comments.
- `npm run lint`, `npm run rls:check`, `npm run release:check`, `npm test`,
  `npm run test:coverage`, `npm run build`, and the focused Playwright run are
  green on the final tree.
- `package.json`/`package-lock.json` advance minor to v0.53.0 and the
  CHANGELOG `## Unreleased` entry documents the feature.
- The Nexus Dash board card ND-397 is updated (Done on delivery) and
  `tasks/current.md` + `journal.md` reflect the execution.
- Branch is pushed with an open ready-for-review PR referencing ND-397.

## Runtime Assumptions

- Existing PostgreSQL, authentication, and `.env` contracts remain unchanged;
  this task introduces no schema, service, or route changes.
- Comments are plain text with `@mention` highlighting; real-browser overflow
  behavior is validated by the focused Playwright run against a local
  database, and preview deployment is not an acceptance requirement for this
  presentational change.

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
