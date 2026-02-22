# Current Task: TASK-076 Multi-User Boundary Transition (DB + R2 + Google Calendar)

## Task ID
TASK-076

## Status
In Progress (Current) (2026-02-22)

## Objective
Enforce principal-scoped ownership boundaries end-to-end so project/task/context-card/attachment/calendar access is user-aware by default, with no singleton credentials and no cross-user data visibility.

## Why Now
- TASK-045 established auth schema primitives (`User`/`Session`), but data access and integrations are still mostly project-id scoped.
- Full route protection (TASK-046) and sharing model (TASK-058) are unsafe without ownership boundaries at service/storage/integration layers.
- Current Google Calendar integration still relies on global credential assumptions, which conflicts with the multi-user target.

## Scope
- Database authorization boundaries:
  - Introduce principal-aware service-layer reads/writes for projects, tasks, context cards, and attachments.
  - Add project ownership/membership linkage required for private-by-default access.
  - Ensure non-owner/non-member access paths return not-found/forbidden consistently.
- R2 storage boundaries:
  - Bind attachment metadata and object-key strategy to project/user ownership boundaries.
  - Enforce authorization checks before issuing signed download URLs.
  - Preserve compatibility for local storage provider in development.
- Google Calendar boundaries:
  - Replace singleton credential resolution with user-scoped OAuth credential lookup.
  - Ensure calendar CRUD uses the current principal identity, not a global fallback.
  - Define clear behavior for users without calendar linkage.
- Migration and rollout safety:
  - Include migration/backfill strategy where required.
  - Keep implementation staged and testable in preview/staging before production merge.

## Out of Scope
- Public API exposure and external API key productization.
- Full project-sharing invitation UX (TASK-058 UI flows).
- Non-essential visual polish unrelated to ownership/auth boundaries.

## Acceptance Criteria
- A user can only access their own projects/resources unless explicitly authorized by membership.
- Service-layer queries/mutations enforce principal scope for project/task/context-card/attachment operations.
- R2 signed URL issuance and object metadata/key ownership checks are principal-aware.
- Google Calendar operations are user-scoped and no longer rely on singleton credentials.
- Regression tests cover authorization boundary success/failure paths for critical APIs/services.
- `tasks/backlog.md`, ADR references, and implementation notes stay aligned with delivered scope.

## Definition of Done
- Dedicated feature branch and PR for TASK-076 only.
- CI checks pass and preview deployment is validated.
- Copilot review comments handled directly in PR threads; conversations resolved after implementation.
- Manual validation confirms no cross-user leakage for DB resources, R2 attachments, and calendar data.
- Task tracking updated (`tasks/current.md` and `tasks/backlog.md`) before handoff.

## Next Step
Create `feature/task-076-multi-user-boundaries` from `main`, implement schema/service boundary foundations first, then layer R2 and Google Calendar boundary enforcement with tests.

---

Last Updated: 2026-02-22
Assigned To: User + Agent
