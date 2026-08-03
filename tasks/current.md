# Current Task

## Task

- ID: TASK-354
- Title: Sidebar todo count
- Status: In review (2026-08-05, rebased onto main; PR #410)
- Branch: `feature/task-354-sidebar-todo-count`
- Pull request: Pending
- Brief: [`task-354-sidebar-todo-count.md`](./task-354-sidebar-todo-count.md)

## Objective

Make outstanding meeting follow-ups visible from project navigation by adding
the active todo count to the `Todos` item and emphasizing overdue work.

## Scope

- Load an authorization-safe summary for the current project's meeting todos.
- Show the number of active, incomplete todos in a compact top-right badge on
  the project-scoped `Todos` navigation item.
- Use the established neutral navigation treatment when no active todo is
  overdue and an accessible orange warning treatment when at least one is
  overdue.
- Include count and overdue meaning in the navigation item's accessible name
  so status does not depend on color alone.
- Keep the badge current after project navigation, todo mutations, and remote
  project activity without forcing a full page reload.
- Preserve existing desktop sidebar, mobile project navigation, notification
  badges, active-route styling, and project authorization behavior.

## Runtime Assumptions

- Active todos are meeting-note actions whose `completedAt` value is null.
- Existing meeting-todo overdue rules remain authoritative, including the
  one-day grace period and archived-meeting exclusion.
- Existing local PostgreSQL and `.env` prerequisites are unchanged.
- Browser validation uses the existing project meeting-todo fixture.
- If preview validation is required during review, it must pass
  `git_ref=feature/task-354-sidebar-todo-count` explicitly.

## Acceptance Criteria

1. The project-scoped `Todos` navigation item shows the exact number of active
   todos when that number is greater than zero.
2. The badge is absent when there are no active todos and handles large counts
   without breaking the navigation layout.
3. The badge uses a neutral semantic theme treatment when no active todo is
   overdue and an orange warning treatment when one or more active todos are
   overdue, in light and dark themes.
4. The link's accessible name announces the active count and overdue state;
   orange is not the only way overdue meaning is conveyed.
5. The summary is limited to the authorized current project and does not expose
   todo content or another project's counts.
6. The count refreshes after completing or reopening a todo, after relevant
   remote project activity, and when navigating between projects.
7. Existing Inbox badge behavior, active-route indication, keyboard focus,
   44 px navigation targets, mobile containment, and todo navigation remain
   intact.
8. Focused service, route, component, and Playwright coverage verifies zero,
   active, overdue, mutation-refresh, authorization, and responsive states.
9. Release metadata, task tracking, and validation evidence are updated in the
   same pull request.

## Definition Of Done

- Todo summary persistence access stays in `lib/services/**`; the API route is
  a thin authenticated transport adapter.
- The badge follows the UI/UX Pro Max accessibility, semantic-color,
  navigation-badge, theme, and responsive guidance.
- `npm run lint`, `npm run rls:check`, `npm test`, `npm run test:coverage`,
  `npm run build`, release validation, and relevant Playwright coverage pass.
- The feature release advances from `v0.35.2` to `v0.36.0` with matching
  changelog and lockfile metadata.
- The branch is committed and pushed, a ready-for-review PR is open, and the
  initial Copilot review/check outcome is handled without merging the PR.

## Progress

- Created TASK-354 in the backlog and its dedicated worktree from current
  `origin/main`.
- Completed the UI/UX Pro Max design-system, accessibility, navigation-badge,
  semantic-color, responsive, dark-theme, and Next.js guidance review.
- Confirmed the existing meeting-todo service is the source of truth for active
  and overdue semantics and the authenticated shell owns both desktop and
  mobile project navigation.
- Added a minimal actor-RLS-scoped summary query and authenticated no-store API
  endpoint that expose only the active count and overdue boolean.
- Added one shell-level summary hook that loads on project navigation and
  refreshes after local mutations or remote meeting activity without
  duplicating requests for the desktop and mobile navigation renders.
- Added exact neutral and orange warning badges with controlled accessible
  names, tabular figures, theme compatibility, and the existing 44 px
  navigation targets intact.
- Routed Todos-page completion through the shared project-activity mutation
  helper so the navigation count updates immediately after complete/reopen.
- Added focused service, route, hook, shell, and Playwright coverage and
  prepared feature release `v0.36.0`.

## Outcome

- The current project's desktop and mobile `Todos` navigation now exposes its
  exact active count without loading todo content into the shell.
- Active work uses a compact neutral badge; any overdue active work promotes
  the badge to orange and adds explicit overdue wording to the link's
  accessible name.
- Counts stay project-isolated and update after local todo changes, relevant
  live project events, and project navigation while preserving the Inbox badge
  and route state.

## Validation

- `npm run lint`, `npm run rls:check`, `git diff --check`, and
  `npm run release:check -- --base origin/main --branch feature/task-354-sidebar-todo-count`
  passed.
- `npm test`: 1006 passed, 2 skipped.
- `npm run test:coverage`: 91.37% statements, 81.33% branches, 92.2%
  functions, 91.88% lines.
- `npm run build` passed with the local-validation runbook's non-secret runtime
  placeholders.
- The focused project meeting-todo browser flow passed at 393 px and 375 px in
  light/dark themes and at 1280 px for the desktop sidebar; screenshots under
  `.tmp/task354/` were visually reviewed.
- The complete 31-scenario Chromium suite passed with outbound email delivery
  disabled locally. The preceding run's sole password-recovery failure was
  traced to the placeholder Resend key being treated as live and cleared under
  the documented disabled delivery mode.
