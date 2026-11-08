# Project module capabilities

ND-130 introduces one vocabulary: `task`, `meeting`, `context`, `epic`,
`roadmap`, and `schedule`, each with `:read`, `:write`, and `:delete`.
The shared schedule is reserved; these grants do not authorize access to a
person's connected Google Calendar.

## People and invitations

Owners choose a Viewer or Editor role and expand **Module access** when
inviting someone or editing a contributor. Each available module offers no
access, read only, or read and edit. Modules whose existing Editor role allows
deletion also offer read, edit and delete. Only the actual project owner can
manage access, transfer ownership, or delete tasks and context cards.
Assignment, stewardship, authorship, and invitation delivery never grant module
access. Private meeting-note rules still apply in addition to module grants.

`capabilities` is an optional array on invitation creation and member PATCH.
It is validated against the role ceiling. A write/delete grant requires read
for that module. `null` uses the role preset; `[]` denies every module. Omission
on member PATCH preserves existing restrictions, including when changing role.
The effective grant is always intersected with the current role. Archiving and
restoring tasks or epics use write permission; permanent deletion uses delete. Only the
project owner's identity bypasses module restrictions. Invitations copy their
stored grants on acceptance; acceptance cannot supply a replacement grant.

Each service checks its module permission. Forced PostgreSQL RLS adds
restrictive parent and child policies to existing tenant, role and private-note
policies. The dashboard hides unavailable modules and disables unauthorized
delete controls. Permission changes affect subsequent requests immediately.
Shared Realtime messages contain only project/version invalidation metadata,
so an already-open socket cannot disclose content after access changes. HTTP
activity reads remain capability-filtered.

## Agents

Agent credential customization uses the same module scopes. `project:read`
only returns authorized module counts; task scopes no longer grant epic or
meeting-note access. Existing `attention:read` remains an explicitly granted,
limited projection of the agent's own mentions/assignments; it does not permit
opening or changing the underlying module. Responsibility alone grants nothing.
The existing task-Done permission remains a separate, live server-side check.

The task presets remain task-focused. Select meeting, epic, context, or roadmap
scopes explicitly when creating a credential. Tokens are still project-bound,
short-lived, and subject to the existing revocation/rotation checks. Existing
credentials receive explicit meeting/epic grants matching the access formerly
implied by their task scopes. Re-exchange any pre-migration token before using
those modules; no permanent task-to-other-module fallback exists.

## Deployment and rollback

The two migrations are additive. The first adds nullable JSON grant columns and
new enum values; the second backfills agent scopes and adds restrictive policies.
Existing memberships and invitations keep `null` and retain their role behavior.
The public invitation projection is extended by an additive companion function,
so older application releases can still call the original function.

Run the baseline checks and PostgreSQL matrix in
[local-validation.md](local-validation.md) and
[rls-tenant-isolation.md](rls-tenant-isolation.md). Install the Realtime stub
before migrations for the isolation suite (`npm run test:rls:realtime-stub`).
The matrix covers module restrictions and child rows in addition to tenant
isolation. The `project-capabilities` Playwright scenario covers invite grants,
UI visibility, owner controls, direct API denial, and assigned-work denial.

Roll back application code only before owners have issued custom grants. Once
custom grants exist, do not roll back to an application that does not enforce
them: retain the new service/RLS enforcement or restore the pre-rollout database
snapshot and application together during maintenance. Never drop grants or
restrictive policies as a routine rollback. Shared preview databases retain
these additive schema changes when another branch is deployed.
