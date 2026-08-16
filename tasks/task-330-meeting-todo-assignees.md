# TASK-330: Meeting Todo Assignees and Completion Accountability

## Status

Implementation and validation complete on
`feature/task-330-meeting-todo-assignees`; ready for review.

## Product Outcome

Meeting follow-ups become accountable work: collaborators can see who created,
owns, and completed each todo; filter the project queue by responsibility; and
recognize assignments that need attention after a member or agent loses access.

## Design Notes

- Assignment and access remain separate. Selecting an actor never changes a
  project role or agent scope.
- Human and agent identities share a presentation contract, while the persisted
  foreign keys remain explicit and constrained so ambiguous dual assignments
  cannot be created.
- Durable display snapshots keep historical responsibility understandable when
  a user or credential is no longer active.
- Responsibility filters use URL query parameters so navigation, refresh, and
  browser history preserve the selected view.
- External participant identities remain meeting attendance context only.

## Acceptance Criteria

See [`current.md`](./current.md#acceptance-criteria).

## Definition Of Done

See [`current.md`](./current.md#definition-of-done).
