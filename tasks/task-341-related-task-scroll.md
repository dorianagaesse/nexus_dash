# TASK-341: Related-task picker scroll does not work

## Problem

GitHub issue #401 reports that the related-task candidate list shows a
vertical scrollbar once enough candidates are available, but the list does not
respond to wheel, trackpad, touch, or keyboard input. The user cannot reach
candidates below the visible fold.

The list element (`[data-related-task-listbox="true"]`) already has
`overflow-y-auto` and a visible scrollbar. The actual wheel/touch failure came
from rendering the popover in `document.body`, outside the Radix Dialog content
shard allowed by its `react-remove-scroll` integration. The modal scroll lock
therefore canceled wheel and touch defaults on the popover, while dragging the
scrollbar thumb still changed `scrollTop` directly.

Separately, every candidate used `onMouseMove` to set the keyboard-active
index. The active-option effect then called `scrollIntoView`, which made the
pointer scroll the list slightly near its top and bottom edges.

## Fix

- Render the popover inside the nearest `[data-overlay-content="true"]` when
  used in a dialog, using dialog-relative absolute coordinates. Non-modal
  usage keeps the fixed `document.body` fallback.
- Keep the bounded inner `overflow-y-auto` list and the defensive
  capture-phase scroll-listener guard. Scroll events are observed in capture;
  they do not bubble.
- Remove pointer-driven active-index updates. CSS hover remains, while
  `scrollIntoView` is reserved for keyboard navigation.
- Add focused component and Playwright regression coverage for dialog
  containment, passive pointer movement, real wheel scrolling to the final
  candidate, and containment of the surrounding modal in both task flows.

## Scope

- `components/kanban/related-task-field.tsx` (dialog-contained portal,
  positioning, and pointer/keyboard state separation)
- `tests/components/related-task-field.test.tsx` (portal boundary, pointer,
  scroll guard, and popover bounds assertions)
- `tests/e2e/task-350-related-task-picker.spec.ts` (real wheel and containment
  assertions in create and edit flows)
- Both create-task and task-detail/edit popovers share the same component, so
  no per-call-site change is needed.

## Validation

- `npm run lint`
- `npm test` (focused related-task-field coverage)
- `npm run test:coverage`
- `npm run build`
