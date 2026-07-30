# Current Task

## Task

- ID: TASK-332
- Title: Mobile meeting-todo navigation
- Status: In review
- Branch: `feature/task-332-mobile-todo-navigation-rebased`
- Pull request: [#394](https://github.com/dorianagaesse/nexus_dash/pull/394)
- Brief: [`task-332-mobile-todo-navigation.md`](./task-332-mobile-todo-navigation.md)

## Objective

Replace the obstructive mobile meeting-todo popup with a project-scoped,
route-backed Todos destination and an extensible mobile navigation dock that
clearly separates workspace destinations from current-project destinations.

## Scope

- Add protected project meeting todos at `/projects/[projectId]/todos`.
- Add Todos to the current-project group in the adaptive sidebar and mobile
  navigation dock.
- Keep workspace navigation separate from project navigation on mobile through
  a contained, horizontally scrollable two-group rail.
- Provide URL-backed status views, source meeting links, and
  completion/reopening without cross-project aggregation.
- Hide the project-scoped floating todo panel on mobile while retaining it on
  desktop.
- Cover authorization, read-only behavior, accessibility, safe areas, light
  and dark themes, and 375 px containment.

## Runtime Assumptions

- Docker Engine, the repository environment, installed dependencies, and
  Playwright Chromium are available locally.
- The local PostgreSQL Compose service may be started for browser validation.
- Preview validation, if required, will use
  `git_ref=feature/task-332-mobile-todo-navigation-rebased`.

## Acceptance Criteria

1. Mobile primary navigation exposes distinct Workspace and Project groups in
   a contained horizontal rail with labels, Lucide icons, 44 px targets,
   safe-area clearance, keyboard access, and active state.
2. `/projects/[projectId]/todos` is protected, refreshable, deep-linkable, and
   strictly limited to the authorized current project.
3. Open/Completed views are URL-backed and work with browser Back/Forward.
4. Todos retain source-meeting context and sort overdue/recent work
   predictably without exposing another project's work.
5. Owners/editors can complete or reopen todos with clear feedback while
   viewers receive a read-only treatment.
6. Desktop and mobile project navigation both expose Overview and Todos while
   the floating panel remains desktop-only.
7. The touched UI passes 375 px, light/dark, keyboard, focus, and 44 px target
   checks without overflow or fixed-navigation collisions.
8. Existing meeting-note, notification-return, and desktop behavior remains
   intact.

## Definition Of Done

- Access-safe project reads live in `lib/services/**` under actor RLS.
- Focused unit/component and Playwright coverage passes.
- Required lint, RLS, test, coverage, build, and UI validation is green.
- Tracking docs and product version are updated.
- The branch is committed, pushed, and opened as a ready-for-review PR with
  initial automated feedback handled.

## Progress

- Completed the 393 x 852 mobile audit and selected a dedicated navigation
  destination over a floating action button.
- Reconciled the branch with `origin/main` at `f220331` and preserved the
  merged TASK-329, TASK-333, TASK-334, and TASK-336 behavior.
- Traced the stale preview error to code/schema skew: the successful TASK-329
  migration removed the legacy meeting-note participant column while the old
  TASK-332 preview bundle still queried it. Updated the Playwright fixture to
  exercise structured participant rows and prepared a fresh preview deployment.
- Reframed Todos as a protected project destination at
  `/projects/[projectId]/todos`; removed the workspace aggregate route, badge
  query, cross-project filter, and cross-project service.
- Added distinct Workspace and Project groups to the desktop sidebar and a
  contained horizontal mobile dock while retaining the project quick panel
  only at the desktop breakpoint.
- Preserved URL-backed Open/Completed views, browser history, source-meeting
  deep links, authorized completion/reopening, and viewer treatment.
- Visually reviewed the project Todos workflow at the iPhone 14 Pro
  393 x 852 viewport in light and dark themes, plus 375 px containment and
  1280 px desktop behavior.
- Passed the complete local gate: all 48 migrations, RLS inventory and tenant
  isolation, lint, 978 unit/API tests with 2 skipped, unchanged coverage,
  production build, and all 27 Playwright scenarios.
