# Current Task: TASK-093 Task Lifecycle UX - Manual Archive Action for Done Tasks

## Task ID
TASK-093

## Status
Ready to start

## Objective
Add an explicit `Move to Archive` action for done tasks so users can archive them immediately instead of waiting for automatic stale-task archiving.

## Scope
- Add a manual archive action in the task options UI for eligible done tasks.
- Reuse the existing archive behavior and destination so manual and automatic archiving stay consistent.
- Keep task permissions and project boundaries unchanged.
- Update validation coverage for the new archive path where it adds real confidence.

## Out of Scope
- Changing the existing automatic archive timing or policy.
- Redesigning the broader task lifecycle or status model.
- Introducing task dependency or emoji-input features in this task.

## Acceptance Criteria
- A done task exposes a clear `Move to Archive` action.
- Triggering the action archives the task immediately.
- Non-done tasks do not expose the action.
- Existing archive views reflect the change without inconsistent state.
- Validation for the touched flows stays green.

## Notes
- TASK-085 is complete and moved to the completed backlog section.
- New feature ideas captured in the backlog for follow-up:
  - TASK-094: emoji picker/button across text fields
  - TASK-095: optional task dependencies with hover-linked highlighting

## Next Steps
1. Trace the current archive flow in UI, route, and service layers.
2. Add the manual archive trigger to the done-task surface with the smallest safe UX change.
3. Reuse existing archive mutation behavior rather than creating a parallel archive path.
4. Validate happy path, permission boundaries, and archive visibility updates.

---

Last Updated: 2026-03-11
Assigned To: User + Agent
