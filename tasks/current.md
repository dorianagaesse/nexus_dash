# Current Task

## Task

- ID: TASK-322
- Title: Responsive authenticated app shell and primary navigation
- Status: Complete (2026-07-16 redesign)
- Branch: `feature/322-responsive-shell-redesign-v3`
- Brief: [`task-322-responsive-authenticated-app-shell.md`](./task-322-responsive-authenticated-app-shell.md)

## Objective

Replace the floating utility-only authenticated chrome with a responsive app
shell that makes primary destinations, current location, account utilities, and
feedback consistently discoverable without covering page content.

## Scope

- Define primary authenticated navigation for Projects and Inbox with a
  visible and semantic current-location state.
- Keep Account, Settings, diagnostics, and logout in the user avatar menu so
  personal utilities do not compete with workspace destinations.
- Add an in-context mobile Kanban status switcher so narrow screens do not
  require scrolling through every board lane.
- Preserve safe internal project/task and notification-list origins across
  account, notification, settings, and notification-target detours.
- Provide coordinated desktop/mobile shell layouts, content insets, utility
  placement, and shared layer ordering.
- Move repository/version metadata to a secondary diagnostic location.
- Cover keyboard access, accessible names, focus visibility, mobile touch
  targets, responsive containment, and routing continuity with focused tests.

## Runtime Assumptions

- Local PostgreSQL and the repository's documented `.env` contract are
  available for authenticated Playwright validation.
- Preview validation, if required by the review flow, will use the active branch
  as the explicit `git_ref` per `agent.md`.
- Safe navigation state is derived only from normalized internal URLs; external
  referrers and unsafe redirect values are never trusted.

## Acceptance Criteria

1. A user can reach every primary authenticated destination without opening an
   unlabeled or account-only overflow path.
2. Current location is visible and announced semantically.
3. At 375-390 px, navigation and utilities do not overlap headings, toasts,
   dialogs, or primary actions.
4. Desktop and mobile layouts reserve the correct content inset for persistent
   shell elements.
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
- Repository validation required by `agent.md` is green and the branch is
  committed, pushed, and represented by a ready-for-review pull request.

## Outcome

- Shared authenticated navigation is active on all project and account routes
  with an adaptive desktop sidebar and mobile app bar/bottom navigation,
  Projects/Inbox current-location
  semantics, safe-area spacing, and 44 px minimum shell targets.
- Account, Settings, diagnostics, Notifications, and logout remain reachable
  from the retained user avatar menu; Account and Settings are no longer
  promoted as global bottom-nav peers.
- Mobile Kanban now shows one status lane at a time with a floating Backlog /
  Doing / Blocked / Done dock above the app bottom navigation, while desktop
  keeps the four-column board.
- Follow-up refinement makes the desktop sidebar project-aware, consolidates
  Projects/All projects, moves owner Project settings into a contextual sidebar
  slot, keeps an enhanced Share project action in the header, fixes sidebar
  account-menu anchoring, and reduces the mobile project header to compact
  actions plus horizontally scannable project metrics.
- Project/task origins and notification-list origins round-trip through account
  detours without trusting external redirect input.
- Repository/version diagnostics moved into the account utility and shared
  fixed-layer tokens now coordinate shell, feedback, dialogs, and popovers.
- Rework validation passed: focused shell/navigation unit tests and the
  authenticated shell Playwright spec against the branch preview, including
  contextual returns and the mobile Kanban status-dock flow. Desktop, mobile,
  and retained account-menu screenshots were captured under
  `.tmp/task322-final-screenshots/`.
