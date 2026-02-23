# Current Task: TASK-046 Authentication Implementation Phase 2 - Auth Core and Route Protection

## Task ID
TASK-046

## Status
In Review (PR Open) (2026-02-23)

## Objective
Implement authentication core runtime and enforce route/API protection so all protected resources require a valid signed-in user session.

## Why Now
- TASK-045 delivered auth data model primitives (`User`, `Account`, `Session`, `VerificationToken`).
- TASK-076 and TASK-080 introduced principal-scoped behavior that must now be protected by real auth guards.
- Current app still allows a manual testing workaround; production behavior must be enforced by default.

## Dependencies
- TASK-045 (Done): auth schema foundation and session persistence entities.
- TASK-076 (Done): principal-scoped service boundaries.
- TASK-080 (Done): authenticated account/settings and logout surface.

## Locked Decisions
- Server-side authorization must use server-validated session identity only.
- Protected routes must fail closed.
- Session model remains DB-backed (`Session` table), no in-memory authority.
- Google/GitHub provider rollout UX remains in later tasks (TASK-047/TASK-068).

## Scope
- Integrate auth core runtime/session resolution for signed-in web users.
- Protect app pages requiring auth (`/projects/**`, `/account/**`) with consistent signed-out behavior.
- Protect project/calendar mutation/read APIs with consistent unauthorized responses.
- Remove dependence on manual cookie injection for normal preview testing paths.
- Keep existing service-layer authorization checks as second line of defense.

## Out of Scope
- Home-page auth entry and full onboarding UX polish (TASK-047).
- Social provider rollout beyond current baseline (TASK-068).
- Sharing/invitations/role UX (TASK-058).
- Agent scoped tokens and exchange flow (TASK-059).

## Implementation Checklist
1. Define auth guard policy for page routes and API routes.
2. Implement/align session retrieval helpers with auth core runtime.
3. Apply route/page protection for `/projects/**` and `/account/**`.
4. Apply API protection contract for protected endpoints (`401` for unauthenticated).
5. Add/refresh tests for:
   - protected page access when signed out
   - protected API access when signed out
   - authenticated path success behavior
6. Run validation (`lint`, `test`, `test:coverage`, `build`) and open dedicated PR.

## Acceptance Criteria
- Signed-out users cannot access protected pages.
- Signed-out requests to protected APIs receive `401` contract responses.
- Authenticated users can access project and account settings flows without manual session scripts.
- Existing principal-scoped service checks continue to pass regression coverage.

## Definition of Done
- Dedicated branch and PR for TASK-046 only.
- CI checks pass.
- Copilot review comments handled and resolved.
- Manual preview deployment validates protected/authorized behavior.
- Task tracking updated in `tasks/current.md`, `tasks/backlog.md`, and `journal.md`.

## Decided Inputs
1. Signed-out page behavior: `A` redirect to `/`.
2. Protected API unauthenticated response contract: `A` return `401 { error: "unauthorized" }`.
3. Phase-2 sign-in capability approach: `A` implement backend/session guard core now, keep sign-in/up UI for TASK-047.

## Execution Outcome (Current PR)
- Branch: `feature/task-046-auth-core-route-protection`
- PR: https://github.com/dorianagaesse/nexus_dash/pull/52
- Implemented shared auth guards:
  - `requireSessionUserIdFromServer` for page/layout protection.
  - `requireAuthenticatedApiUser` for API `401` contract enforcement.
- Protected route groups:
  - `app/projects/layout.tsx`
  - `app/account/layout.tsx`
- Applied API auth guard to protected calendar/project endpoints under `app/api/calendar/**` and `app/api/projects/**`.
- Added regression tests:
  - `tests/lib/api-guard.test.ts`
  - `tests/lib/server-guard.test.ts`
- Validation run:
  - `npm run lint` passed
  - `npm test` passed
  - `npm run test:coverage` passed
  - `npm run build` passed with temporary local process-level env overrides (local `.env.production.local` contains placeholder-only values)

## Next Step
Complete CI + review resolution, then trigger manual preview deploy and confirm signed-out guard behavior.

---

Last Updated: 2026-02-23
Assigned To: User + Agent
