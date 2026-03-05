# Current Task: TASK-085 PostgreSQL Hardening - RLS Staged Rollout

## Task ID
TASK-085

## Status
Ready (2026-03-05)

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

---

Last Updated: 2026-03-05
Assigned To: User + Agent
