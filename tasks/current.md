# Current Task

## ND-379: Simplify task-description rich text with Codex-style Markdown shortcuts

## Status

Delivered (2026-09-06): PR #491
(https://github.com/dorianagaesse/nexus_dash/pull/491) is open from
`feature/nd-379-rich-text-markdown-shortcuts` (worktree
`../nexus_dash_nd379_wt`, created from `origin/main` at 633278e, v0.54.0).
Commits e6387a2 (implementation) and 630c0ca (v0.55.0 + CHANGELOG
`## Unreleased` entry) are pushed. The Nexus Dash board card ND-379 (feature
label) is Done with a Report section appended on 2026-09-06; no GitHub issue
exists for this task. Related rollout cards ND-380 (project card
descriptions) and ND-381 (meeting note input/output) stay Backlog. Scope and
product semantics were confirmed with the user on 2026-09-06 (whole-line
conversion; shortcuts only, toolbar unchanged).

Reconciled with `origin/main` on 2026-09-06 after the ND-421 merge (PR #487,
v0.54.1): release metadata kept v0.55.0 (feature minor above v0.54.1),
CHANGELOG ordered `## v0.55.0` above `## v0.54.1`, and this brief stays
active with the ND-421 brief preserved verbatim as the previous snapshot
below. Product code (editor, Kanban grid) auto-merged with no overlap.

Validation on the final tree (2026-09-06): lint, rls:check, 1294 unit tests
passed / 2 skipped, coverage 92.93/82.94/93.83/93.25, production build, and
`git diff --check` are green. The focused Playwright spec
`nd-379-rich-text-markdown-shortcuts.spec.ts` passes 2/2 against a real
server: typing `- ` into the empty editor converts, Enter continues the list,
and the saved `<ul><li>` value persists and re-renders; typing `* ` before an
existing paragraph converts the whole line and persists. Real-browser e2e
caught one gap the component suite missed: the editor's post-input caret
restore anchors the caret on the editor element rather than the text node, so
the bare-root conversion now accepts both caret shapes (component test added;
`rich-text-editor.test.ts` suite at 64).

## Context

Task descriptions are edited with the shared `RichTextEditor`
(`components/rich-text-editor.tsx`), a contentEditable surface where
formatting is reachable only through toolbar buttons: typing `* ` or `- ` at
the start of a line stays literal text, so composing a bullet list means
writing plain text first and converting afterwards with the mouse. Codex and
similar text-first composers turn the typed marker into the formatting. This
task makes list entry Codex-style: typing `* ` or `- ` at the start of a line
creates a bullet-list item on the spot, while every existing formatting
capability, content contract, and saved-content rendering stays unchanged.

## Product Decisions

(Confirmed with the user 2026-09-06.)

- **Whole-line conversion.** The shortcut fires at the start of any paragraph,
  empty or not: `- fix typo` converts the entire current paragraph into the
  first item of a new unordered list, preserving content and inline
  formatting, matching the semantics of the existing toolbar Bullet List
  button applied to the current paragraph.
- **Keydown trigger, space consumed.** Conversion happens when Space is typed
  while the current line's text before the caret is exactly `*` or `-`: the
  marker character and the space are consumed and never appear in the saved
  value. No conversion when the prefix is anything else (`** `, `*a`, mid-line
  `x-`), when the caret is inside an existing list, a code/token block, a
  blockquote, or while a mention autocomplete is active. Text after the caret
  stays where it was; typing continues at the same position inside the new
  item.
- **Native list editing afterwards.** Enter inside the new item continues the
  list and Enter on an empty item exits it through the browser's native
  contentEditable list semantics (no new interception code); existing
  paragraph-level Enter/Backspace handling is untouched. The caret anchor is
  the same invisible zero-width character the editor already uses, so
  serialization stays clean.
- **Toolbar unchanged.** The Bullet List toolbar button remains as an explicit
  affordance; no button is removed or relabeled. The editor is shared with the
  context-card surfaces, so the shortcut applies there too without extra
  work — rolling rich text out to further surfaces remains ND-380/ND-381.

## Scope

- Add line-start list-marker handling to `components/rich-text-editor.tsx` for
  `* ` and `- ` (unordered list items), covering both the empty-editor/root
  caret and the paragraph caret cases, with history (undo/redo) integration
  and emitted `onChange` values in canonical serialized rich-text HTML.
- Add focused component coverage in `tests/components/rich-text-editor.test.ts`
  for conversions, non-triggers, undo/redo, and emitted values.
- Add a focused Playwright spec for real-browser typing in the
  task-description editor (bullet creation, Enter continuation, exit,
  save/reopen render).
- Keep content compatibility: serialized `<ul>/<li>` values round-trip
  through `sanitizeRichText`/`RichTextContent` exactly like toolbar-created
  lists.

## Out Of Scope

- Other Markdown shortcuts (numbered `1. ` lists, headings, quotes, task
  checkboxes) — future candidates, not part of this card.
- Toolbar simplification or button removal; reducing or redesigning the
  editor shell.
- Rich text rollout to meeting notes (ND-381), project card descriptions
  (ND-380), comments (ND-398), or any other surface.
- Server/API/schema changes; preview deployment is not an acceptance
  requirement for this presentational change.

## Acceptance Criteria

1. Typing `* ` or `- ` at the start of an empty line — including the first
   line of an empty editor — creates an unordered list item and places the
   caret inside it, ready for text; the marker characters and their space are
   not part of the saved value.
2. Typing `* ` or `- ` at the start of a line that already contains text
   converts that whole line into a list item, preserving the existing content
   and its inline formatting, with the caret remaining at the start of the
   item content.
3. The conversion is a single undo step (Ctrl/Cmd+Z restores the typed
   marker) and is redoable; every emitted value is canonical serialized
   rich-text HTML containing `<ul><li>…</li></ul>`.
4. Non-trigger inputs stay literal: `*`/`-` without a following space,
   doubled markers (`** `), markers typed mid-line or after other content, and
   markers typed inside an existing list, code/token block, or blockquote do
   not convert.
5. Typing works like toolbar-created lists in a real browser: Enter inside an
   item adds the next item, Enter on an empty item exits the list, and a
   saved description with a list reopens and renders identically in edit and
   read-only presentation, with no empty `<ul>` artifacts.
6. Existing editor capabilities do not regress: toolbar formatting (bold,
   headings, italic, underline, numbered lists, code/token blocks), mentions,
   emoji, undo/redo, and the Kanban board/modal behavior covered by the
   TASK-381 and ND-408 specs.

## Definition Of Done

- `components/rich-text-editor.tsx` implements the line-start `* `/`- ` list
  conversion with caret, history, and serialization correctness.
- Component tests cover empty-line and existing-text conversion, both marker
  characters, non-trigger cases, undo/redo, and emitted serialized values; a
  focused Playwright spec covers real-browser typing flows in the
  task-description editor (create and edit surfaces).
- `npm run lint`, `npm run rls:check`, `npm test`, `npm run test:coverage`,
  `npm run build`, and the focused Playwright run are green; `git diff
  --check` is clean.
- `package.json`/`package-lock.json` advance minor to v0.55.0 over the current
  `origin/main` (v0.54.1 after the ND-421 merge) and the CHANGELOG dated
  `## v0.55.0` entry documents the feature.
- The Nexus Dash board card ND-379 is updated (In Progress, then Done on
  delivery) and `tasks/current.md` + `journal.md` reflect the execution.
- Branch is pushed with an open ready-for-review PR referencing ND-379; the
  Copilot review outcome is triaged and threads resolved before handoff.

## Runtime Assumptions

- Existing PostgreSQL, authentication, and `.env` contracts remain unchanged;
  this task introduces no schema, service, or route changes.
- Playwright validates the shortcut against a local database (edit/create
  flows in the task detail modal and create-task dialog); preview deployment
  is not an acceptance requirement.


## Previous Task Snapshot

The previous `tasks/current.md` brief (ND-421, merged in v0.54.1 via PR #487) is
preserved verbatim below for history, itself preserving the ND-408 brief.

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
Release metadata advances patch to v0.54.1 over the current origin/main base
(v0.54.0 after PR #483/ND-408 merged; earlier bases v0.53.0 after PR
#488/ND-397 and pre-#485) and `npm run release:check` passes. Each upstream
merge was reconciled from a worktree (root checkout hosts other sessions'
in-flight work): the journal.md top-entry collisions, the release-metadata
retargets (v0.52.1 -> v0.53.1 -> v0.54.1), and the tasks/current.md brief
collisions (ND-421 kept active; the preceding brief — ND-408, then ND-397 —
preserved verbatim as the previous snapshot) were resolved with no
product-code conflicts; `kanban-columns-grid.tsx` and its specs auto-merged
against both ND-397 and ND-408. PR checks on each reconciled head were green
(Quality Core, E2E Smoke, Tenant Isolation, Container Image, check-name;
merge state clean); one E2E Smoke failure on the pre-reconciliation docs
commit cbf7f03 (home-entry `data-link-count > 780`) was confirmed as a
one-off environment flake by the fully green re-run. Copilot's initial review
items were applied (changelog/journal dates aligned to the commit UTC date;
scrollbar class list as a joined token array) with replies posted; a
re-review is pending on the GitHub UI side. Nexus Dash board card ND-421 (fix
label, GitHub issue #484) is the source of truth and reflects In Progress
until the PR merges.

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

The previous `tasks/current.md` brief (ND-408, released in v0.54.0) is
preserved verbatim below for history.

---

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
