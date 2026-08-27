# TASK-326: Google Calendar Connection Ownership Hardening

## Status

Implementation complete on `feature/task-326-calendar-ownership-r4`; refreshed
onto current `main` after TASK-406 merged.

## Objective

Close the lifecycle and enforcement gaps in the existing single-Google-
connection model while preserving strict authenticated-user ownership.

## Scope

- Enforce active-only credential reads, refreshes, and target updates.
- Implement idempotent, fail-closed disconnect with provider revocation and
  unconditional local token removal.
- Require token encryption whenever Calendar OAuth is configured outside tests
  and upgrade legacy plaintext rows when read.
- Add accessible disconnect UX and repair the dashboard summary request.
- Fail Preview deployment before alias publication when the shared database is
  incompatible with the branch's Prisma models.
- Automatically realign project-ref-validated, staging-guarded Preview when its
  migration history belongs to another branch, without an operator checkbox.
- Keep provider authentication failures distinct from local credential-store
  availability failures.
- Prove ownership in unit/API/UI and real PostgreSQL RLS tests.

## Acceptance Criteria

1. Revoked credentials cannot authorize Calendar operations.
2. Disconnect affects only the signed-in user, removes local tokens even when
   provider revocation fails, and reports a safe revocation status.
3. Target reset remains available through PATCH while DELETE disconnects.
4. Configured non-test Calendar OAuth requires token encryption and legacy
   plaintext tokens are rewritten encrypted.
5. Calendar summary requests include their project authorization context.
6. Automated and real-database coverage proves the ownership boundary.
7. A Preview whose database was advanced by another branch cannot publish an
   apparently healthy but schema-incompatible deployment.
8. Database failures do not present as invalid Google credentials or a 401
   reauthorization requirement.
9. Preview automatically preserves compatible staging data or safely realigns
   divergent migration history after validating the configured Supabase project
   ref and enabled staging guard, restoring runtime grants and the wipe guard.

## Definition Of Done

- Runtime, tests, docs, ADR index, changelog, version, and tracking documents
  are consistent.
- Lint, RLS inventory/matrix, tests, coverage, build, and E2E pass.
- An explicit-ref preview is validated.
- The branch is pushed and a ready-for-review PR is open with automated feedback
  handled.
