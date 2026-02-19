# Current Task: Context-Card Direct Upload Parity + Shared Upload Flow

## Task ID
TASK-075

## Status
In Progress (2026-02-19)

## Summary
Make context-card creation follow the same direct-to-R2 upload strategy as task creation, and factor shared background upload orchestration so both flows use one clean upload path.

## Acceptance Criteria
- Context-card create flow uses provider-aware upload behavior:
  - `local` provider keeps existing multipart upload.
  - `r2` provider creates card first, then uploads files in background via direct upload API endpoints.
- Context-card create file-size validation uses provider-aware limits (`DIRECT_UPLOAD_MAX...` for R2, `MAX...` for local).
- Shared background upload helper is used by both task-create and context-card-create flows (no duplicated orchestration logic).
- Background upload success/failure progress is visible to users after create-card submit.
- Existing task-create background upload behavior remains functional after refactor.

## Definition of Done
- `npm run lint` passes.
- `npm test` passes.
- `npm run test:coverage` passes.
- `npm run build` passes.
- Branch pushed and PR opened.
- PR checks pass on GitHub.
- Copilot review triaged/resolved (apply valid findings, challenge non-actionable findings).
- `tasks/backlog.md` and `tasks/current.md` remain aligned with TASK-075 progress.
- Manual preview smoke done: context-card create with attachment >4MB succeeds on R2 deployment URL.

## Required Input
No blocking input expected for implementation.

## Next Step
Implement direct-upload parity + shared helper, then validate local and deployment checks.

---

Last Updated: 2026-02-19  
Assigned To: User + Agent
