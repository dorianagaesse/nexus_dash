# TASK-336: Multi-user Collaboration Audit

## Status

Audit complete; delivery review in progress on
`docs/task-336-multi-user-collaboration-audit`.

## Context

NexusDash is designed as a shared execution workspace for people and agents,
but collaboration quality varies by feature. Project roles and tenant
isolation establish who may access data; they do not automatically establish
who is accountable for an object, who should act next, who changed it, or how
another collaborator can understand its history.

Meeting notes expose the mismatch clearly: participants can be identified, but
the note itself has no visible accountable owner and its follow-up todos have
no assignee. The same audit lens must be applied across the whole product
before isolated fixes create inconsistent collaboration patterns.

## Audit Lens

For each product surface, evaluate:

- accountable owner or steward
- action assignee where work must be completed
- creator, author, editor, and agent attribution
- activity and decision history
- role and capability boundaries
- notifications, mentions, and handoff
- discovery through filters, grouping, and personal views
- lifecycle states, archival, and reassignment

## Deliverables

- A repository-grounded collaboration audit under `docs/audits/`.
- A prioritized set of refinement tasks in `tasks/backlog.md`.
- Explicit links to existing tasks where the gap is already planned.

## Acceptance Criteria

See [`current.md`](./current.md#acceptance-criteria).

## Definition Of Done

See [`current.md`](./current.md#definition-of-done).

## Outcome

- Audit:
  [`docs/audits/task-336-multi-user-collaboration-audit.md`](../docs/audits/task-336-multi-user-collaboration-audit.md)
- Refinement program: TASK-337 through TASK-348 in
  [`backlog.md`](./backlog.md#collaboration-refinement-program-task-336-audit)
- Existing tasks refined instead of duplicated: TASK-330 and TASK-331.
