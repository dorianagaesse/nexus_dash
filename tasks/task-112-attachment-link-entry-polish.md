# TASK-112 Attachment Link Entry Polish

## Goal
Make link attachments faster and clearer to add by using an explicit add affordance and supporting Enter-to-add consistently across task and context-card flows.

## Context
- Attachment link entry already exists across task and context-card create/edit flows.
- The repo previously treated Enter-to-add as important UX (`TASK-033`), but the current client code still uses icon-click confirmation patterns that feel heavier than label entry.
- The current confirm action reuses `Link2`, which visually suggests "link type" more than "add this link now".

## Current Baseline Confirmed In Repo
- Task create flow uses link-composer state in `components/create-task-dialog.tsx`.
- Task edit flow uses link-composer state in `components/kanban/task-detail-modal.tsx` and `components/kanban-board.tsx`.
- Context create/edit flows use similar link-composer patterns in:
  - `components/context-panel/context-create-modal.tsx`
  - `components/context-panel/context-edit-modal.tsx`
  - `components/project-context-panel.tsx`
- Current trigger/confirm icons use `Link2`.

## Scope
- Replace the link-confirm affordance with a clearer add icon treatment while keeping the overall attachment UI compact.
- Support Enter-to-add when the link input is focused in task create/edit and context-card create/edit flows.
- Preserve existing validation behavior for invalid or empty URLs.
- Keep existing file-attachment behavior unchanged.
- Keep accessible labels and disabled-state behavior coherent after the icon change.

## Out of Scope
- Redesigning the full attachment area layout.
- Changing attachment persistence, upload flows, or file validation.
- Rich-content/token rendering changes covered by other tasks.

## Acceptance Criteria
- Link entry uses an add-oriented confirm affordance rather than a second link icon.
- Pressing Enter in the link input adds the staged link when the value is valid/non-empty.
- Task and context-card create/edit flows behave consistently.
- Existing attachment create/edit/remove behavior remains intact.
- Relevant UI coverage is updated where selectors or button labels change.

## Likely Touch Points
- `components/create-task-dialog.tsx`
- `components/kanban/task-detail-modal.tsx`
- `components/kanban-board.tsx`
- `components/context-panel/context-create-modal.tsx`
- `components/context-panel/context-edit-modal.tsx`
- `components/project-context-panel.tsx`
- `tests/e2e/smoke-project-task-calendar.spec.ts`

## Validation Baseline
- `npm run lint`
- `npm test`
- `npm run test:coverage`
- `npm run build`
- `npm run test:e2e`

## Open Questions
1. None currently blocking initial implementation.
