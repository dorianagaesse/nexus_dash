# Current Task: TASK-318 RLS Coverage and Tenant-Isolation CI Guardrail

## Task ID
TASK-318

## Status
Done. PR #344 is open and ready for review.

## Source
- TASK-088 architecture and security audit.
- `tasks/task-318-rls-coverage-tenant-isolation-guardrail.md`

## Objective
Make tenant isolation explicit, reviewable, and continuously verified whenever
the Prisma schema or RLS migrations change.

## Scope
- Classify every Prisma model as directly RLS-protected, intentionally exempt,
  or indirectly project-derived with a documented enforcement decision.
- Add or adjust policies where database-level isolation is appropriate.
- Provision a non-superuser, `NOBYPASSRLS` runtime role for local and CI tests.
- Run real PostgreSQL isolation scenarios without the unit-test RLS shortcut.
- Add a schema-change guardrail requiring every new model to declare its RLS
  classification.
- Document local reproduction, policy extension, and troubleshooting.

## Acceptance Criteria
1. Every Prisma model appears in a committed RLS/exemption inventory.
2. Every project-derived model has an explicit database-enforcement decision.
3. CI creates and tests with a least-privilege `NOBYPASSRLS` runtime role.
4. Cross-project SELECT/INSERT/UPDATE/DELETE tests pass against real PostgreSQL
   policies.
5. Tests fail demonstrably if actor context is absent or references a user
   without membership.
6. Privileged migrations remain separated from runtime queries.
7. New schema models cannot be added without an explicit RLS classification.
8. Runbooks explain local reproduction and policy troubleshooting.

## Definition Of Done
- [x] Model inventory is complete and machine checked.
- [x] Required policy migrations are implemented.
- [x] Least-privilege runtime role exists in local and CI setup.
- [x] Real-database tenant-isolation tests cover the acceptance matrix.
- [x] Schema-change guardrail and developer documentation are active.
- [x] Lint, tests, coverage, build, and E2E validation pass.
- [x] A ready-for-review PR is open and Copilot feedback is handled.

## Delivery Evidence

- Implementation commit: `4f4b58696fb36f892990595b87054231a3a43712`
- Pull request: #344
- Quality Gates run: `27850744706`
  - Quality Core: passed
  - Tenant Isolation (PostgreSQL RLS): passed
  - E2E Smoke: passed
  - Container Image: passed
- Copilot completed its initial review with no comments or review threads.
