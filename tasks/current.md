# Current Task

## Task

- ID: TASK-341
- Title: Related-task picker scroll does not work - scrollbar visible but list does not move
- Status: In Progress (2026-08-04)
- Branch: `feature/task-341-related-task-scroll`
- Issue: [#401](https://github.com/dorianagaesse/nexus_dash/issues/401)
- Brief: `tasks/task-341-related-task-scroll.md`

## Objective

Make the related-task candidate list actually scroll whenever its content
exceeds the visible list height, without re-rendering the popover on each
internal scroll event, and keep the focus/keyboard navigation already added by
TASK-352 working.

## Scope

- The related-task popover's scroll container and its overflow/wheel/touch
  behavior.
- The window-level scroll listener that previously re-positioned the popover
  on every scroll event.
- Both task creation and task detail/edit flows where the shared picker is
  used.
- Focused regression coverage with enough candidates to overflow the list.

## Runtime Assumptions

- Existing local PostgreSQL and `.env` prerequisites are unchanged.
- No Prisma migration or schema change is required.
- The Radix Dialog scroll lock on `document.body` is unchanged.

## Acceptance Criteria

1. The related-task candidate list (`[data-related-task-listbox="true"]`) keeps
   its `overflow-y-auto` scroll container so the candidate list scrolls for
   every direction a user can input (mouse wheel, trackpad, touch, keyboard).
2. The window-level scroll listener that re-positions the popover now ignores
   scroll events whose target sits inside the popover
   (`[data-overlay-popover="true"]`), so scrolling inside the list no longer
   triggers an unnecessary popover re-render.
3. Scrolling the list does not unintentionally scroll the underlying task
   modal or page while the list still has room to move.
4. The visible scrollbar (thin track + thumb) remains in both light and dark
   themes and accurately reflects the list's scroll position.
5. Keyboard navigation already wired by TASK-352 (ArrowDown/ArrowUp,
   Home/End, Enter, Escape) continues to scroll the active option into view
   and to select/end on Enter/Escape.
6. Both the create-task flow (`create-task-dialog.tsx`) and the
   task-detail/edit flow (`task-detail-modal.tsx`) are covered by the same
   popover behavior.
7. Focused component coverage exercises the scroll listener guard, and
   existing related-task tests still pass.

## Definition Of Done

- Implementation follows existing service, popover, and project-role
  boundaries; no persistence or API changes.
- `npm run lint`, `npm test`, `npm run test:coverage`, and `npm run build`
  pass.
- Existing related-task-field tests pass.
- The branch is committed and pushed, a ready-for-review PR is open, and
  initial automated review/check feedback is handled before handoff.
- `tasks/current.md`, `tasks/backlog.md`, and `journal.md` are updated in the
  same PR.

## Validation

- `npm run lint` passes.
- `npm test` passes (focused related-task-field coverage includes the new
  scroll guard test).
- `npm run test:coverage` passes.
- `npm run build` passes.
- Manual scroll check (wheel/trackpad) on the related-task list while the
  create-task dialog and the task-detail modal are open.

## Outcome

- Skip the popover re-position when the scroll event originates inside the
  popover so the candidate list keeps its scroll position.
- Cover the new scroll guard with a focused component test.
