# Current Task

## Task

- ID: TASK-353
- Title: Movable meeting-todos panel
- Status: In review (2026-08-04 feedback addressed)
- Branch: `feature/task-353-movable-meeting-todos-modal`
- Pull request: [#411](https://github.com/dorianagaesse/nexus_dash/pull/411)
- Brief:
  [`task-353-movable-meeting-todos-modal.md`](./task-353-movable-meeting-todos-modal.md)

## Objective

Replace the always-expanded desktop meeting-todo popup with a compact,
bottom-right `Todos` entry that opens the same project-scoped work in an
accessible modeless panel. Users can reposition it while continuing to use the
rest of the project page without a blocking or blurred backdrop.

## Scope

- Replace the desktop floating table/collapse treatment with a compact fixed
  button containing the established todo icon and a visible `Todos` label.
- Open aggregated project meeting todos with modeless dialog semantics,
  retaining open, overdue, recently completed, source-meeting,
  completion/reopen, pending, and viewer behavior while the project page stays
  interactive.
- Let pointer users drag from anywhere on the panel, without a dedicated drag
  strip, and provide an equivalent compact keyboard movement control.
- Keep the header free of explanatory copy, animate dismissal toward the
  floating trigger, and restore the last bounded location when reopened.
- Clamp movement to the visible project-page content area and re-clamp after
  viewport changes so the panel and its close control remain reachable.
- Close the Todos panel before opening a source meeting, leaving the meeting
  dialog as the only modal surface.
- Keep TASK-332's route-backed mobile Todos destination and grouped navigation
  unchanged; the desktop quick entry remains absent below the desktop
  breakpoint.
- Add focused component and browser coverage for trigger, modeless behavior,
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
- Browser validation uses the existing project meeting-todo fixtures and an
  isolated PostgreSQL 16 database with all committed migrations.
- If preview validation is required, it must pass
  `git_ref=feature/task-353-movable-meeting-todos-modal` explicitly.

## Acceptance Criteria

1. Desktop project pages with meeting todos show one compact bottom-right
   button with a Lucide todo icon, visible `Todos` label, and an accessible
   name that communicates the open and overdue counts.
2. Activating the button opens a named modeless dialog containing the existing
   project-scoped open, overdue, and recently completed todo presentation.
3. The panel does not render a backdrop, blur, or page-wide pointer shield and
   does not trap focus; underlying controls and text fields remain usable while
   it is open. It closes with its close control or Escape and restores focus to
   the `Todos` trigger on explicit close.
4. Pointer users can drag the panel from anywhere on its surface without a
   dedicated drag strip; clicks still activate todo controls unless movement
   crosses the drag threshold. Keyboard users can focus the compact header
   control and move the panel with arrow keys.
5. Pointer and keyboard movement stays within the visible project-page content
   bounds, and resize or orientation changes cannot strand the panel or its
   close control off screen.
6. Closing animates the panel toward the floating `Todos` trigger, and
   reopening restores its previous bounded location for the current project
   page.
7. Completion/reopen behavior, pending feedback, overdue treatment, viewer
   read-only treatment, and source-meeting navigation remain intact; source
   navigation produces one meeting dialog rather than stacked dialogs.
8. At widths below the desktop breakpoint, the floating trigger and dialog are
   absent and the route-backed project Todos navigation remains unchanged.
9. The trigger, panel, movement controls, scrollable content, light/dark
   themes, reduced-motion preference, and a 375 px viewport meet the UI/UX Pro
   Max accessibility and containment checks.
10. Focused component and Playwright coverage plus the required repository
   validation pass.
11. Release metadata, task tracking, and validation evidence are updated in
    the same pull request.

## Definition Of Done

- The movable panel is implemented as a focused client component using Radix's
  modeless dialog mode, with no backdrop, focus trap, page inerting, or new
  persistence/transport coupling.
- Movement uses a click-safe threshold, bounded transforms, pointer capture,
  a compact keyboard alternative, semantic instructions, 44 px controls, and
  reduced-motion-safe styling.
- Existing meeting-todo permissions and mutations are reused without contract
  changes.
- `npm run lint`, `npm run rls:check`, `npm test`, `npm run test:coverage`,
  `npm run build`, release validation, and relevant Playwright coverage pass.
- The feature release advances to `v0.35.0` with matching changelog and
  lockfile metadata after merged TASK-335 occupied `v0.34.0`.
- The branch is committed and pushed, ready-for-review PR #411 is updated, and
  automated review/check feedback is handled without merging the PR.

## Progress

- Replaced the desktop expanded/collapse panel with a count-aware fixed
  `Todos` trigger and a movable modeless panel.
- Added drag-from-anywhere pointer movement with click suppression after the
  movement threshold, plus arrow and Shift+Arrow movement, project/viewport
  clamping, resize re-containment, screen-reader status, and breakpoint-safe
  close behavior.
- Removed visible helper copy, added a trigger-targeted exit animation, and
  retained the last bounded panel position across close/reopen cycles.
- Preserved completion/reopen, overdue, recently completed, viewer,
  source-meeting, and route-backed mobile behavior.
- Addressed initial Copilot review comments for no-op position updates and
  repeated live-region movement announcements.
- Applied product feedback by removing modal behavior, the overlay, blur, focus
  trap, and page inerting while preserving the panel across outside app use.
- Added component and Playwright regressions proving an underlying project text
  field remains usable while the Todos panel stays open.
- Generated and visually reviewed light/dark desktop panel captures with the
  surrounding project page undimmed.
- Merged current `origin/main` after TASK-335 landed and moved TASK-353 release
  metadata to `v0.35.0`; the complete post-merge validation passed.

## Outcome

- Desktop meeting todos stay out of the way until requested from one compact
  bottom-right entry.
- The aggregate opens as a modeless panel that remains movable and reachable
  while the underlying project page stays usable.
- Existing project-scoped mutations, permissions, overdue rules, source
  navigation, and the route-backed mobile Todos experience are unchanged.

## Validation

- Post-merge lint, RLS inventory, release policy for `v0.35.0`, production
  build, and `git diff --check` passed.
- `npm test`: 143 files passed, 2 skipped; 1003 tests passed, 2 skipped.
- `npm run test:coverage`: 91.37% statements, 81.33% branches, 92.2%
  functions, and 91.88% lines.
- The complete post-merge Playwright Chromium suite passed all 32 scenarios.
- The TASK-353 browser regression passed against isolated PostgreSQL 16 and
  proves modeless focus/pointer behavior, text-field use, drag initiation over
  todo content without accidental activation, trigger-directed dismissal,
  close/reopen position restoration, re-containment, source navigation,
  mutations, mobile absence, and themes.
- Final 1280 px light/dark screenshots under
  `.tmp/task353-modeless-panel/` were visually inspected with no background
  dimming or blur.
