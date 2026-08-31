# Current Task

## TASK-384: Kanban Task Filtering by Epic

## Status

In review on `feature/task-384-kanban-epic-filter` (started 2026-08-31).
Implementation and the complete local validation baseline are green; branch
Preview validation and required GitHub checks remain pending.

## Local Validation Evidence

- `git diff --check`: passed.
- Release policy passed against `origin/main` for the independent feature bump
  from `0.38.0` to `0.39.0`.
- `npm run lint`: passed.
- `npm run rls:check`: passed.
- Full Vitest run: 151 files passed, 2 skipped; 1,062 tests passed, 2
  skipped. The worktree `.env` was loaded for required database configuration
  while preserving Vitest's intended `NODE_ENV=test`.
- Coverage passed at 91.37% statements, 81.33% branches, 92.20% functions,
  and 91.88% lines.
- Production build and TypeScript validation passed with process-local
  localhost database and non-secret signing/encryption placeholders; no
  runtime configuration file or secret was changed.
- Dedicated TASK-384 Playwright spec: 3 passed, covering one/multiple named
  Epics, `No epic` alone and combined, clear/no-result/archive states, project
  isolation, viewer behavior, responsive themes, and persisted pointer/keyboard
  drops with hidden interleaved tasks.
- Full Playwright run: all TASK-384 tests and the existing Kanban smoke passed;
  35 passed and 1 Preview-only test skipped. Two unrelated overlay/app-shell
  setup cases timed out before their target assertions, then both complete
  unchanged specs passed on immediate rerun (9 passed).

## Objective

Let project collaborators focus the Kanban board on tasks linked to one or more
selected Epics, including an explicit `No epic` option, without weakening
authorization, archived-task discoverability, responsive usability, or
drag-and-drop ordering correctness.

## Product Decisions

- Epic selection is a component-local multi-select and resets on fresh
  navigation; URL persistence is outside this task.
- Selected Epics use `OR` semantics because each task has at most one Epic.
  `No epic` participates in the same set and can be selected alone or alongside
  named Epics.
- Empty Epic selection means no Epic predicate is applied. Epic filtering is an
  isolated category predicate designed to compose with future search and label
  predicates through `AND` across categories.
- Result counts include authorized active and archived tasks. Matching archived
  tasks remain read-only and are exposed through the existing Done archive.
- Filtering does not rewrite persisted task order. Drag destinations are mapped
  from filtered positions back into the complete source and destination columns:
  insert before a visible destination anchor, after the final visible task when
  dropped at the visible end, or at the full-column end when no destination task
  is visible. Hidden tasks keep their relative order.
- This PR remains independent from TASK-382. It therefore owns an isolated Epic
  filter component plus focused predicate and drop-mapping utilities. A later
  integration should deduplicate the shared drop helper and compose Epic matching
  into the combined search/label filter pipeline.

## Scope

- Add an accessible Epic-filter surface above the Kanban lanes containing all
  project Epics and a distinct `No epic` option.
- Expose selected state semantically and visually, show active-filter context and
  a polite `shown / total` result count, and provide clear-Epics and clear-all
  actions.
- Filter active and archived tasks, automatically expose matching archive
  results, and keep desktop lane counts, mobile status counts, and empty states
  aligned with visible results.
- Preserve pointer and keyboard drag-and-drop for editable tasks while filters
  hide interleaved tasks, without disturbing hidden-task relative order.
- Preserve viewer read-only behavior and existing project authorization
  boundaries.
- Add focused utility/component coverage and a dedicated TASK-384 Playwright
  specification for Epic combinations, `No epic`, clearing, empty results,
  archive behavior, viewer behavior, and filtered pointer/keyboard dragging.
- Validate responsive containment, light/dark parity, keyboard-only use, reduced
  motion, and 375px/landscape layouts.

## Out Of Scope

- TASK-382 search, label filters, searchable API behavior, or shared toolbar
  integration.
- URL/query-string persistence or server-persisted filter preferences.
- Making archived tasks draggable or changing archive storage semantics.
- Database migrations, agent API or OpenAPI changes, README changes, or an ADR.
- Merging TASK-381, TASK-382, or this PR; all remain independent and open.

## Reprioritization Decision

The user's direct assignment explicitly reprioritizes TASK-384 ahead of the
pending TASK-100, TASK-133, and TASK-108 dependency sequence. The implementation
must preserve their intended accessibility and task-flow quality rather than
silently claiming those dependencies are complete.

## Prerequisites And Runtime Assumptions

- Branch base is `origin/main` commit
  `77686d69751ead70524e82d05f16522b311abe89`, whose product version is
  `0.38.0`; this independent `feature/*` branch therefore targets `0.39.0`.
- The project page already supplies authorized project Epics and tasks to the
  client Kanban board. No new endpoint or persistence access is required.
- Existing local `.env` values are copied only as ignored worktree runtime
  configuration; no secrets are committed, printed, or modified.
- Preview validation uses the manual Preview workflow with
  `feature/task-384-kanban-epic-filter` passed explicitly as `git_ref`, followed
  by checkout/revision/readiness evidence and focused remote Playwright checks.
- Copilot review is unavailable because the account is out of credits. Per the
  user's instruction, automated review is deferred for later DeepSeek review;
  required GitHub checks and all implementation/preview validation still apply.

## Acceptance Criteria

1. The Kanban board exposes a keyboard-operable, screen-reader-labeled
   multi-select containing every authorized project Epic and a distinct
   `No epic` option, with visible selected state in light and dark themes.
2. Selecting one or more named Epics shows tasks linked to any selected Epic;
   selecting `No epic` includes unassigned tasks in the same `OR` set.
3. Active-filter context, clear-Epics, clear-all, and a polite `shown / total`
   result count remain understandable and touch-safe at 375px, desktop, and
   landscape widths.
4. Active and archived tasks are filtered consistently; archived matches are
   discoverable through the existing archive, while lane/mobile counts and
   empty states reflect only visible results.
5. Editable users retain pointer and keyboard drag-and-drop with hidden,
   interleaved tasks. Persisted full-column ordering follows visible-anchor
   mapping and hidden tasks retain their relative order.
6. Viewers can filter and inspect authorized results but cannot mutate or drag
   tasks. No cross-project data or new persistence surface is introduced.
7. Focused unit/component tests and a dedicated Playwright spec cover one and
   multiple Epics, `No epic` alone and combined, clear/no-result states,
   archived matches, viewer behavior, and filtered pointer/keyboard dragging.

## Definition Of Done

- All acceptance criteria are implemented and reviewed against existing
  NexusDash UI patterns plus the UI/UX accessibility guidance.
- `git diff --check` and release-policy validation against the branch base pass.
- `npm run lint`, `npm run rls:check`, `npm test`, `npm run test:coverage`,
  `npm run build`, and `npm run test:e2e` pass.
- Manual UI/UX QA passes at 375px and desktop widths, in light and dark themes,
  with keyboard-only use, reduced motion, and landscape containment.
- `package.json`, `package-lock.json`, and `CHANGELOG.md` carry the feature
  version derived from the actual branch base.
- `tasks/current.md`, `tasks/backlog.md`, and `journal.md` record scope, status,
  decisions, validation, Preview evidence, and the review-credit exception.
- The branch is pushed without force, one ready-for-review PR to `main` is open,
  required GitHub checks pass, and a branch-explicit Preview plus focused and
  existing Kanban smoke flows pass against its immutable URL.
- The PR is left open and unmerged for the user's later DeepSeek review.

## References

- `agent.md`
- `project.md`
- `README.md`
- `docs/runbooks/release-versioning.md`
- `components/kanban-board.tsx`
- `components/kanban/kanban-columns-grid.tsx`
