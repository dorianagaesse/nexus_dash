# Current Task: TASK-047 Authentication Implementation Phase 3 - Home-Page Auth Entry and Account Onboarding UX

## Task ID
TASK-047

## Status
In Review (PR Open) (Current) (2026-02-24)

## Objective
Deliver the signed-out entry experience on `/` with clear `Sign in` / `Sign up` flows, then route authenticated users into the protected app (`/projects`) without manual session workarounds.

## Why Now
- TASK-046 is merged and route/API protection is active by default.
- Users currently cannot self-authenticate from UI when signed out.
- This unblocks normal preview/prod onboarding and prepares social provider rollout in TASK-068.

## Dependencies
- TASK-046 (Done): auth core runtime and route/API protection.
- TASK-045 (Done): user/session/account schema foundation.
- TASK-020 (Done): approved auth architecture and signed-out home behavior.

## Locked Decisions
- Auth method for this phase: `A` email auth only.
- Signed-out home behavior: `A` homepage is the auth entry surface.
- Post-auth redirect: `A` always redirect to `/projects`.

## Scope
- Build signed-out homepage auth entry UX with `Sign in` and `Sign up` actions.
- Implement email/password sign-in and sign-up flow aligned with existing auth core.
- Ensure successful auth creates/uses valid DB-backed session and redirects to `/projects`.
- Ensure authenticated users do not see signed-out auth entry on `/`.
- Add tests for signed-out entry visibility and successful auth routing behavior.

## Out of Scope
- Social login buttons/provider rollout (TASK-068).
- Team invites, sharing roles, and authorization UX (TASK-058).
- Agent token flows (TASK-059).

## Implementation Checklist
1. Define `/` behavior split for signed-out vs authenticated users.
2. Implement sign-in/sign-up UI and server actions/API handlers for email auth.
3. Add validation/error states (wrong credentials, duplicate email, weak input).
4. Wire successful auth redirect to `/projects`.
5. Add tests for:
   - signed-out home entry rendering
   - successful sign-in/sign-up routing
   - signed-in behavior on `/`
6. Run validation (`lint`, `test`, `test:coverage`, `build`) and open PR.

## Acceptance Criteria
- Signed-out user landing on `/` sees clear `Sign in` and `Sign up` options.
- Email sign-up creates account + session and lands on `/projects`.
- Email sign-in creates session and lands on `/projects`.
- Auth errors are user-readable and do not leak sensitive details.
- Protected pages remain inaccessible without session.

## Definition of Done
- Dedicated branch and PR for TASK-047 only.
- CI checks pass.
- Copilot review handled and conversations resolved.
- Manual preview deploy tested for sign-in/sign-up and redirect behavior.
- Task tracking updated in `tasks/current.md`, `tasks/backlog.md`, and `journal.md`.

## Decided Inputs
1. Auth method scope: `A` email auth only.
2. Signed-out home behavior: `A` homepage default auth entry.
3. Post-auth navigation: `A` redirect to `/projects`.

## Next Step
Await PR merge to `main`, then proceed to TASK-068/TASK-058 sequencing.

## Execution Outcome (Current PR)
- Branch: `feature/task-047-home-auth-entry-onboarding-ux`
- PR: https://github.com/dorianagaesse/nexus_dash/pull/54
- Implemented signed-out auth entry on home (`/`):
  - Added dedicated `Sign in` and `Sign up` forms with clear validation feedback.
  - Redirected authenticated users from `/` to `/projects`.
- Implemented credentials auth core:
  - Added server actions `app/home-auth-actions.ts` for sign-in/sign-up.
  - Added password hashing + verification service (`scrypt`) in `lib/services/password-service.ts`.
  - Added email/password auth service in `lib/services/credential-auth-service.ts`.
  - Added session issuance helper in `lib/services/session-service.ts` and secure HttpOnly session cookie set on successful auth.
- Persistence updates:
  - Added optional `User.passwordHash` in Prisma schema.
  - Added migration `prisma/migrations/20260224223000_task047_email_password_auth/migration.sql`.
- Added regression tests:
  - `tests/lib/password-service.test.ts`
  - `tests/lib/credential-auth-service.test.ts`
  - `tests/app/home-auth-actions.test.ts`
  - `tests/app/home-page.test.ts`
- Validation run:
  - `npx prisma generate` passed
  - `npm run lint` passed
  - `npm test` passed
  - `npm run test:coverage` passed
  - `npm run build` passed with temporary local process-level env overrides for DB split/runtime OAuth guard values
- Remote checks:
  - `check-name` passed
  - `Quality Core (lint, test, coverage, build)` passed
  - `E2E Smoke (Playwright)` passed
  - `Container Image (build + metadata artifact)` passed
- Copilot review workflow:
  - `Copilot code review` raised 3 suggestions; all were implemented and all review threads were resolved.
- Manual preview deployment:
  - Triggered via `deploy-vercel.yml` (`action=deploy-preview`, `git_ref=feature/task-047-home-auth-entry-onboarding-ux`).
  - Preview URL: https://nexus-dash-d65zx5w61-dorian-agaesses-projects.vercel.app

---

Last Updated: 2026-02-24
Assigned To: User + Agent
