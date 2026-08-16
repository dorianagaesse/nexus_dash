# TASK-326: Google Calendar Connection Ownership Hardening

## Status

Implementation complete on `feature/task-326-calendar-ownership`; review and
validation refreshed against current `main` after TASK-325 merged.

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

## Definition Of Done

- Runtime, tests, docs, ADR index, changelog, version, and tracking documents
  are consistent.
- Lint, RLS inventory/matrix, tests, coverage, build, and E2E pass.
- An explicit-ref preview is validated.
- The branch is pushed and a ready-for-review PR is open with automated feedback
  handled.
