# TASK-322 Responsive Authenticated App Shell and Primary Navigation

## Task ID
TASK-322

## Status
Pending — focused product-navigation follow-up from TASK-270

## Objective
Replace the floating utility-only authenticated chrome with a responsive app
shell that makes primary destinations, current location, account utilities, and
feedback consistently discoverable without covering page content.

## Scope
- Define primary authenticated navigation for Projects, Notifications, Account,
  and Settings with a visible current-location state.
- Preserve the originating project route when account, notification, or settings
  surfaces are opened as a detour, including meaningful query/hash state such
  as an open `taskId`.
- Reuse the existing safe internal `returnTo` normalization pattern for account
  menu links, notification-awareness links, and notification target round trips;
  define a stable direct-entry fallback and never trust an external referrer.
- Distinguish hierarchical navigation from history/context return. Do not label
  a fixed jump to Account or Projects as “Back” when it cannot restore the
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
3. At 375–390 px, navigation and utilities do not overlap headings, toasts,
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
