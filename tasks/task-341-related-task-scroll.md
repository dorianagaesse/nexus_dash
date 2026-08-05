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
- Bound the candidate list inside an `overflow-hidden` popover with a matching
  `maxHeight` so the list is the only scrollable surface. The list keeps its
  `overflow-y-auto`, `overscroll-contain`, and thin scrollbar styling.
- Keep the existing TASK-352 keyboard navigation unchanged.
- Add focused component tests that verify the new popover bounds, that the
  scroll guard still suppresses re-positioning for internal list scrolls, and
  that wheel events dispatched on a candidate bubble up to the listbox.

## Scope

- `components/kanban/related-task-field.tsx` (scroll listener guard + popover
  bounds)
- `tests/components/related-task-field.test.tsx` (scroll guard + popover
  bounds assertions)
- Both create-task and task-detail/edit popovers share the same component, so
  no per-call-site change is needed.

## Validation

- `npm run lint`
- `npm test` (focused related-task-field coverage)
- `npm run test:coverage`
- `npm run build`
