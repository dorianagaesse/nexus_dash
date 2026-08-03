# TASK-353 Movable Meeting-Todos Modal

## Status

In progress on `feature/task-353-movable-meeting-todos-modal`.

## Source

- Backlog request: replace the current meeting-todo popup with a compact
  bottom-right `Todos` entry and a movable, accessible modal.
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
the existing aggregate inside the shared modal foundation and let users move
it within the visible project content using either pointer dragging or the
keyboard.

## Design And Interaction Decision

- Keep the trigger at the bottom-right of the visible desktop project area,
  with a Lucide `ListTodo` icon, visible `Todos` label, and count context in its
  accessible name.
- Use the shared Radix dialog primitives for modal semantics, focus trapping,
  Escape/outside dismissal, and trigger focus restoration.
- Make only the labeled header handle draggable so todo rows and completion
  controls keep normal click, touch, and text behavior.
- Support arrow-key movement from the drag handle, with a larger Shift+Arrow
  step, so movement never requires a fine pointer gesture.
- Clamp the transformed dialog to the visible intersection of the project-page
  container and viewport. Re-clamp on resize and reset position on each open.
- Keep movement subtle and transform-only; disable transition animation for
  reduced-motion preferences and while actively dragging.
- Close the Todos modal before selecting a source meeting so two focus traps
  never overlap.
- Preserve TASK-332's mobile route and hide this quick surface below `lg`.

## Acceptance Criteria

1. A compact bottom-right desktop `Todos` button replaces the expanded/collapse
   popup and exposes open/overdue counts accessibly.
2. The shared accessible dialog foundation presents the existing aggregate,
   permissions, mutations, status treatments, and source links.
3. Focus is contained while open and restored to the trigger on close.
4. A visible handle supports bounded pointer dragging and equivalent keyboard
   arrow movement.
5. The dialog remains fully reachable within project content after movement,
   resize, and orientation changes.
6. Opening a source meeting closes the Todos modal before opening the meeting
   dialog.
7. The quick entry remains absent on mobile, where the project Todos route is
   still the primary surface.
8. Focused component and browser coverage proves accessibility, containment,
   actions, responsive behavior, and light/dark compatibility.

## Definition Of Done

- UI/UX Pro Max guidance is applied to hierarchy, theme tokens, visible focus,
  44 px targets, gesture alternatives, reduced motion, and containment.
- The change stays inside the UI layer and reuses existing service/API
  behavior.
- Required local validation, release policy checks, and relevant Playwright
  scenarios pass.
- Tracking docs and release metadata are current.
- A ready-for-review PR is open and its initial automated review outcome is
  handled.
