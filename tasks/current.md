# Current Task

## Task

- ID: TASK-341
- Title: Related-task picker scroll does not work - scrollbar visible but list does not move
- Status: In review (2026-08-05, behavior feedback addressed)
- Branch: `fix/task-341-related-task-scroll-r2`
- PR: [#415](https://github.com/dorianagaesse/nexus_dash/pull/415) (replaces the auto-closed #412)
- Issue: [#401](https://github.com/dorianagaesse/nexus_dash/issues/401)
- Brief: `tasks/task-341-related-task-scroll.md`

## Objective

Make the related-task candidate list use classic native scrolling whenever its
content exceeds the visible list height. Wheel, trackpad, and touch input must
remain inside the modal scroll-lock boundary; pointer movement must never
scroll the list; and TASK-352 keyboard navigation must keep working.

## Scope

- The related-task popover's scroll container and its overflow/wheel/touch
  behavior.
- The popover portal's relationship to the Radix dialog scroll lock.
- Pointer hover and keyboard-active option state.
- Both task creation and task detail/edit flows where the shared picker is
  used.
- Focused regression coverage with enough candidates to overflow the list.

## Runtime Assumptions

- Existing local PostgreSQL and `.env` prerequisites are unchanged.
- No Prisma migration or schema change is required.
- Radix Dialog's body scroll lock remains enabled and authoritative.

## Acceptance Criteria

1. The related-task candidate list (`[data-related-task-listbox="true"]`) keeps
   its `overflow-y-auto` scroll container so the candidate list scrolls for
   every direction a user can input (mouse wheel, trackpad, touch, keyboard).
2. When used in a modal, the popover is rendered inside the nearest
   `[data-overlay-content="true"]` boundary so Radix permits native wheel and
   touch scrolling while continuing to lock the page.
3. Scrolling the list does not unintentionally scroll the underlying task
   modal or page while the list still has room to move.
4. The visible scrollbar (thin track + thumb) remains in both light and dark
   themes and accurately reflects the list's scroll position.
5. Keyboard navigation already wired by TASK-352 (ArrowDown/ArrowUp,
   Home/End, Enter, Escape) continues to scroll the active option into view
   and to select/end on Enter/Escape.
6. Pointer movement only changes the CSS hover presentation; it never changes
   the keyboard-active option or calls `scrollIntoView`.
7. Both the create-task flow (`create-task-dialog.tsx`) and the
   task-detail/edit flow (`task-detail-modal.tsx`) are covered by the same
   popover behavior.
8. Focused component and browser coverage exercise native wheel scrolling,
   modal containment, passive pointer movement, and keyboard navigation.

## Definition Of Done

- Implementation follows existing service, popover, and project-role
  boundaries; no persistence or API changes.
- `npm run lint`, focused component and Playwright tests, `npm run build`, and
  release validation pass.
- The branch is committed and pushed, a ready-for-review PR is open, and
  automated review feedback is incorporated before handoff.
- `tasks/current.md`, `tasks/backlog.md`, and `journal.md` are updated in the
  same PR.

## Validation

- `npm run lint` passes.
- `npm test -- tests/components/related-task-field.test.tsx` passes (6 tests).
- `npx playwright test tests/e2e/task-350-related-task-picker.spec.ts` passes
  against isolated PostgreSQL 16 (1 Chromium scenario covering edit and
  create flows).
- `npm run build` passes with local validation environment values.
- `git diff --check` passes.

## Outcome

- Render modal popovers inside the dialog content shard so Radix permits
  native wheel, trackpad, and touch scrolling without unlocking the page.
- Keep pointer hover visual-only and reserve active-option state plus
  `scrollIntoView` for keyboard navigation.
- Cover the dialog portal boundary and passive pointer behavior in component
  tests, plus real wheel movement and modal containment in both Playwright
  flows.
