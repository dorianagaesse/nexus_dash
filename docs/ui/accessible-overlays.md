# Accessible Overlay Contract

NexusDash dialogs and responsive sheets use the shared primitives in
`components/ui/dialog.tsx`. They are backed by Radix Dialog and retain the
product's existing mobile bottom-sheet and desktop centered-dialog geometry.

## Required structure

- Wrap every overlay in `Dialog` and render its surface with `DialogContent`.
- Provide exactly one `DialogTitle`; it may be visually hidden when the visible
  heading must retain separate styling.
- Use `DialogDescription` when supporting copy describes the dialog. Otherwise
  pass `aria-describedby={undefined}` to `DialogContent`.
- Give icon-only close buttons a specific accessible name.
- Set `dismissible={false}` while a destructive or critical mutation must not be
  interrupted. Disable the visible close/cancel controls for the same period.
- Use `presentation="centered"` only for previews that should remain centered
  on narrow screens. The default is a mobile sheet and desktop dialog.

## Behavior supplied by the foundation

- modal semantics and background isolation
- safe initial focus, Tab/Shift+Tab containment, and trigger focus restoration
- Escape and outside-pointer dismissal when `dismissible` is true
- body scroll locking with internal content scrolling
- nested portaled controls marked with `data-overlay-popover="true"`
- entry/exit motion with an explicit no-animation/no-transform path for
  `prefers-reduced-motion: reduce`

Creation forms should put `autoFocus` on their first meaningful field. A
destructive confirmation should explicitly focus its Cancel button.
