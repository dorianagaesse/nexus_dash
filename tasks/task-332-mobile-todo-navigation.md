# TASK-332 - Mobile meeting-todo navigation

## Status

In review in [PR #394](https://github.com/dorianagaesse/nexus_dash/pull/394)
from `feature/task-332-mobile-todo-navigation-rebased`.

## Objective

Replace the obstructive mobile meeting-todo popup with a discoverable,
route-backed project destination that remains useful as todo ownership and
project navigation capabilities expand.

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

The selected pattern was revised after product review. `Todos` remains a
stable, full-page destination, but it belongs to the current project rather
than the workspace:

- mobile uses a contained horizontal navigation dock with visibly and
  semantically separate Workspace and Project groups;
- Workspace keeps Projects and Inbox while Project contains Overview and
  Todos, leaving room for future project destinations;
- desktop exposes Overview and Todos together in the Current project sidebar
  group;
- `/projects/[projectId]/todos` provides the full-screen list and stable deep
  link without aggregating other projects;
- the existing project-scoped floating panel remains available on desktop but
  is removed from the mobile layout.

## Scope

- Add a protected `/projects/[projectId]/todos` route limited to the authorized
  current project.
- Add Todos to the current-project navigation group with an accessible active
  state.
- Present URL-backed Open/Completed views without cross-project filtering.
- Retain links to source meeting notes inside the current project.
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
  `feature/task-332-mobile-todo-navigation-rebased` with that explicit
  `git_ref`.

## Acceptance Criteria

1. Mobile navigation presents separate Workspace and Project groups inside a
   contained horizontal rail, with labeled Lucide-icon links, at least 44 px
   targets, safe-area clearance, keyboard reachability, and a semantically
   announced active state.
2. `/projects/[projectId]/todos` is protected, refreshable, deep-linkable, and
   lists only meeting todos from the authorized current project.
3. Open and Completed views are reflected in the URL and work with browser
   Back/Forward.
4. Open todos prioritize overdue work, completed todos prioritize recent
   completion, and both retain source-meeting context.
5. Editors and owners can complete or reopen todos with pending, success, and
   recoverable error feedback; viewers receive a clear read-only treatment.
6. The project meeting-todo floating panel is absent from mobile layout and
   accessibility navigation while remaining available on desktop.
7. Todo rows and completion controls remain usable at 375 px, in light and dark
   themes, without horizontal overflow or content hidden behind fixed
   navigation.
8. Existing project meeting-note deep links, completion behavior, notification
   return paths, desktop panel behavior, and workspace navigation remain
   intact.

## Definition Of Done

- Project todo reads live in `lib/services/**`, execute under actor RLS
  context, and derive access from existing owner/membership rules.
- Reusable route and list components use established semantic tokens and
  Lucide icons.
- Focused unit/component tests cover access-safe project isolation, sorting,
  grouped shell navigation, URL state, read-only behavior, and completion
  feedback.
- Playwright covers mobile grouped navigation, direct project-Todos entry,
  Back/Forward, completion/reopening, meeting deep links, and mobile popup
  removal while retaining desktop behavior.
- Light/dark walkthroughs at 375 and 393 px plus a desktop check pass, with
  screenshots stored under `.tmp/`.
- Required repository validation is green, tracking documentation and product
  version are updated, and the branch ships through a ready-for-review PR with
  initial automated feedback handled.

## Outcome

- Replaced the workspace-wide `/todos` destination with protected
  `/projects/[projectId]/todos` pages backed by an actor-RLS-scoped,
  single-project service.
- Split adaptive primary navigation into Workspace (Projects, Inbox) and
  current Project (Overview, Todos) groups. Mobile contains both groups in a
  horizontally scrollable safe-area dock; desktop places the project group in
  the existing sidebar.
- Added route-backed Open/Completed views, viewer treatment, authorized
  completion/reopening, and deep links that open and highlight the source
  meeting todo without exposing work from another accessible project.
- Removed the project floating panel from mobile layout and accessibility
  navigation while retaining it at the desktop breakpoint.
- Reconciled `origin/main` at `f220331` while preserving the shipped
  participant-identity, feedback, alpha-state, and collaboration-audit work.

## Validation

- Applied all 48 migrations to the isolated local PostgreSQL service; no
  migrations were pending.
- `npm run validate:local` passed:
  - RLS inventory and PostgreSQL tenant-isolation matrix;
  - lint;
  - 139 Vitest files passed and 2 skipped; 978 tests passed and 2 skipped;
  - coverage at 91.37% statements, 81.33% branches, 92.2% functions, and
    91.88% lines;
  - production build generated `/projects/[projectId]/todos`;
  - all 27 Playwright scenarios passed.
- The focused TASK-332 browser flow passed at 393 x 852 in light and dark
  themes, at 375 x 812 for containment, and at 1280 x 900 for the retained
  desktop quick panel. It verifies separate navigation groups, four 44 px
  targets, project isolation, viewer access, URL history, completion, deep
  links, and no page-level horizontal overflow.
- `git diff --check` passed.
- Diagnosed the stale preview against the configured preview database: health
  and readiness endpoints passed, the migration job reported no pending
  migrations, and the TASK-332 workspace badge query returned the expected
  counts. A signed-in project render reproduced server-error digest
  `4087704851` because the pre-rebase preview bundle still selected the legacy
  participant column after TASK-329 had migrated and removed it. All temporary
  diagnostic users and projects were deleted after verification. The updated
  branch no longer reads the removed scalar column.
