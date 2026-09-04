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
- `package.json`/`package-lock.json` advance to v0.52.0, `CHANGELOG.md`
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

Implementation complete on
`feature/task-342-context-knowledge-stewardship-r4`, refreshed onto current
`main` after TASK-406 merged; ready for review.

Follow-up refinement (2026-09-02): the card UI now shows only `Created` and
`Last edit` provenance chips. Steward assignment controls, the steward chip,
and the derived `Needs review` / `Reviewed X` badge were removed from the UI.
Agent attribution was confirmed supported: cards created or edited by an
agent show the agent avatar and credential label, so no separate actor-identity
task is needed.

## Context

Context cards today expose only title, color, content, and attachments. There
is no record of who created the card or who last edited it. A card written by
a former project member or agent looks identical to a fresh card written
yesterday.

TASK-337's universal project-actor model is not implemented yet. This task
introduces a deliberately narrow, reusable context-card actor contract for
human project members and active project agent credentials — mirroring the
TASK-330 meeting-todo pattern — without expanding into cross-artifact ownership
or a shared scheduling system.

## Scope

- Persist durable creator and last editor identity for every context card,
  including safe display snapshots.
- Backfill existing card creators from existing provenance (the resource
  `createdAt` is preserved and remains the immutable creation timestamp).
- Show `Created` and `Last edit` chips with actor identity and timestamps on
  every card: agent actors render the agent avatar plus credential label,
  human actors render their avatar, and removed members render their recorded
  display snapshot.
- Surface the already-stored attachment uploader (human identity and display
  snapshot) on context card attachments so each link/file shows who added it.
- Render the provenance chips legibly in light and dark themes (cards use
  fixed pastel backgrounds, so chips use fixed light surfaces).
- Persist steward assignment and review derivation at the service boundary
  only; these are not surfaced in the card UI.

## Out Of Scope

- A universal actor table or cross-artifact actor migration (TASK-337).
- Cross-project knowledge responsibility queues (TASK-346).
- New agent capability vocabulary or granular context scopes (TASK-331).
- Assignment notifications or preference controls beyond what the existing
  in-product surfaces already expose (TASK-347).
- Edit locking or revision preconditions on context cards (TASK-339).
- Persisting a full attachment-lifecycle event log. The migration adds
  `uploadedByKind` and `uploadedByDisplayNameSnapshot` to `ResourceAttachment`
  so future producers can rely on a stable contract; existing rows backfill
  `uploadedByKind = human` from the `uploadedByUserId` foreign key.
- Steward assignment UI and the derived review/staleness badge in the card
  grid, preview modal, and edit modal. The underlying steward persistence and
  service-boundary validation remain in place.

## Acceptance Criteria

1. Each context card exposes creator and last editor identity, with actor
   kind, stable identifier, display label, avatar treatment, and current
   access state.
2. New cards record creator and last editor on creation. Existing cards
   backfill creator and last editor from existing provenance (when present)
   and otherwise expose `Unknown actor` snapshots that are clearly labeled
   inactive so they cannot be confused with live collaborators. Editing a
   card advances the last editor but never replaces creator identity.
3. Agent-authored cards show the agent avatar and credential label in both
   the `Created` and `Last edit` chips; no additional actor-identity work is
   required for agent attribution.
4. Cards created or edited by removed human members continue to show their
   original identity and are labeled as no longer project-active.
5. Each context-card attachment shows the recorded uploader with a stable
   display label and avatar treatment. Attachments uploaded by removed
   human members continue to show their original identity and are labeled
   as no longer project-active.
6. The card UI contains no steward assignment controls, no steward chip, and
   no `Needs review` / `Reviewed X` badge; only `Created` and `Last edit`
   chips with timestamps remain, legible at 375px and desktop widths, in
   light and dark themes, with visible focus and semantic status text.

## Definition Of Done

- Prisma schema, migration, RLS inventory, services, routes, UI projections,
  attachment uploader display, and relevant documentation are updated
  together.
- Focused unit, service, route, component, and Playwright coverage exercises
  human/agent actor attribution, inactive actors, attachment uploader display,
  and optimistic projection.
- `npm run lint`, `npm run rls:check`, `npm test`, `npm run test:coverage`,
  `npm run build`, and a focused context-card Playwright coverage pass.
- `tasks/current.md`, `tasks/backlog.md`, `tasks/task-342-context-knowledge-stewardship.md`,
  and `journal.md` reflect the delivered behavior.
- The branch is pushed, a ready-for-review PR is open, required checks are
  green, and initial Copilot review feedback is resolved or documented.

## Runtime Assumptions

- Local database-backed validation uses the repository `.env` contract and a
  reachable PostgreSQL instance when migration or E2E execution requires it.
- No new secrets or external provider configuration are introduced.
- Preview deployment is not an acceptance requirement; local browser coverage
  is sufficient unless review feedback exposes a preview-only concern.
