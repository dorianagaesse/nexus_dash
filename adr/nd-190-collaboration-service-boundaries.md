# ND-190: Collaboration service ownership

- Date: 2026-11-07
- Status: Proposed for user review in #650; adoption follows the user's merge

`lib/services/project-collaboration-service.ts` remains the public entry point
for routes, server actions, and other services. It re-exports the existing
functions and types from focused modules under `lib/services/collaboration/`.
Callers do not need to know which module implements a use case.

| Module | Responsibility |
| --- | --- |
| `owner-invitations.ts` | Owner-authorized invite search, creation/replacement, resend, and revocation |
| `project-membership.ts` | Sharing reads, role changes, responsibility-aware removal, role checks, and member lookup |
| `recipient-invitations.ts` | Recipient inbox/count, invitation landing state, and accept/decline |
| `invitation-data.ts` | Shared invitation projections and verified-email lookup |
| `invitation-email.ts` | Delivery after the invitation transaction completes |
| `collaboration-policy.ts` | Normalization, collaborator identities, invitation states, and response mapping |
| `collaboration-types.ts` | Public summaries, service results, and internal projection records |

Authorization stays in each application use case. Existing actor-scoped
transactions stay in those use cases; shared queries receive that same `db`
client. Invitation landing retains its existing restricted SQL projection for
visitors who have not joined the project. This extraction does not introduce a
new transaction, broader database role, or alternate authorization path.

Invite replacement and notification resolution remain atomic. Email delivery
stays after commit so provider failures do not undo invitations. Recipient
acceptance retains verified-email binding, concurrent acceptance handling,
membership rollback after revocation, and activity repair. Member removal
resolves active responsibilities before deleting access with the same client.

Tests follow these ownership seams. Route tests continue to exercise the
public facade, and the browser lifecycle covers invitation acceptance, role
changes, removal, and authorization. The existing PostgreSQL isolation matrix
continues to validate the unchanged tenant boundaries.
