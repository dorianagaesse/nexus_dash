# TASK-318 RLS Coverage and Tenant-Isolation CI Guardrail

## Status

Pending. High-priority architecture guardrail; normal feature delivery may
continue in parallel.

## Source

TASK-088 architecture and security audit.

## Problem

NexusDash has strong RLS policies for core project data, but the repository does
not maintain a complete classification of every Prisma model as RLS-protected
or intentionally exempt. Existing unit tests bypass transaction-local RLS setup,
and CI database tests run as the PostgreSQL superuser rather than the
least-privilege production runtime role.

This means service authorization is well tested, while the database's final
tenant-isolation boundary is not continuously proven across the full schema.

## Objective

Make tenant isolation explicit, reviewable, and continuously verified whenever
the Prisma schema or RLS migrations change.

## Scope

### Model inventory

- Classify every Prisma model as one of:
  - project-scoped and directly RLS-protected;
  - user-scoped and directly RLS-protected;
  - system/operational data intentionally exempt from RLS;
  - indirectly project-derived data requiring a documented decision.
- Include at minimum:
  - `TaskCommentReaction`;
  - `ApiCredential`;
  - `ApiCredentialScopeGrant`;
  - `AuthAuditEvent`;
  - `ProjectNotificationEmail`;
  - `ProjectNotificationEmailItem`;
  - authentication/session/rate-limit tables.
- Record the reason and enforcement owner for every exemption.

### Policy remediation

- Add or adjust RLS policies where the inventory shows that database-level
  isolation is appropriate.
- Preserve legitimate unauthenticated/system workflows through narrowly scoped
  service roles or explicit operational paths rather than broad bypasses.
- Confirm policy behavior for cascading child records and indirect project
  ownership.

### CI integration

- Provision a local/CI PostgreSQL runtime role that is:
  - non-superuser;
  - `NOBYPASSRLS`;
  - aligned with the production `app_runtime` permissions.
- Run dedicated integration tests without the `NODE_ENV === "test"` RLS
  shortcut.
- Keep migration/admin setup on a separate privileged connection.

### Isolation scenarios

For two users and two projects, verify denial or invisibility for:

- cross-project SELECT;
- cross-project INSERT;
- cross-project UPDATE;
- cross-project DELETE;
- child-table access by IDs discovered outside the actor's project;
- viewer/editor/owner role differences where policies encode write access;
- revoked or absent project membership;
- relevant agent-credential and operational-table access.

### Future guardrail

- Add a schema/migration review check that requires newly introduced models to
  declare their RLS classification.
- Document how developers add policies and isolation tests for a new
  project-scoped model.

## Acceptance Criteria

1. Every Prisma model appears in a committed RLS/exemption inventory.
2. Every project-derived model has an explicit database-enforcement decision.
3. CI creates and tests with a least-privilege `NOBYPASSRLS` runtime role.
4. Cross-project SELECT/INSERT/UPDATE/DELETE tests pass against real PostgreSQL
   policies.
5. Tests fail demonstrably if the actor context is absent or references a user
   without membership.
6. Privileged migrations remain separated from runtime queries.
7. New schema models cannot be added without an explicit RLS classification.
8. Runbooks explain local reproduction and policy troubleshooting.

## Non-Goals

- Replacing PostgreSQL, Prisma, or Supabase.
- Rewriting service authorization that already provides correct role checks.
- Introducing a new application-wide authorization framework.
- Blocking unrelated product work while the guardrail is implemented.

## Dependencies

- TASK-085: PostgreSQL RLS hardening.
- TASK-088: Architecture and security audit.

## Definition Of Done

- [ ] Model inventory is complete and reviewed.
- [ ] Required policy migrations are implemented.
- [ ] Least-privilege runtime role exists in local and CI setup.
- [ ] Real-database tenant-isolation tests cover the acceptance matrix.
- [ ] Schema-change guardrail and developer documentation are active.
- [ ] Lint, tests, coverage, build, and E2E validation pass.
