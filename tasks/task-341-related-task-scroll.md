# TASK-341: Related-task picker scroll does not work

## Problem

GitHub issue #401 reports that the related-task candidate list shows a
vertical scrollbar once enough candidates are available, but the list does not
respond to wheel, trackpad, touch, or keyboard input. The user cannot reach
candidates below the visible fold.

The list element (`[data-related-task-listbox="true"]`) does have
`overflow-y-auto` with a thin visible scrollbar (added by TASK-352), so the
scroll container is correct, but every internal scroll bubbles to the
window-level capture-phase listener that re-positions the popover. That
listener calls `setDropdownPosition` with a new object reference, triggering
a re-render of the popover and its child list before the browser can commit
the scroll delta. The visible result is that the scrollbar appears but the
list never moves.

## Fix

- Gate the window-level scroll listener so it only re-positions the popover
  when the scroll event originates outside the popover
  (`[data-overlay-popover="true"]`).
- Keep the existing `overflow-y-auto`, `overscroll-contain`, thin-scroll
  styling, and TASK-352 keyboard navigation unchanged.
- Add a focused component test that dispatches a scroll event whose target is
  the listbox and confirms the popover's `top` does not change.

## Scope

- `components/kanban/related-task-field.tsx` (scroll listener guard)
- `tests/components/related-task-field.test.tsx` (new scroll-guard assertion)
- Both create-task and task-detail/edit popovers share the same component, so
  no per-call-site change is needed.

## Validation

- `npm run lint`
- `npm test` (focused related-task-field coverage)
- `npm run test:coverage`
- `npm run build`
