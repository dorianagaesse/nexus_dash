# Current Task

## Task

- ID: TASK-324
- Title: Unified user hub and avatar-menu navigation rework
- Status: Complete (2026-07-23)
- Branch: `feature/task-324-unified-user-hub-navigation`
- Pull request: [#380](https://github.com/dorianagaesse/nexus_dash/pull/380)
- Brief: [`task-324-unified-user-hub-navigation.md`](./task-324-unified-user-hub-navigation.md)

## Objective

Turn the current collection of account destinations into one coherent user
space, while simplifying the retained avatar menu into a concise launcher
rather than a second navigation system.

## Scope

- Build one responsive user-hub header and route-backed navigation treatment
  across Account, Settings, and Notifications.
- Preserve the existing account URLs, deep links, browser history, unread
  state, safe contextual `returnTo` values, and authenticated shell.
- Keep the avatar menu aligned to its desktop identity trigger with explicit
  Account, Settings, and Notifications destinations plus a spatially separated
  logout action.
- Keep appearance as a one-click shell control and place app version/repository
  metadata in Settings rather than inside the avatar menu.
- Cover active state, accessible naming, keyboard and focus behavior, light and
  dark themes, loading/empty/error states, and 375 px containment.
- Add focused component and Playwright coverage for hub and menu behavior.

## Runtime Assumptions

- Docker Engine, the repository `.env`, installed dependencies, and Playwright
  Chromium are available locally.
- The repository PostgreSQL Compose service may be started when database-backed
  rendering or browser validation requires it.
- Preview validation, if required by acceptance or review, will run the deploy
  workflow from `feature/task-324-unified-user-hub-navigation` with
  `git_ref=feature/task-324-unified-user-hub-navigation`; workflow logs will be
  checked for the requested checkout ref.

## Acceptance Criteria

1. Account, Settings, and Notifications are visibly available from one shared
   user-hub navigation surface on desktop and mobile.
2. Each hub view has a stable internal URL and supports refresh, deep linking,
   browser Back/Forward, and contextual `returnTo` behavior.
3. The active hub view is visually distinct and announced semantically without
   relying on color alone.
4. The avatar menu retains the user identity and provides explicit Account,
   Settings, and Notifications destinations for casual-user discoverability.
5. The desktop menu matches and aligns with its identity trigger; appearance
   remains a one-click shell control, version/repository metadata is available
   from Settings, and logout is separated from navigation.
6. Notification unread state remains discoverable from the avatar entry point
   and the Notifications tab without creating competing primary actions.
7. All interactive targets are at least 44 px, keyboard reachable, visibly
   focused, and usable at 375 px without clipping or horizontal page overflow.
8. Account routes retain the responsive authenticated shell and do not obscure
   page content, feedback, dialogs, or fixed navigation.

## Definition Of Done

- The shared user hub and simplified avatar menu use reusable components and
  established semantic design tokens.
- Focused component tests cover tab semantics, active state, unread state, menu
  composition, and safe contextual URLs.
- Playwright covers desktop/mobile hub switching, direct entry, browser
  history, notification deep links, and return-to-project continuity.
- Light/dark and 375/768/1024/1440 px visual walkthroughs pass without
  overflow, collision, or ambiguous current location; screenshots are captured
  under `.tmp/`.
- `npm run lint`, `npm run rls:check`, `npm test`, `npm run test:coverage`,
  `npm run build`, and relevant Playwright checks pass.
- Tracking documentation and product version are updated, the branch is
  committed and pushed, and a ready-for-review PR is open with initial Copilot
  review/check feedback handled before handoff.

## Outcome

- Introduced one shared responsive user hub for Account, Settings, and
  Notifications while retaining each stable route and the authenticated shell.
- Preserved safe project/task return context, notification deep links, browser
  history, live unread state, and nested Settings routes.
- Matched the desktop avatar menu to the full identity trigger and restored
  explicit Account, Settings, and Notifications actions with
  Arrow/Home/End/Escape keyboard behavior and separated logout.
- Restored one-click theme controls to the desktop sidebar and mobile header,
  and moved version plus the GitHub repository link into Settings.
- Added account-route loading/error recovery, 44 px controls on touched
  surfaces, and reusable component/Playwright coverage.
- Prepared product release `v0.27.0` with matching package and changelog data.

## Validation

- `npm run lint` passed.
- `npm run rls:check` passed.
- Release policy and `git diff --check` passed.
- `npm test`: 948 passed, 2 skipped.
- `npm run test:coverage`: 91.37% statements, 81.33% branches, 92.2%
  functions, 91.88% lines.
- `npm run test:e2e`: production build and all 23 Playwright tests passed.
- Light/dark Playwright walkthroughs at 375, 768, 1024, and 1440 px passed;
  refined menu/Settings screenshots are in
  `.tmp/task324-user-hub-refinement/`.
- Playwright verified the open desktop menu matches the identity trigger's
  width and left edge within one pixel, and all 23 E2E scenarios passed.
- GitHub Quality Core, E2E Smoke, Tenant Isolation, Container Image, and branch
  checks passed. Copilot's one actionable icon-sizing comment was applied and
  resolved.
- Stabilized the notification round-trip Playwright journey by closing the
  intentionally open task dialog before using the shell return link; the
  focused test passed three consecutive runs.
