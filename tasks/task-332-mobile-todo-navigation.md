# TASK-332 - Mobile meeting-todo navigation

## Status

In review in [PR #390](https://github.com/dorianagaesse/nexus_dash/pull/390)
from `feature/task-332-mobile-todo-navigation`.

## Objective

Replace the obstructive mobile meeting-todo popup with a discoverable,
route-backed workspace destination that remains useful as todo ownership and
filtering capabilities expand.

## Audit Decision

The iPhone 14 Pro audit at a 393 x 852 CSS viewport found that the expanded
popup occupied 352 x 371 px, covered roughly half of the usable content height,
introduced a nested 320 px scroll region for 680 px of todo content, and used
28 x 28 px completion and collapse controls. It hid the meeting context users
needed to interpret the todos and competed with the fixed mobile navigation.

A floating action button was rejected because it conventionally communicates
creation rather than navigation, would add another floating collision near the
safe area, and would not provide enough room for future project and assignee
filters.

The selected pattern is a stable `Todos` destination in adaptive primary
navigation:

- mobile uses a third labeled bottom-navigation item between Projects and
  Inbox;
- desktop exposes the same workspace destination in the sidebar;
- `/todos` provides the full-screen list and stable deep link;
- the existing project-scoped floating panel remains available on desktop but
  is removed from the mobile layout.

## Scope

- Add a protected `/todos` workspace route for meeting todos across every
  project the signed-in user can access.
- Add Todos to adaptive primary navigation with an accessible active state and
  open-count badge.
- Present URL-backed Open/Completed views and project filtering.
- Group todos by project and retain links to their source meeting notes.
- Reuse the existing authorized completion endpoint and clearly distinguish
  view-only projects.
- Hide the floating project todo panel below the desktop breakpoint.
- Preserve bottom safe-area spacing, browser history, contextual account return
  paths, and project/meeting deep links.

## Out Of Scope

- Adding or changing todo assignee persistence.
- Creating todos outside meeting notes.
- Replacing the desktop project-scoped quick panel.
- Redesigning meeting-note creation or editing.
- Combining Kanban tasks and meeting todos into one work model.

## Runtime Assumptions

- Docker Engine, the repository environment, installed dependencies, and
  Playwright Chromium are available locally.
- The local PostgreSQL Compose service may be started for database-backed
  browser validation.
- Preview validation, if required by review, will run from
  `feature/task-332-mobile-todo-navigation` with that explicit `git_ref`.

## Acceptance Criteria

1. Mobile primary navigation consistently presents Projects, Todos, and Inbox
   in that order with labels, Lucide icons, at least 44 px targets, safe-area
   clearance, and a semantically announced active state.
2. `/todos` is protected, refreshable, deep-linkable, and lists meeting todos
   from every project the signed-in user can access without exposing other
   projects.
3. Open and Completed views plus project filtering are reflected in the URL
   and work with browser Back/Forward.
4. Open todos prioritize overdue work, completed todos prioritize recent
   completion, and both retain project and source-meeting context.
5. Editors and owners can complete or reopen todos with pending, success, and
   recoverable error feedback; viewers receive a clear read-only treatment.
6. The project meeting-todo floating panel is absent from mobile layout and
   accessibility navigation while remaining available on desktop.
7. Todo rows and completion controls remain usable at 375 px, in light and dark
   themes, without horizontal overflow or content hidden behind fixed
   navigation.
8. Existing project meeting-note deep links, completion behavior, notification
   return paths, and desktop panel behavior remain intact.

## Definition Of Done

- Workspace todo reads live in `lib/services/**`, execute under actor RLS
  context, and derive access from existing owner/membership rules.
- Reusable route and list components use established semantic tokens and
  Lucide icons.
- Focused unit/component tests cover access-safe aggregation, sorting, shell
  navigation, URL state, read-only behavior, and completion feedback.
- Playwright covers mobile navigation, direct `/todos` entry, filters,
  Back/Forward, completion/reopening, meeting deep links, and mobile popup
  removal while retaining desktop behavior.
- Light/dark walkthroughs at 375 and 393 px plus a desktop check pass, with
  screenshots stored under `.tmp/`.
- Required repository validation is green, tracking documentation and product
  version are updated, and the branch ships through a ready-for-review PR with
  initial automated feedback handled.

## Outcome

- Added the protected `/todos` route and actor-RLS-scoped workspace service.
- Added Projects, Todos, and Inbox to adaptive primary navigation with open and
  overdue badge context.
- Added route-backed Open/Completed views, project filtering, project grouping,
  viewer treatment, authorized completion/reopening, and deep links that open
  and highlight the source meeting todo.
- Removed the project floating panel from mobile layout and accessibility
  navigation while retaining it at the desktop breakpoint.
- Updated the product release to `v0.28.0`.

## Validation

- `npm run validate:local`
  - RLS inventory and PostgreSQL tenant-isolation matrix passed.
  - 134 Vitest files passed, 2 skipped; 956 tests passed, 2 skipped.
  - Coverage: 91.37% statements, 81.33% branches, 92.2% functions, 91.88%
    lines.
  - Production build passed and generated `/todos`.
  - All 24 Playwright scenarios passed.
- TASK-332 browser checks passed at 393 x 852 light, 375 x 812 dark, and
  1280 x 900 desktop. Screenshots are stored under `.tmp/` as
  `task332-iphone-14-pro-light.png`, `task332-375-dark.png`, and
  `task332-desktop-panel.png`.
- `git diff --check` passed.
