# TASK-336: Multi-user Collaboration Audit

## Status

Complete on `docs/task-336-multi-user-collaboration-audit`; ready-for-review
PR [#393](https://github.com/dorianagaesse/nexus_dash/pull/393).

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

1. The audit covers every implemented project-dashboard module plus sharing,
   notifications, attachments, account-scoped integrations, and agent access.
2. Each audited surface records its current collaboration strengths, material
   gaps, user impact, and recommended direction.
3. The audit explicitly evaluates ownership, assignment, authorship,
   modification attribution, history, permissions, notifications, handoff, and
   agent/human identity.
4. Recommendations distinguish accountable ownership from participation,
   creation, editing, and mere visibility.
5. Findings are prioritized by collaboration risk and implementation
   dependency rather than by visual prominence alone.
6. Every material remediation is represented by a focused `TASK-XXX` backlog
   entry with rationale and dependencies; duplicate or already-planned work is
   referenced instead of recreated.
7. Meeting-note ownership and meeting-todo assignment receive specific
   treatment, while the audit also identifies comparable gaps elsewhere.
8. The audit is evidence-based from schema, services, routes, UI, tests, and
   available runtime behavior.

## Definition Of Done

- A dated audit document is committed under `docs/audits/`.
- `tasks/backlog.md` contains the resulting prioritized refinement tasks and
  updated review date.
- `tasks/current.md` and `journal.md` record the audit outcome.
- Documentation links and formatting pass repository checks.
- The branch is committed and pushed, a ready-for-review PR is open, and
  initial automated review/check feedback is handled before handoff.

## Outcome

- Audit:
  [`docs/audits/task-336-multi-user-collaboration-audit.md`](../docs/audits/task-336-multi-user-collaboration-audit.md)
- Refinement program: TASK-337 through TASK-348 in
  [`backlog.md`](./backlog.md#collaboration-refinement-program-task-336-audit)
- Existing tasks refined instead of duplicated: TASK-330 and TASK-331.
