# Current Task: TASK-112 Attachment Link Entry Polish - Add-Icon Affordance and Enter-to-Add Across Task/Context Flows

Dedicated task brief: [`tasks/task-112-attachment-link-entry-polish.md`](./task-112-attachment-link-entry-polish.md)

## Task ID
TASK-112

## Status
In progress

## Objective
Make link attachments faster and clearer to add by using an explicit add affordance and supporting Enter-to-add consistently across task and context-card flows.

## Why Now
- `TASK-112` is the smallest user-facing refinement in the new authoring queue and a good first implementation slice.
- The current flows already stage link attachments consistently, so the change can stay focused on interaction polish rather than storage or API behavior.
- Shipping this now also restores Enter-to-add ergonomics explicitly across task and context-card flows.

## Scope Snapshot
- Replace the link-confirm affordance with a clearer add icon treatment while keeping the attachment UI compact.
- Support Enter-to-add when the link input is focused in task create/edit and context-card create/edit flows.
- Preserve existing validation and attachment persistence behavior.

## Acceptance Snapshot
- Link entry uses an add-oriented confirm affordance rather than a second link icon.
- Pressing Enter in the link input adds the staged link when the value is valid/non-empty.
- Task and context-card create/edit flows behave consistently.
- Existing attachment create/edit/remove behavior remains intact.

## Notes
- Full task brief, touch points, and validation expectations live in [`tasks/task-112-attachment-link-entry-polish.md`](./task-112-attachment-link-entry-polish.md).

---

Last Updated: 2026-03-27
Assigned To: User + Agent
