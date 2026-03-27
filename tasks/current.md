# Current Task: TASK-111 Context Card Presentation Refinement - Fixed-Size Cards and Rich-Content Support

Dedicated task brief: [`tasks/task-111-context-card-presentation-refinement.md`](./task-111-context-card-presentation-refinement.md)

## Task ID
TASK-111

## Status
In progress

## Objective
Make project context cards easier to scan by keeping them at a fixed visual size while upgrading context-card content to the same sanitized rich-text model used by task descriptions.

## Why Now
- Context cards are currently the noisiest dashboard surface when a note gets long, so fixed-size cards are the quickest way to recover overview readability.
- The task-description stack already has rich-text authoring and sanitization patterns we can reuse safely here.
- Shipping this before `TASK-113` gives later content-polish work a stronger context-card foundation.

## Scope Snapshot
- Replace plain-text context-card content entry with rich-text authoring aligned to the existing task-description experience.
- Sanitize and persist rich content safely for create/edit flows.
- Render rich content consistently in fixed-size context cards and in the preview modal without letting long notes take over the grid.
- Preserve existing context-card attachments, color treatment, and edit/delete flows.

## Acceptance Snapshot
- Context-card content supports sanitized rich text instead of plain text only.
- Grid cards keep a fixed visual footprint and show a clipped but readable preview for longer notes.
- Preview modal renders the saved rich content correctly.
- Existing context-card create/edit/delete and attachment behavior remains intact.

## Notes
- Full task brief, touch points, and validation expectations live in [`tasks/task-111-context-card-presentation-refinement.md`](./task-111-context-card-presentation-refinement.md).

---

Last Updated: 2026-03-27
Assigned To: User + Agent
