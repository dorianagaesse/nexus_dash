# TASK-338 / ND-179: Project ownership continuity

## Status

Accepted on 2026-09-09.

## Context

Project membership removal and agent credential revocation previously changed
access without accounting for active work owned by the departing actor. Project
ownership itself was fixed to the creator, leaving no safe handoff-and-leave
path. Application-only multi-statement ownership updates would also expose
intermediate membership states to concurrent requests and could leave a project
without a valid owner if the sequence drifted.

## Decision

The application uses one shared responsibility inventory for human and agent
actors. It includes non-Done, non-archived task assignments; all context-card
stewardship; non-Done meeting-note stewardship; and open meeting-todo
assignments. An access-removal transaction recomputes the inventory and, when
non-empty, requires either reassignment to an accepted remaining human
collaborator or explicit unassignment before removing access.

Ownership transfer is a separate owner-only service operation. It validates the
target membership under the actor's RLS context, resolves the current owner's
active responsibility when they elect to leave, and calls
`app.transfer_project_ownership`. The security-definer function verifies the
session actor again, locks the project row, promotes the target membership,
demotes or deletes the former owner's membership, and updates `Project.ownerId`
as one transaction.

Only active assignment and stewardship fields change. Creator, editor,
completer, uploader, comment-author, audit, and display-name snapshot fields are
historical provenance and are never rewritten by offboarding.

## Consequences

- Stale client inventories cannot bypass the server-side resolution check.
- Projects retain one owner across concurrent ownership transfers, and the
  former owner can leave without a transient ownerless state.
- Transfer targets must already be accepted project collaborators; invitations
  and agents cannot become owners.
- The privileged function must stay narrowly scoped, revoke public execution,
  validate `app.current_user_id()`, and remain covered by the least-privilege
  PostgreSQL matrix.
- Responsibility categories added later must be incorporated into the shared
  inventory and resolver before their actors can be safely offboarded.
