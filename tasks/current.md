# Current Task

## Task

- ID: TASK-332
- Title: Mobile meeting-todo navigation
- Status: In review
- Branch: `feature/task-332-mobile-todo-navigation`
- Pull request: [#390](https://github.com/dorianagaesse/nexus_dash/pull/390)
- Brief: [`task-332-mobile-todo-navigation.md`](./task-332-mobile-todo-navigation.md)

## Objective

Replace the obstructive mobile meeting-todo popup with a stable, route-backed
Todos destination that can grow into project and assignee filtering.

## Scope

- Add protected workspace-level meeting todos at `/todos`.
- Add Todos to adaptive primary navigation with an open-count badge.
- Provide URL-backed status and project filtering, project grouping, source
  meeting links, and completion/reopening.
- Hide the project-scoped floating todo panel on mobile while retaining it on
  desktop.
- Cover authorization, read-only behavior, accessibility, safe areas, light
  and dark themes, and 375 px containment.

## Runtime Assumptions

- Docker Engine, the repository environment, installed dependencies, and
  Playwright Chromium are available locally.
- The local PostgreSQL Compose service may be started for browser validation.
- Preview validation, if required, will use
  `git_ref=feature/task-332-mobile-todo-navigation`.

## Acceptance Criteria

1. Mobile primary navigation consistently presents Projects, Todos, and Inbox
   with labels, icons, 44 px targets, safe-area clearance, and active state.
2. `/todos` is protected, refreshable, deep-linkable, and access-safe across
   the signed-in user's projects.
3. Open/Completed and project filters are URL-backed and work with browser
   Back/Forward.
4. Todos retain project and source-meeting context and sort overdue/recent work
   predictably.
5. Owners/editors can complete or reopen todos with clear feedback while
   viewers receive a read-only treatment.
6. The floating panel is absent on mobile and remains available on desktop.
7. The touched UI passes 375 px, light/dark, keyboard, focus, and 44 px target
   checks without overflow or fixed-navigation collisions.
8. Existing meeting-note, notification-return, and desktop behavior remains
   intact.

## Definition Of Done

- Access-safe workspace reads live in `lib/services/**` under actor RLS.
- Focused unit/component and Playwright coverage passes.
- Required lint, RLS, test, coverage, build, and UI validation is green.
- Tracking docs and product version are updated.
- The branch is committed, pushed, and opened as a ready-for-review PR with
  initial automated feedback handled.

## Progress

- Completed the 393 x 852 mobile audit and selected a dedicated navigation
  destination over a floating action button.
- Created the dedicated task branch/worktree and implementation brief.
- Implemented the protected workspace service/route, adaptive navigation,
  URL-backed views and filters, source-meeting deep links, and access-aware
  completion behavior.
- Removed the floating panel from mobile layout while preserving its desktop
  project workflow.
- Passed the complete local validation baseline, including RLS isolation,
  956 unit/API tests, coverage, production build, and all 24 Playwright flows.
- Rebased onto `c1ebb17` and resolved the TASK-329 participant-model,
  TASK-333 feedback, and TASK-334 alpha-state overlaps without dropping any
  shipped behavior.
- Traced the stale preview error to code/schema skew: the successful TASK-329
  migration removed the legacy meeting-note participant column while the old
  TASK-332 preview bundle still queried it. Updated the Playwright fixture to
  exercise structured participant rows and prepared a fresh preview deployment.
- Passed the complete post-rebase local gate: 48 migrations, RLS isolation,
  lint, 977 unit/API tests, coverage, production build, and all 27 Playwright
  scenarios.
