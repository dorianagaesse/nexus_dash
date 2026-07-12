# TASK-322 Responsive Authenticated App Shell and Primary Navigation

## Task ID
TASK-322

## Status
Complete (2026-07-12 rework)

## Objective
Replace the floating utility-only authenticated chrome with a responsive app
shell that makes primary destinations, current location, account utilities, and
feedback consistently discoverable without covering page content.

## Scope
- Define primary authenticated navigation for Projects and Notifications with a
  visible current-location state.
- Keep Account, Settings, diagnostics, and logout in the existing user avatar
  menu instead of promoting personal utilities as global navigation peers.
- Provide a mobile Kanban status switcher so users can move between Backlog,
  Doing, Blocked, and Done without scrolling through every lane.
- Preserve the originating project route when account, notification, or settings
  surfaces are opened as a detour, including meaningful query/hash state such
  as an open `taskId`.
- Reuse the existing safe internal `returnTo` normalization pattern for account
  menu links, notification-awareness links, and notification target round trips;
  define a stable direct-entry fallback and never trust an external referrer.
- Distinguish hierarchical navigation from history/context return. Do not label
  a fixed jump to Account or Projects as "Back" when it cannot restore the
  user's origin.
- Create desktop and mobile shell variants with consistent content gutters and
  reserved space for fixed/sticky UI.
- Demote repository/version metadata to an appropriate diagnostic/about
  location instead of giving it primary chrome weight.
- Place account, theme, and notification utilities predictably.
- Define a shared z-index/layer map so navigation, menus, toasts, dialogs, and
  sheets do not collide.
- Ensure every shell control meets keyboard, accessible-name, and 44 px mobile
  target requirements.

## Out Of Scope
- Dashboard module personalization (TASK-110).
- Module-level visual polish (TASK-108).
- Notification content and delivery behavior.

## Acceptance Criteria
1. A user can reach every primary authenticated destination without opening an
   unlabeled or account-only overflow path.
2. Current location is visible and announced semantically.
3. At 375-390 px, navigation and utilities do not overlap headings, toasts,
   dialogs, or primary actions.
4. Desktop and mobile layouts reserve the correct content inset for any
   persistent shell element.
5. Repository/version diagnostics remain available without dominating primary
   navigation.
6. Keyboard navigation, focus visibility, touch targets, and layer ordering are
   covered by focused tests.
7. Project -> Notifications/Settings -> contextual return restores the exact
   allowed project URL, including an open task query when present.
8. Notification center -> task/project -> contextual return restores the
   notification list so users can continue triage.
9. Direct visits without an origin use predictable Account or Projects
   fallbacks and cannot be used for an external redirect.

## Definition Of Done
- The authenticated shell is adopted by projects and account routes.
- Desktop, small-phone, and dark-mode walkthroughs pass.
- Playwright covers project/account/notification round trips, browser Back,
  direct-entry fallbacks, and rejected unsafe return paths.
- No page-level horizontal overflow or fixed-layer collision remains in the
  covered routes.
- TASK-270 and TASK-322 tracking docs are updated.

## Dependencies
- TASK-270
- TASK-321

## Outcome
- Added one authenticated shell across project and account routes with a sticky
  desktop header, Projects/Notifications primary destinations, and a reserved
  mobile bottom navigation for workspace destinations.
- Added semantic active-location state, skip navigation, visible focus, 44 px
  utility targets, contextual return controls, and secondary account-menu
  placement for repository/version diagnostics.
- Retained the user avatar menu as the predictable home for Account, Settings,
  Notifications, diagnostics, and logout.
- Reworked mobile Kanban to show one lane at a time with a sticky status dock
  above the app bottom navigation; desktop keeps the four-column board.
- Added normalized project/task and notification-list round trips that preserve
  query/hash state, reject unsafe origins, and use Account or Projects for
  direct-entry fallbacks.
- Defined and adopted shared shell, menu, floating-panel, toast, dialog,
  popover, nested-overlay, and skip-link layers.
- Rework validation passed: focused shell/navigation unit tests and the
  authenticated shell Playwright spec, including account-menu utility placement
  and mobile Kanban status switching. Before/after screenshots were captured
  under `.tmp/`.
