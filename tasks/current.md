# Current Task: TASK-111 Context Card Presentation Refinement - Adaptive Card Sizing and Rich-Content Support

Dedicated task brief: [`tasks/task-111-context-card-presentation-refinement.md`](./task-111-context-card-presentation-refinement.md)

## Task ID
TASK-111

## Status
Planned

## Objective
Make project context cards feel like intentional information blocks rather than plain-text tiles by improving their layout behavior and adding rich-content authoring/rendering support.

## Why Now
- `TASK-111` is now the first actionable UI/content refinement item in the queue.
- The current task-description stack already supports sanitized rich text, so context cards are the clearest place to extend that model next.
- Refining context-card layout and content handling should also set up cleaner follow-on work for `TASK-113`.

## Scope Snapshot
- Replace plain-text context-card content entry with richer authoring aligned with the existing task-description model where appropriate.
- Sanitize and persist context-card content safely so formatting survives create/edit flows.
- Render rich content correctly in context cards and the context preview modal.
- Refine card sizing and preview density so short cards stay compact and longer cards remain readable without making the panel visually noisy.

## Acceptance Snapshot
- Context-card content supports rich-text formatting rather than plain text only.
- Saved formatting is sanitized and displayed consistently across create, edit, grid preview, and preview modal flows.
- Card sizing/layout better accommodates mixed content lengths without a one-size-fits-all feel.
- Existing context-card create/edit/delete and attachment flows continue to work unchanged.

## Notes
- Full task brief, touch points, and validation expectations live in [`tasks/task-111-context-card-presentation-refinement.md`](./task-111-context-card-presentation-refinement.md).

---

Last Updated: 2026-03-27
Assigned To: User + Agent
