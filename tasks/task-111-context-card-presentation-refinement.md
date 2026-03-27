# TASK-111 Context Card Presentation Refinement

## Goal
Make project context cards feel like intentional information blocks rather than plain-text tiles by improving their layout behavior and adding rich-content authoring/rendering support.

## Context
- Context cards are already a core dashboard surface (`TASK-004`) and attachment-capable (`TASK-007`, `TASK-075`).
- The current task-description stack already supports sanitized rich text, but context card content still travels through plain-text inputs and plain-text rendering.
- The current context grid uses fixed card density, which can make short cards feel oversized and longer cards feel cramped.

## Current Baseline Confirmed In Repo
- Create/edit flows use `EmojiTextareaField` for context content in:
  - `components/context-panel/context-create-modal.tsx`
  - `components/context-panel/context-edit-modal.tsx`
- Service normalization for context content is plain text in:
  - `lib/services/context-card-service.ts`
- Read surfaces render plain text only in:
  - `components/context-panel/context-cards-grid.tsx`
  - `components/context-panel/context-preview-modal.tsx`
- Card layout currently uses a simple fixed grid:
  - `sm:grid-cols-2 xl:grid-cols-3`

## Scope
- Replace plain-text context-card content entry with rich-text authoring aligned with the existing task-description model where appropriate.
- Sanitize and persist context-card content safely so formatting survives create/edit flows.
- Render rich content correctly in context cards and the context preview modal.
- Refine card sizing and preview density so short cards stay compact and longer cards remain readable without making the panel visually noisy.
- Preserve attachment preview behavior and existing card color treatment.

## Out of Scope
- Reworking the broader project dashboard layout outside the context-card area.
- New attachment types or storage behavior.
- Token-field UI, code-block-specific formatting, or Kanban preview changes from `TASK-113`.

## Acceptance Criteria
- Context-card content supports rich-text formatting rather than plain text only.
- Saved formatting is sanitized and displayed consistently across create, edit, grid preview, and preview modal flows.
- Card sizing/layout better accommodates mixed content lengths without a one-size-fits-all feel.
- Existing context-card create/edit/delete and attachment flows continue to work unchanged.
- Validation covers at least the content-sanitization and rendering-critical paths touched by implementation.

## Likely Touch Points
- `components/context-panel/context-create-modal.tsx`
- `components/context-panel/context-edit-modal.tsx`
- `components/context-panel/context-cards-grid.tsx`
- `components/context-panel/context-preview-modal.tsx`
- `components/project-context-panel.tsx`
- `components/rich-text-editor.tsx`
- `lib/services/context-card-service.ts`
- `app/api/projects/[projectId]/context-cards/route.ts`
- `app/api/projects/[projectId]/context-cards/[cardId]/route.ts`

## Validation Baseline
- `npm run lint`
- `npm test`
- `npm run test:coverage`
- `npm run build`
- `npm run test:e2e` if the context create/edit/preview flow changes materially enough to justify a browser-level regression pass

## Open Questions
1. None currently blocking initial implementation.
