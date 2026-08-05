# TASK-353 Movable Meeting-Todos Panel

## Status

In review after product-feedback refinement in
[PR #411](https://github.com/dorianagaesse/nexus_dash/pull/411)
from `feature/task-353-movable-meeting-todos-modal`.

## Source

- Backlog request: replace the current meeting-todo popup with a compact
  bottom-right `Todos` entry and a movable, accessible panel.
- TASK-316 introduced the desktop floating project-wide todo table.
- TASK-332 removed that popup from mobile in favor of a project-scoped,
  route-backed Todos destination.

## Problem

The desktop quick panel stays expanded over project content until manually
collapsed, and its collapsed/expanded card treatment still reserves a large
floating surface. Users need meeting todos close at hand without covering the
context, Kanban, roadmap, or calendar work they are reviewing. Repositioning
must not trade that obstruction for an inaccessible, off-screen, or
pointer-only dialog.

## Goal

Expose meeting todos through a small, predictable desktop entry point. Open
the existing aggregate as a modeless panel and let users move it within the
visible project content using either pointer dragging or the keyboard while
the underlying app remains fully usable.

## Design And Interaction Decision

- Keep the trigger at the bottom-right of the visible desktop project area,
  with a Lucide `ListTodo` icon, visible `Todos` label, and count context in its
  accessible name.
- Use Radix's modeless dialog mode for accessible naming, Escape dismissal, and
  trigger focus restoration without a focus trap, inert page, or overlay.
- Keep outside pointer and focus interactions available without dismissing the
  panel, so project text fields and controls can be used alongside the todos.
- Make the entire panel draggable with a small movement threshold, so a grab
  can start over any surface while ordinary todo clicks remain intact.
- Avoid a dedicated pointer drag strip. Keep a compact header control for
  arrow-key movement, with a larger Shift+Arrow step, so movement never
  requires a fine pointer gesture.
- Clamp the transformed dialog to the visible intersection of the project-page
  container and viewport. Re-clamp on resize and retain the bounded position
  across close/reopen cycles.
- Keep movement subtle and transform-only; disable transition animation for
  reduced-motion preferences and while actively dragging.
- Keep the visual header concise, direct both entrance and exit animations
  between the floating trigger and panel location, and retain the last bounded
  position across close/reopen cycles.
- Close the Todos panel before selecting a source meeting so the source modal
  opens without a competing floating surface.
- Preserve TASK-332's mobile route and hide this quick surface below `lg`.

## Acceptance Criteria

1. A compact bottom-right desktop `Todos` button replaces the expanded/collapse
   popup and exposes open/overdue counts accessibly.
2. An accessible modeless dialog presents the existing aggregate, permissions,
   mutations, status treatments, and source links.
3. No backdrop, blur, focus trap, or page-wide pointer shield is present;
   underlying project controls and text fields remain operable while the panel
   stays open, and explicit close restores focus to the trigger.
4. The whole panel supports bounded pointer dragging without a dedicated drag
   strip, and a compact header control provides equivalent keyboard movement.
5. The dialog remains fully reachable within project content after movement,
   resize, orientation changes, and reopening at its previous location.
6. Opening animates from the floating `Todos` trigger and dismissal returns
   toward it, without generic center-origin or sideways motion.
7. Opening a source meeting closes the Todos panel before opening the meeting
   dialog.
8. The quick entry remains absent on mobile, where the project Todos route is
   still the primary surface.
9. Focused component and browser coverage proves accessibility, containment,
   actions, responsive behavior, and light/dark compatibility.

## Definition Of Done

- UI/UX Pro Max guidance is applied to hierarchy, theme tokens, visible focus,
  44 px targets, gesture alternatives, reduced motion, and containment.
- The change stays inside the UI layer and reuses existing service/API
  behavior.
- Required local validation, release policy checks, and relevant Playwright
  scenarios pass.
- The feature release advances to `v0.35.0` after merged TASK-335 occupied
  `v0.34.0`.
- Tracking docs and release metadata are current.
- A ready-for-review PR is open and its initial automated review outcome is
  handled.

## Outcome

- Replaced the expanded/collapse quick panel with a compact, count-aware
  desktop `Todos` trigger.
- Added a modeless panel with click-safe drag-from-anywhere pointer capture,
  compact arrow-key movement, project/viewport clamping, resize
  re-containment, visible instructions, and focus restoration.
- Preserved existing aggregate ordering, todo mutations, overdue status,
  viewer behavior, source navigation, and the project-scoped mobile route.
- Closing the Todos panel before source navigation keeps the true source
  meeting modal singular.
- Product-feedback refinement removed the overlay, blur, focus trap, and page
  inerting; outside project fields remain usable without dismissing the panel.
- Follow-up refinement removed the visible helper paragraph, made opening and
  dismissal travel between the panel and floating trigger, and preserved the
  last bounded location when the panel is reopened.

## Validation

- Focused component suite: 5 passed.
- Full unit/API suite: 1003 passed, 2 skipped.
- Coverage: 91.37% statements, 81.33% branches, 92.2% functions, 91.88% lines.
- Lint, RLS inventory, `v0.35.0` release policy, production build, and diff
  checks passed after merging current `origin/main`.
- All 32 Playwright Chromium scenarios passed, including drag initiation over
  an interactive todo without accidental activation, keyboard movement,
  trigger-directed opening/dismissal, close/reopen position restoration,
  resize containment, focus restoration, mobile absence, themes, mutations,
  and source-meeting navigation.
- Desktop light and dark screenshots were visually inspected with an undimmed,
  unblurred project page and usable underlying search field.
- Planning commit `5829401` and implementation commit `2d61245` are pushed,
  and ready-for-review PR #411 is open.
- Both initial Copilot comments were applied and verified: containment avoids
  no-op state updates, and repeated arrow moves cause distinct live-region DOM
  mutations. Focused component tests, lint, and production build passed after
  review.
