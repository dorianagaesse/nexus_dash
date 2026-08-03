# Current Task

## Task

- ID: TASK-353
- Title: Movable meeting-todos modal
- Status: In review (2026-08-03)
- Branch: `feature/task-353-movable-meeting-todos-modal`
- Pull request: [#411](https://github.com/dorianagaesse/nexus_dash/pull/411)
- Brief:
  [`task-353-movable-meeting-todos-modal.md`](./task-353-movable-meeting-todos-modal.md)

## Objective

Replace the always-expanded desktop meeting-todo popup with a compact,
bottom-right `Todos` entry that opens the same project-scoped work in an
accessible modal users can reposition without losing containment or context.

## Scope

- Replace the desktop floating table/collapse treatment with a compact fixed
  button containing the established todo icon and a visible `Todos` label.
- Open aggregated project meeting todos in the shared accessible dialog
  foundation, retaining open, overdue, recently completed, source-meeting,
  completion/reopen, pending, and viewer behavior.
- Provide a visible drag handle for pointer users and an equivalent keyboard
  movement interaction.
- Clamp movement to the visible project-page content area and re-clamp after
  viewport changes so the dialog and its close control remain reachable.
- Close the Todos dialog before opening a source meeting, avoiding stacked
  modal focus traps.
- Keep TASK-332's route-backed mobile Todos destination and grouped navigation
  unchanged; the desktop quick entry remains absent below the desktop
  breakpoint.
- Add focused component and browser coverage for trigger, modal, focus,
  movement, containment, actions, responsive visibility, and themes.

## Out Of Scope

- Changing meeting-todo persistence, aggregation order, overdue rules,
  assignment, accountability, notifications, or authorization.
- Replacing `/projects/[projectId]/todos` or changing project navigation.
- Making other application dialogs movable.

## Runtime Assumptions

- TASK-316, TASK-321, TASK-322, and TASK-332 behavior is present on
  `origin/main`; no database or API migration is required.
- The draggable desktop surface is rendered only when the current project has
  meeting todos, matching the existing quick panel.
- The existing local PostgreSQL and `.env` prerequisites are unchanged.
- Browser validation uses the existing project meeting-todo fixtures.
- If preview validation is required, it must pass
  `git_ref=feature/task-353-movable-meeting-todos-modal` explicitly.

## Acceptance Criteria

1. Desktop project pages with meeting todos show one compact bottom-right
   button with a Lucide todo icon, visible `Todos` label, and an accessible
   name that communicates the open and overdue counts.
2. Activating the button opens a named modal containing the existing
   project-scoped open, overdue, and recently completed todo presentation.
3. The modal traps focus while open, closes with its close control, Escape, or
   outside interaction, and restores focus to the `Todos` trigger.
4. Pointer users can drag the modal from a visible handle; keyboard users can
   focus the same handle and move it with arrow keys without relying on a
   pointer gesture.
5. Pointer and keyboard movement stays within the visible project-page content
   bounds, and resize or orientation changes cannot strand the modal or its
   close control off screen.
6. Completion/reopen behavior, pending feedback, overdue treatment, viewer
   read-only treatment, and source-meeting navigation remain intact; source
   navigation produces one meeting dialog rather than stacked dialogs.
7. At widths below the desktop breakpoint, the floating trigger and dialog are
   absent and the route-backed project Todos navigation remains unchanged.
8. The trigger, modal, movement controls, scrollable content, light/dark
   themes, reduced-motion preference, and a 375 px viewport meet the UI/UX Pro
   Max accessibility and containment checks.
9. Focused component and Playwright coverage plus the required repository
   validation pass.
10. Release metadata, task tracking, and validation evidence are updated in
    the same pull request.

## Definition Of Done

- The movable dialog is implemented as a focused client component on top of
  the shared Radix dialog foundation, with no new persistence or transport
  coupling.
- Movement uses bounded transforms, pointer capture, keyboard alternatives,
  semantic instructions, 44 px controls, and reduced-motion-safe styling.
- Existing meeting-todo permissions and mutations are reused without contract
  changes.
- `npm run lint`, `npm run rls:check`, `npm test`, `npm run test:coverage`,
  `npm run build`, release validation, and relevant Playwright coverage pass.
- The feature release advances to `v0.34.0` with matching changelog and
  lockfile metadata.
- The branch is committed and pushed, a ready-for-review PR is open, and the
  initial Copilot review/check outcome is handled without merging the PR.

## Progress

- Read the repository execution, architecture, runtime, and PR contracts.
- Created the dedicated worktree from merged `origin/main`.
- Reviewed TASK-316 and TASK-332 behavior plus the shared accessible dialog
  foundation.
- Completed the UI/UX Pro Max design-system, accessibility, movement,
  responsive, reduced-motion, and Next.js implementation reviews.
- Defined pointer and keyboard movement with project-content containment while
  retaining the mobile route-backed Todos experience.
- Replaced the desktop expanded/collapse panel with a count-aware fixed
  `Todos` trigger and a shared-foundation modal.
- Added a visible pointer drag handle, arrow and Shift+Arrow movement,
  project/viewport clamping, resize re-containment, and breakpoint-safe close
  behavior.
- Increased todo row actions to 44 px targets and preserved completion,
  reopen, overdue, recently completed, viewer, and source-meeting behavior.
- Ensured source-meeting navigation closes the Todos focus trap before opening
  the meeting dialog.
- Added focused component coverage plus full-flow browser coverage for mobile
  absence, desktop entry, focus, light/dark themes, pointer and keyboard
  movement, resize containment, mutations, and source navigation.
- Visually reviewed the generated desktop light and dark modal screenshots.
- Prepared feature release `v0.34.0`.
- Addressed both initial Copilot review comments: no-op containment ticks no
  longer update React position state, and repeated same-direction arrow moves
  replace the live-region announcement node so assistive technology receives
  every movement update.

## Outcome

- Desktop meeting todos now stay out of the way until requested from one
  compact bottom-right entry.
- The aggregate opens with modal semantics and remains movable and reachable
  by pointer and keyboard users inside the visible project content.
- Existing project-scoped mutations, permissions, overdue rules, source
  navigation, and the route-backed mobile Todos experience are unchanged.

## Validation

- `npm run lint`, `npm run rls:check`, and `git diff --check` passed.
- `npm test`: 143 files passed, 2 skipped; 1000 tests passed, 2 skipped.
- `npm run test:coverage`: 91.37% statements, 81.33% branches, 92.2%
  functions, 91.88% lines.
- `npm run build` passed with the documented local-safe database and
  placeholder-secret environment.
- Focused component coverage passed 5 tests; the affected meeting-todo and
  dashboard smoke browser flows passed 7 scenarios.
- The complete Playwright Chromium suite passed all 31 scenarios with outbound
  email delivery disabled for local-safe password-recovery testing.
- Desktop 1280 px light/dark screenshots were generated and visually inspected;
  the modal hierarchy, theme contrast, drag affordance, target sizing, and
  background context remained clear.
- `npm run release:check -- --base origin/main --branch
  feature/task-353-movable-meeting-todos-modal` passed for `v0.34.0`.
- Planning commit `5829401` and implementation commit `2d61245` are pushed;
  ready-for-review PR #411 is open.
- Post-review focused component tests, full lint, and production build passed.
