# Current Task

## Task

- ID: TASK-335
- Title: Expanded epic presentation
- Status: In review (2026-07-31)
- Branch: `feature/task-335-expanded-epic-presentation`
- Pull request:
  [#403](https://github.com/dorianagaesse/nexus_dash/pull/403)
- Brief:
  [`task-335-expanded-epic-presentation.md`](./task-335-expanded-epic-presentation.md)

## Objective

Make epic cards readable as project context on mobile and desktop while
preserving efficient scanning in dense project dashboards.

## Scope

- Replace the narrow two-column desktop epic-card treatment with a readable
  full-width responsive article layout.
- Keep the complete epic narrative and progress visible in natural reading
  order.
- Expose all linked tasks by default on mobile and use an explicit accessible
  disclosure only for dense desktop linked-task sets.
- Improve linked-task title/status readability without changing epic data or
  CRUD behavior.
- Add focused component and browser coverage.

## Runtime Assumptions

- Existing local PostgreSQL Docker and `.env` prerequisites are unchanged.
- Browser fixtures can create epics and linked tasks through existing APIs.
- Any preview validation must pass
  `git_ref=feature/task-335-expanded-epic-presentation` explicitly.

## Acceptance Criteria

1. Mobile epic cards expose complete context and linked work by default without
   per-epic disclosure interactions.
2. Desktop epic cards use a readable expanded layout while dense multi-epic
   views remain scannable.
3. Long descriptions and task titles wrap without clipping or horizontal page
   overflow.
4. Dense desktop linked-task disclosure is keyboard accessible, accurately
   announced, and at least 44 px high.
5. Epic articles and progress expose semantic names and values, with status
   available as text.
6. CRUD permissions, section collapse persistence, and mutation behavior remain
   unchanged.
7. Light/dark and 375 px responsive checks pass.
8. Focused component and Playwright coverage passes.

## Definition Of Done

- The implementation satisfies the detailed task brief and UI/UX Pro Max
  accessibility/responsive review.
- Required validation, release metadata, and tracking documentation are
  complete.
- The branch is pushed and a ready-for-review PR is open with initial automated
  feedback handled without merging it.

## Progress

- Created the dedicated worktree from current `origin/main`.
- Read the project execution contract, system context, TASK-270 assessment, and
  existing epic implementation.
- Ran the UI/UX Pro Max design-system, responsive disclosure/accessibility, and
  Next.js guidance passes.
- Chose a full-width responsive article treatment with mobile-first linked-task
  expansion and bounded desktop disclosure.
- Replaced narrow side-by-side desktop cards with full-width semantic epic
  articles and a wide-screen narrative/progress/linked-work grid.
- Replaced truncated task chips with wrapping title/status rows, made all rows
  visible below the desktop breakpoint, and added an accessible bounded desktop
  disclosure for epics with more than six linked tasks.
- Added semantic article headings and progressbar values, 44 px section/action
  targets, responsive action placement, theme-safe tokens, and reduced-motion
  handling.
- Visually reviewed 375 px light and 1440 px dark evidence, then refined mobile
  header space and wide-screen linked-task density.
- Prepared feature release `v0.33.0`.

## Outcome

- Mobile users receive complete epic narrative, progress, and linked-task
  context without a second disclosure.
- Desktop epics use the full project-section width, keep multiple epics
  vertically scannable, and bound dense linked work behind an explicit control.
- Long descriptions, epic names, and task titles wrap without ellipsis or
  horizontal page overflow.
- Epic CRUD, viewer read-only behavior, status derivation, progress
  calculations, project-section persistence, and live-refresh locking remain
  unchanged.

## Validation

- Existing local Docker PostgreSQL on `127.0.0.1:5432` was healthy; all 49
  migrations were already applied.
- Focused component coverage passed 5 tests for section expansion, semantic
  context, viewer action safety, mobile-visible task rows, and desktop
  disclosure state, including live edit-name accessibility.
- Focused TASK-335 Chromium coverage passed at 375 px and 1440 px in light and
  dark themes, including complete mobile rows, bounded desktop rows, 44 px edit
  targets, full-width card stacking, and horizontal containment.
- `npm run lint`, `npm run rls:check`, and `git diff --check` passed.
- `npm test`: 143 files passed, 2 skipped; 997 tests passed, 2 skipped.
- `npm run test:coverage`: 91.37% statements, 81.33% branches, 92.2%
  functions, and 91.88% lines.
- Production `npm run build` passed through the complete E2E command.
- `npm run test:e2e`: all 31 Chromium scenarios passed.
- `npm run release:check -- --base origin/main --branch
  feature/task-335-expanded-epic-presentation` passed for `v0.33.0`.
- Implementation commit `5c10cc2` is pushed and ready-for-review PR #403 is
  open.
- Addressed Copilot's initial review comment by deriving the editing article's
  accessible name from the live name field with a saved-name fallback.
- Post-review focused component tests, targeted lint, `git diff --check`, and
  the production build passed.
