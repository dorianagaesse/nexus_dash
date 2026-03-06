# Current Task: TASK-085 PostgreSQL Hardening - RLS Staged Rollout

## Task ID
TASK-085

## Status
In Progress (Phase 1 implemented and preview-validated, 2026-03-06)

## Objective
Enable PostgreSQL Row-Level Security on user/project-scoped tables with a safe staged rollout (staging first, then production), preserving current application behavior while adding DB-level tenant isolation.

## Why Now
- ISSUE-081 is complete and merged.
- TASK-085 is the top item in the current execution queue in `tasks/backlog.md`.
- Service-layer authorization is already in place; DB-level isolation is the next hardening layer.

## Scope
- Define RLS policy strategy for user/project-scoped tables.
- Implement SQL migration(s) for RLS enablement and policies.
- Wire runtime DB session context required by policies (if needed).
- Validate behavior in staging with rollback-safe steps.
- Promote to production after staging verification.
- Add/extend runbook documentation for rollout, verification, and rollback.
- Add regression coverage for authorized vs unauthorized access paths where feasible.

## Out of Scope
- New collaboration/invitation product features.
- Agent/API token model changes.
- Broad auth UX changes.

## Acceptance Criteria
- RLS is enabled on target tables with explicit allow policies.
- Authorized application flows continue to work in staging.
- Unauthorized cross-user/project data access is denied at the DB layer.
- Rollout and rollback procedures are documented and reproducible.
- Validation baseline is green for this branch.

## Definition of Done
- Branch + PR opened for TASK-085.
- CI checks green.
- Staging verification completed before production rollout.
- Tracking files updated (`tasks/current.md`, `tasks/backlog.md`, `journal.md`, `adr/decisions.md` as applicable).

## Implementation Progress
- Added migration `prisma/migrations/20260305173000_task085_rls_phase1_enable_policies/migration.sql`:
  - `ENABLE ROW LEVEL SECURITY` on TASK-085 v1 tables.
  - Added explicit RLS policies for owner/contributor (`editor`) matrix.
  - Added helper function `app.current_user_id()` for policy evaluation.
- Added transaction-scoped actor propagation helper `lib/services/rls-context.ts` using:
  - `SELECT set_config('app.user_id', <actor>, true)` inside transaction scope.
- Wired project-scoped and user-scoped services to execute protected queries in actor-context transactions:
  - `project-service`, `project-task-service`, `context-card-service`, `project-attachment-service`, `project-access-service`, `google-calendar-credential-service`.
- Locked service behavior to match agreed permissions:
  - contributor cannot delete tasks/context cards/attachments.
- Added recursion fix migration to avoid policy loop between `Project` and `ProjectMembership`:
  - `prisma/migrations/20260306193000_task085_rls_project_membership_recursion_fix/migration.sql`
- Preview deploy validation now passes on branch `feature/task-085-rls-phase1` after recursion fix.

## Current Position (Explicit)
- Phase 1 (`ENABLE RLS` + policies, no `FORCE`) is implemented and validated on preview/staging runtime.
- Known blocker (white screen + `42P17` recursion) is fixed in branch with migration `20260306193000`.
- Task is **not complete yet** because FORCE-RLS phase and production staged rollout are still pending.

## Next Steps (Ordered Checklist)
1. Merge PR for `feature/task-085-rls-phase1` once CI is green.
2. Keep staging in soak window and monitor logs for permission regressions.
3. Apply Phase 2 migration on staging to `FORCE ROW LEVEL SECURITY` on TASK-085 target tables.
4. Re-run staging validation:
   - owner happy path
   - contributor (`editor`) create/update allowed
   - contributor delete denied
   - non-member access denied
   - `GoogleCalendarCredential` remains user-scoped
   - `/api/health/ready` healthy
5. Promote to production with same staged sequence:
   - Step A: RLS policies enabled (no force), validate.
   - Step B: `FORCE ROW LEVEL SECURITY`, validate again.
6. Close task tracking artifacts:
   - mark TASK-085 done in `tasks/backlog.md`
   - set `tasks/current.md` status to Completed
   - append rollout evidence/results in `journal.md`
   - update `adr/decisions.md` if final rollout decisions changed

---

Last Updated: 2026-03-06
Assigned To: User + Agent
