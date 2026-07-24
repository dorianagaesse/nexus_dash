# TASK-324 - Unified user hub and avatar-menu navigation rework

## Status

Done (2026-07-23) - implemented on
`feature/task-324-unified-user-hub-navigation` in PR #380.

## Objective

Turn the current collection of account destinations into one coherent user
space, while simplifying the retained avatar menu into a concise launcher
rather than a second navigation system.

## Product Direction

- Keep the user avatar as the persistent personal entry point.
- Make `/account` the shared user hub with one stable header and three visible
  destinations: Account, Settings, and Notifications.
- Present those destinations as semantic, route-backed tabs or segmented
  navigation. They should feel like views of one page while retaining distinct
  URLs, deep links, browser history, unread state, and safe `returnTo` context.
- Keep explicit Account, Settings, and Notifications rows in the avatar menu
  so casual users can recognize each destination without first understanding
  the shared hub model.
- Match and align the desktop menu with the full user identity trigger.
- Keep appearance as a one-click control in persistent shell chrome, move
  repository/version metadata to Settings, and separate logout visually and
  semantically from ordinary navigation.
- Reuse the authenticated shell and established NexusDash visual language
  rather than introducing another competing navigation layer.

## Scope

- Audit the current avatar menu and `/account/**` information architecture.
- Build a shared responsive user-hub header/navigation treatment across
  Account, Settings, and Notifications.
- Preserve the existing route contract or provide safe redirects if route
  normalization is required.
- Preserve notification unread indicators and contextual return paths from
  projects, tasks, and notification targets.
- Define desktop and mobile behavior, including narrow-screen tab labels,
  focus order, content insets, and 44 px minimum targets.
- Cover active state, keyboard operation, accessible naming, focus visibility,
  light/dark themes, and loading/empty/error states.
- Update the avatar menu so personal identity and all three personal
  destinations are clear without reintroducing appearance or diagnostics.

## Out Of Scope

- Redesigning the underlying account forms or changing account data behavior.
- Changing notification delivery, read/resolved semantics, or email dispatch.
- Replacing the global Projects/Inbox navigation established by TASK-322.
- Adding new profile, preference, or notification-setting capabilities.

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

- The shared user hub and simplified avatar menu are implemented using reusable
  components and established semantic design tokens.
- Focused component tests cover tab semantics, active state, unread state, menu
  composition, and safe contextual URLs.
- Playwright covers desktop/mobile hub switching, direct entry, browser history,
  notification deep links, and return-to-project continuity.
- Light/dark and 375/768/1024/1440 px visual walkthroughs pass without overflow,
  collision, or ambiguous current location.
- Required repository validation is green, tracking documentation is updated,
  and the task ships through its dedicated feature branch and pull request.

## Outcome

- Added a shared account-layout user hub with one identity header and three
  route-backed Account, Settings, and Notifications destinations across desktop
  and mobile.
- Preserved existing URLs, deep links, browser history, notification targets,
  live unread badges, and normalized project/task `returnTo` context.
- Matched the desktop avatar menu to its full identity trigger and retained
  explicit Account, Settings, and Notifications actions for casual-user
  discoverability, with separated destructive logout styling.
- Restored one-click theme controls to persistent desktop/mobile shell chrome
  and moved app version plus the GitHub repository link into Settings.
- Added keyboard traversal and focus restoration to the avatar menu, 44 px
  controls across touched account views, and shared loading/error recovery
  states without changing account or notification data behavior.
- Added focused component and Playwright coverage for active state, nested
  settings routes, unread state, safe URLs, menu composition, keyboard route
  switching, Back/Forward, notification deep links, and project continuity.

## Validation

- `npm run lint`
- `npm run rls:check`
- `npm run release:check -- --base origin/main --branch feature/task-324-unified-user-hub-navigation`
- `npm test` - 948 passed, 2 skipped
- `npm run test:coverage` - 91.37% statements, 81.33% branches, 92.2%
  functions, 91.88% lines
- `npm run test:e2e` - production build and all 23 Playwright tests passed
- Playwright visual walkthroughs passed at 375, 768, 1024, and 1440 px in
  light/dark themes; refined menu/Settings screenshots are stored under
  `.tmp/task324-user-hub-refinement/`.
- The desktop open-menu geometry matches its identity trigger's width and left
  edge within one pixel; all 23 E2E scenarios passed.
- GitHub Quality Core, E2E Smoke, Tenant Isolation, Container Image, and branch
  checks passed; the initial Copilot review's single icon-size comment was
  applied and resolved.
