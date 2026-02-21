# Current Task: TASK-045 + TASK-076 Auth Foundation and Multi-User Boundaries

## Task IDs
TASK-045, TASK-076

## Status
In Review (2026-02-21)

## Summary
Implement the first auth persistence/data-model foundation and the multi-user boundary transition so the codebase is principal-scoped (DB, R2, Google Calendar) before route-level auth protection rollout in TASK-046.

## Acceptance Criteria
- Prisma schema includes Auth.js-compatible identity/session entities (`User`, `Account`, `Session`, `VerificationToken`) with migrations.
- Project ownership and membership primitives are implemented (`Project.ownerId`, membership relation/role model) and used by services.
- Service-layer data access is principal-scoped (owner/membership checks), replacing ID-only project/task/resource access paths.
- Attachment lifecycle enforces ownership-aware metadata and signed URL authorization checks, aligned with Cloudflare R2 boundary requirements.
- Google Calendar credential/token storage is user-scoped (no singleton global credential), and calendar service/auth callback flows bind to principal context.
- Existing project/task/context/attachment/calendar behavior remains functional for current single-user flow via controlled bootstrap fallback principal until TASK-046 auth runtime.
- `tasks/backlog.md`, `tasks/current.md`, `journal.md`, and `adr/decisions.md` are aligned with implemented changes.

## Definition of Done
- Migration deploys successfully (`prisma migrate deploy`) and code compiles/lints/tests pass.
- No remaining global Google credential data path.
- No direct project/task/resource mutation/read path bypasses principal authorization in service layer.
- PR is opened, reviewed feedback is addressed, and all review conversations are resolved before merge readiness.

## Required Input
No blocking product input required for implementation.

## Next Step
Open PR for TASK-045/TASK-076 implementation, process Copilot review feedback, then prepare TASK-046 kickoff once review is closed and checks are green.

---

Last Updated: 2026-02-21
Assigned To: User + Agent
