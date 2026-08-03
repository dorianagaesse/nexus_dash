# Current Task

## Task

- ID: TASK-335
- Title: Compact epic detail disclosure
- Status: In review (2026-08-03)
- Branch: `feature/task-335-expanded-epic-presentation`
- Pull request:
  [#403](https://github.com/dorianagaesse/nexus_dash/pull/403)
- Brief:
  [`task-335-expanded-epic-presentation.md`](./task-335-expanded-epic-presentation.md)

## Objective

Preserve the familiar compact epic cards while keeping long descriptions and
linked tasks out of the default dashboard scan. Show title/status, actions, and
progress immediately; reveal the rest through an independent per-card control.

## Scope

- Restore the one-column mobile and two-column desktop epic-card grid.
- Keep title, textual status, edit/delete actions, and semantic progress visible
  while each epic is collapsed by default.
- Reveal the full description and bounded linked-task summary only after the
  epic's accessible details control is activated.
- Preserve epic CRUD, permissions, status/progress behavior, project-section
  persistence, and the established token-driven visual presentation.
- Add focused component and browser coverage for disclosure and responsive
  behavior.

## Runtime Assumptions

- Existing PostgreSQL and `.env` prerequisites are unchanged.
- Browser fixtures can create epics and linked tasks through existing services.
- Any preview validation must pass
  `git_ref=feature/task-335-expanded-epic-presentation` explicitly.

## Acceptance Criteria

1. Mobile epic cards are collapsed by default and long descriptions/linked work
   do not add to the initial scroll length.
2. Desktop epics retain the familiar two-column card grid.
3. Each card's full-width 44 px disclosure is independently keyboard operable
   and exposes accurate `aria-expanded`/`aria-controls` state.
4. Expanded descriptions and linked-task summaries wrap without clipping or
   horizontal overflow, while sibling epics remain collapsed.
5. Epic articles and progress expose semantic names and values, with status
   available as text.
6. CRUD permissions, section collapse persistence, and mutation behavior remain
   unchanged.
7. Light/dark and 375 px responsive checks pass.
8. Focused component and Playwright coverage passes.

## Definition Of Done

- The implementation satisfies the clarified task brief and UI/UX Pro Max
  progressive-disclosure/accessibility review.
- Required validation, release metadata, and tracking documentation are
  complete.
- The branch is pushed and PR #403 is updated with checks monitored, without
  merging it.

## Progress

- Created the dedicated worktree from current `origin/main` and retained the
  existing TASK-335 branch and PR #403 for the clarified implementation.
- Read the project execution contract, system context, TASK-270 assessment, and
  existing epic implementation.
- Re-ran UI/UX Pro Max design-system, progressive-disclosure/accessibility, and
  Next.js guidance passes.
- Restored the established card grid, accent strip, compact title/status,
  progress treatment, and linked-task chips.
- Added independent collapsed-by-default details regions with explicit
  `Show details`/`Hide details` controls, semantic state, 44 px targets, and
  keyboard support.
- Kept full wrapping descriptions and the existing six-task-plus-remainder
  linked-work summary inside the expanded region.
- Updated component and Playwright coverage for the clarified behavior.
- Reconciled release metadata over merged TASK-352 and advanced the feature
  release to `v0.34.0`.

## Outcome

- Mobile users can scan several epics without long narratives increasing the
  initial page length.
- Desktop users again receive the familiar two-column compact-card layout.
- Users can reveal one epic's description and linked work without expanding its
  siblings.
- Epic CRUD, viewer read-only behavior, status derivation, progress calculations,
  project-section persistence, and live-refresh locking remain unchanged.

## Validation

- Fresh worktree-local PostgreSQL became healthy and all 49 migrations applied;
  RLS inventory and the full tenant-isolation matrix passed.
- Focused component coverage passes 5 tests for section expansion, collapsed
  details, semantic progress, independent disclosure, and live edit-name
  accessibility.
- Focused TASK-335 Chromium coverage passes at 375 px and 1440 px in light and
  dark themes, including hidden default details, Enter-key activation,
  independent state, restored desktop columns, 44 px controls, and horizontal
  containment.
- The production build passes with local-safe database and secret overrides.
- `npm run lint` and `git diff --check` pass.
- `npm test`: 143 files passed, 2 skipped; 999 tests passed, 2 skipped.
- `npm run test:coverage`: 91.37% statements, 81.33% branches, 92.2%
  functions, and 91.88% lines.
- Full Playwright validation passes all 32 Chromium scenarios.
- `npm run release:check -- --base origin/main --branch
  feature/task-335-expanded-epic-presentation` passes for `v0.34.0`.
- Earlier PR checks passed for branch naming, Quality Core, E2E Smoke, tenant
  isolation, and the container image; Copilot's initial accessibility comment
  remains resolved.
