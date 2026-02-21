# Current Task: TASK-045 Authentication Phase 1 - User/Session Data Model and Migrations

## Task ID
TASK-045

## Status
In Progress (2026-02-21)

## Summary
Implement the authentication persistence foundation in Prisma/PostgreSQL by introducing Auth.js-compatible user/account/session/token tables and a safe migration path, without mixing TASK-076 principal-boundary refactors.

## Scope Boundaries
- In scope:
  - Prisma schema additions for `User`, `Account`, `Session`, and `VerificationToken`.
  - Forward-only migration SQL for staging/prod-safe deployment.
  - Minimal code/test updates required to keep current app behavior stable.
- Out of scope:
  - Broad principal-scoped service authorization changes (TASK-076).
  - Route/page auth protection and middleware enforcement (TASK-046).
  - Public API auth/token exposure (TASK-059).

## Acceptance Criteria
- Prisma schema includes Auth.js-compatible persistence models:
  - `User`
  - `Account`
  - `Session`
  - `VerificationToken`
- A new migration exists in `prisma/migrations/**` and applies cleanly using `prisma migrate deploy`.
- Migration is applied successfully to staging Supabase from local environment.
- Existing app functionality remains stable (no regressions in current API/UI flows).
- Local validation succeeds:
  - lint
  - tests
  - build
- A dedicated PR is opened for `TASK-045` only (no mixed-task implementation).
- PR workflow completes with:
  - green required GitHub checks,
  - Copilot review handled in-thread (reply + resolve where applicable),
  - successful preview deployment explicitly validated.

## Definition of Done
- `TASK-020` marked done and `TASK-045` marked current/in progress in task tracking files.
- `TASK-045` implementation merged only after all acceptance criteria are satisfied.
- Changes are production-safe, tested, and documented enough to start `TASK-076` cleanly next.

## Next Step
Implement schema + migration foundation, validate locally and on staging, then open and drive the `TASK-045` PR to completion.

---

Last Updated: 2026-02-21
Assigned To: User + Agent
