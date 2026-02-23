# Current Task: TASK-046 Authentication Implementation Phase 2 - Auth Core and Route Protection

## Task ID
TASK-046

## Status
In Progress (Current) (2026-02-23)

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

## Inputs Needed Before Implementation
1. Signed-out page behavior:
   - `A` Redirect to `/` (Recommended)
   - `B` Redirect to a dedicated `/auth/sign-in` route
2. Protected API unauthenticated response contract:
   - `A` `401 { error: "unauthorized" }` (Recommended)
   - `B` `403 { error: "forbidden" }`
3. Phase-2 sign-in capability approach:
   - `A` Minimal backend/session core now, full sign-in UI in TASK-047 (Recommended)
   - `B` Include minimal sign-in UI in TASK-046

## Next Step
Lock the 3 input choices above, then execute implementation on a new feature branch.

---

Last Updated: 2026-02-23
Assigned To: User + Agent
