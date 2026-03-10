# Current Task: TASK-085 PostgreSQL Hardening - RLS Staged Rollout

## Task ID
TASK-085

## Status
In Progress (Phase 2 FORCE-RLS implemented and preview-validated, 2026-03-09)

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
- `FORCE ROW LEVEL SECURITY` is applied to TASK-085 target tables after preview validation.
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
- Added Phase 2 migration `prisma/migrations/20260309113000_task085_rls_phase2_force/migration.sql`:
  - `FORCE ROW LEVEL SECURITY` on `Project`, `ProjectMembership`, `Task`, `Resource`, `TaskBlockedFollowUp`, `TaskAttachment`, `ResourceAttachment`, and `GoogleCalendarCredential`.
- Local validation baseline passed on branch `feature/task-085-force-rls-preview`:
  - `npm run lint`
  - `npm test`
  - `npm run test:coverage`
  - `npm run build` with safe local env overrides for DB/mail/encryption contracts.
- Preview deploy succeeded from branch `feature/task-085-force-rls-preview`:
  - Workflow: `deploy-vercel.yml` manual preview deploy
  - Preview URL: `https://nexus-dash-q3ao1evui-dorian-agaesses-projects.vercel.app`
- Preview FORCE-RLS validation matrix passed:
  - owner can sign up, create a project, and access the project workspace
  - contributor (`editor`) can create and update tasks
  - contributor (`editor`) delete remains denied with `403 forbidden`
  - non-member project access resolves to not-found/denied behavior
  - `GoogleCalendarCredential` remains user-scoped under actor-context queries
  - `/api/health/ready` returns healthy with database check `ok`

## Current Position (Explicit)
- Phase 1 (`ENABLE RLS` + policies, no `FORCE`) is implemented and validated.
- Phase 2 (`FORCE ROW LEVEL SECURITY`) is now implemented and validated on preview runtime.
- Known blocker (white screen + `42P17` recursion) is fixed in migration `20260306193000`.
- TASK-085 is **not complete yet** because production staged rollout, production validation, and final tracking closure are still pending.

## Next Steps (Ordered Checklist)
1. Keep PR `#90` for `feature/task-085-force-rls-preview` green and ready for review/merge when rollout timing is approved.
2. Promote the validated FORCE-RLS branch to the shared staging/production sequence when ready.
3. Re-run validation after staged promotion:
   - owner happy path
   - contributor (`editor`) create/update allowed
   - contributor delete denied
   - non-member access denied
   - `GoogleCalendarCredential` remains user-scoped
   - `/api/health/ready` healthy
4. Promote to production with same staged sequence:
   - Step A: confirm Phase 1 policy-only state is healthy in production.
   - Step B: apply `FORCE ROW LEVEL SECURITY`, then validate again.
   - Step C (rollback plan, defined before rollout): if Phase 2 must be backed out while keeping RLS enabled, run `ALTER TABLE <table_name> NO FORCE ROW LEVEL SECURITY;` on each TASK-085 protected table, then re-validate that Phase 1 policy-only behavior is restored.
5. Close task tracking artifacts:
   - mark TASK-085 done in `tasks/backlog.md`
   - set `tasks/current.md` status to Completed
   - append rollout evidence/results in `journal.md`
   - update `adr/decisions.md` if final rollout decisions changed

---

Last Updated: 2026-03-09
Assigned To: User + Agent
