# TASK-321 Accessible Modal and Sheet Foundation

## Task ID
TASK-321

## Status
Pending — high-priority accessibility defect from TASK-270

## Objective
Create and adopt a shared accessible overlay foundation so dialogs, sheets, and
confirmation flows have consistent semantics, keyboard behavior, focus
lifecycle, background isolation, and responsive presentation.

## Scope
- Provide shared dialog/sheet primitives with:
  - `role="dialog"` or `role="alertdialog"`, `aria-modal`, and an accessible name
  - safe initial focus, Tab/Shift+Tab containment, Escape handling, and trigger
    focus restoration
  - background scroll/input isolation and stable nested popover behavior
  - named close controls and reduced-motion support
- Migrate create task, task detail/edit, project settings, confirmation, context
  preview/edit/create, and attachment preview overlays.
- Reconcile existing meeting and roadmap dialog behavior with the same contract.
- Add focused keyboard and accessibility regression coverage at desktop and
  mobile widths.

## Out Of Scope
- Visual redesign of overlay content.
- Task-specific information architecture owned by TASK-133.
- Whole-app typography or color changes owned by TASK-108.

## Acceptance Criteria
1. Every migrated overlay has an accessible name, correct modal semantics, and
   a named close/cancel path.
2. Keyboard focus cannot move into obscured page content while an overlay is
   open and returns to the trigger after close.
3. Escape closes non-destructive overlays and does not interrupt an in-flight
   destructive action.
4. Background scrolling is prevented without breaking internal sheet scrolling
   at 390 px.
5. Overlay motion respects `prefers-reduced-motion`.
6. Automated coverage verifies semantics, focus containment/restoration,
   Escape, and representative nested controls.

## Definition Of Done
- Shared overlay primitives are implemented and documented.
- In-scope overlays are migrated without behavior regressions.
- Desktop/mobile keyboard checks and the required repository validation pass.
- TASK-270 and TASK-321 tracking docs are updated.

## Dependencies
- TASK-270
