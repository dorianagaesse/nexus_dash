# ND-455 RLS-Safe Actor Projections (`app.list_project_actors`)

Date: 2026-10-11
Status: Accepted; records the shipped ND-382 implementation and the pattern lineage it generalized.

## Context and scope

NexusDash enforces tenant isolation with forced PostgreSQL row-level security
under a non-bypass runtime role. Two facts collide on actor displays:

- `ApiCredential` SELECT is owner-only (`api_credential_select_policy` in
  [the task318 RLS coverage migration](../prisma/migrations/20260619120000_task318_rls_coverage/migration.sql)).
- Every current project member legitimately needs the display identity and live
  status of project agents — mention autocomplete, task and meeting-todo
  assignee pickers, meeting-note stewards, and attention surfaces.

Before ND-382 the actor registry read `ApiCredential` through a direct Prisma
include. Under forced RLS that returned zero rows for every non-owner session,
so agents silently vanished from all pickers (journal, 2026-09-10). Local test
suites could not catch it because the local database connection bypasses RLS.

The resolution, `app.list_project_actors(target_project_id)`
([ND-382 migration](../prisma/migrations/20260909212500_nd382_project_actor_safe_read/migration.sql)),
follows the established SECURITY DEFINER projection pattern:
`app.list_project_meeting_note_actors` (TASK-356,
[meeting-note stewardship migration](../prisma/migrations/20260809120000_task356_meeting_note_stewardship/migration.sql))
and the context-card variant introduced with TASK-342 stewardship. The
context-card variant was dropped in ND-447 with its last consumer, which is
part of the lifecycle this ADR records.

Verified against `origin/main` at `13a4951`.

This ADR governs read-only projections of actor display metadata. It does not
change any existing policy, function, or service.

## Decision

When current project members must read a display-safe subset of rows that RLS
deliberately restricts to owners or another narrower scope, add a read-only
SECURITY DEFINER SQL projection. Do not widen the base table's policy, and do
not duplicate the data into a member-readable table.

### When to use a projection

- The read is legitimately required by every current project member, or by a
  broader scope than the base policy allows.
- The base table's RLS restriction is intentional and must stay (for
  `ApiCredential`, the rows are secret-bearing).
- The caller needs only a small, stable slice of columns that can be stated as
  a display contract.
- The projection is the single sanctioned read path for that contract. Never
  grant direct base-table access instead, and prefer extending
  `app.list_project_actors` over adding a near-duplicate projection.

### Membership revalidation requirement

A SECURITY DEFINER function executes with the definer's privileges and is not
filtered by the caller's RLS policies. The function itself must therefore
re-derive the caller's access:

- Read the caller identity from `app.current_user_id()` — the transaction-local
  actor set by
  [`withActorRlsContext`](../lib/services/rls-context.ts)
  (`set_config('app.user_id', '<id>', true)`).
- Restrict the returned rows to projects where the caller is the owner or holds
  a `ProjectMembership` row (the `accessible_project` CTE in the
  [ND-382 migration](../prisma/migrations/20260909212500_nd382_project_actor_safe_read/migration.sql)).
  A caller with no actor context, no membership, or a removed membership
  receives zero rows — not an error, and never partial or cross-project data.
- Keep the service layer as a second gate: `loadProjectActorRegistry`
  ([project-actor-service.ts](../lib/services/project-actor-service.ts)) runs
  inside `withActorRlsContext`, and its entry points (`listProjectActors`,
  `loadProjectActorRegistryForActor`, `searchProjectActors`) first require the
  project principal (`buildProjectPrincipalWhere` / `requireProjectRole`)
  before invoking the function.
- Grant shape: `REVOKE ALL ... FROM PUBLIC` followed by `GRANT EXECUTE ... TO
  PUBLIC` is acceptable only because the guard is the internal membership
  predicate, not the EXECUTE grant. Access control lives in the function body;
  never rely on role grants for a projection.

### No-secret-material rule

- Return only display-safe fields. Humans: `actorId`, `name`, `email`,
  `username`, `usernameDiscriminator`, `avatarSeed`. Agents: `actorId`,
  `label`, `revokedAt`, `expiresAt`. Nothing else.
- Never return secret-bearing columns — raw keys, token material, key hashes,
  or anything that could authenticate or impersonate an actor. A hashed secret
  is still secret material.
- Function hygiene: `LANGUAGE sql`, `STABLE`, read-only, with an explicit safe
  `SET search_path` (`public, app, pg_temp` or the minimal equivalent).
- Derived state stays derived: the projection carries `revokedAt`/`expiresAt`
  timestamps, and callers compute revoked/expired status at read time via
  `resolveAgentCredentialStatus`
  ([agent-access.ts](../lib/agent-access.ts)).

## Consumers and maintenance contract

- The typed row mapper (`RlsSafeProjectActorRow` in
  [project-actor-service.ts](../lib/services/project-actor-service.ts)) must
  mirror the function's return columns exactly; change both in the same PR.
- Live consumers of `loadProjectActorRegistry`: task and context-card actor
  services, meeting-todo actors, agent attention, task comments (mention
  validation), and task search. The meeting-note service reads its own
  `app.list_project_meeting_note_actors` projection.
- Lifecycle: a projection exists for its consumers. When the last consumer is
  removed, drop the projection in the same change — as ND-447 did for the
  context-card variant. Do not keep orphaned privileged functions.
- The membership predicate is duplicated between the base policy and the
  function body by design. If membership or role semantics change, update both
  in the same change.

## Boundary with other SECURITY DEFINER functions

This ADR governs read projections of actor display metadata. Other SECURITY
DEFINER functions follow the same revalidation principle under their own
contracts:
[`app.touch_project_activity`](../prisma/migrations/20260530120000_task118_project_activity_touch/migration.sql)
revalidates owner/editor membership and raises on an absent actor (per the
2026-05-30 decision in [decisions.md](./decisions.md)), while
`app.resolve_project_actor_responsibilities` is owner-only (ND-179). This ADR
does not change them.

## Consequences

- Non-owner members render live agent identity and status on every surface
  without any credential read access; the owner-only `ApiCredential` policies
  remain untouched, so defense in depth is preserved.
- Each projection is a privileged surface that must be reviewed, covered by the
  isolation matrix, and cleaned up with its consumers. Keep projections
  per-contract and few.
- The projection is a public function signature: renaming or reshaping it is a
  database migration coordinated with every consumer.

## Validation requirements

The real-PostgreSQL isolation matrix
([test-rls-isolation.mjs](../scripts/test-rls-isolation.mjs), run via
`npm run test:rls:setup` and `npm run test:rls` per
[the RLS runbook](../docs/runbooks/rls-tenant-isolation.md)) must cover, for
each projection:

- member: zero rows from direct base-table reads, expected rows through the
  projection for their own project;
- cross-project caller: zero rows;
- absent actor context: zero rows;
- removed membership: zero rows;
- the selected columns expose no secret-bearing field.

## Links

- Board card ND-455; source decision ND-382, PR #497.
- Migrations:
  [20260909212500_nd382_project_actor_safe_read](../prisma/migrations/20260909212500_nd382_project_actor_safe_read/migration.sql),
  [20260809120000_task356_meeting_note_stewardship](../prisma/migrations/20260809120000_task356_meeting_note_stewardship/migration.sql),
  [20260914120000_nd447_remove_context_card_stewardship](../prisma/migrations/20260914120000_nd447_remove_context_card_stewardship/migration.sql),
  [20260619120000_task318_rls_coverage](../prisma/migrations/20260619120000_task318_rls_coverage/migration.sql).
- Code:
  [lib/services/project-actor-service.ts](../lib/services/project-actor-service.ts),
  [lib/services/rls-context.ts](../lib/services/rls-context.ts),
  [lib/project-actor.ts](../lib/project-actor.ts).
- Runbook: [docs/runbooks/rls-tenant-isolation.md](../docs/runbooks/rls-tenant-isolation.md).
