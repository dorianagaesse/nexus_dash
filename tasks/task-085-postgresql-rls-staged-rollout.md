# TASK-085 PostgreSQL Hardening - RLS Staged Rollout

## Goal
Enforce tenant isolation at the database layer by enabling PostgreSQL Row-Level Security (RLS) on user/project-scoped tables, with staged validation in staging before production rollout.

## Context
- Service-layer authorization is already implemented (`TASK-076`, `TASK-046`).
- Current protection is app-layer only; RLS adds defense in depth if query paths regress.
- This task is operationally sensitive and must be rollout-safe.

## Scope
- Define target table list for RLS (at minimum user/project-scoped domain tables).
- Define policy model for read/write/update/delete per application principal.
- Implement migration(s) that:
  - enable RLS on target tables
  - create explicit allow policies
  - keep rollback path clear
- Update DB access/runtime strategy so policy context can be resolved correctly.
- Validate core auth/project/task/context/attachment/calendar flows in staging.
- Promote to production only after staging evidence is complete.
- Document runbook-grade rollout, verification, and rollback steps.

## Non-Goals
- Replacing service-layer authz checks with DB-only checks.
- Shipping project sharing/invitation UX in this task.
- Introducing new identity/token products.

## Constraints
- Rollout must be reversible without data loss.
- Existing CI/CD and migration pipeline must remain functional.
- Local development/test ergonomics should remain practical.

## Proposed Rollout Plan
1. Design pass:
   - Confirm principal propagation mechanism from app to DB session.
   - Confirm exact policy expressions and default-deny behavior.
2. Staging migration:
   - Apply RLS migration to staging only.
   - Run validation suite + targeted manual smoke flows.
   - Capture deny-path evidence and false-positive checks.
3. Production migration:
   - Apply same migration after staging sign-off.
   - Verify readiness and critical user flows.
4. Post-rollout:
   - Monitor logs/alerts.
   - Keep rollback SQL and operator steps available.

## Acceptance Criteria
- Target tables have RLS enabled with explicit policies.
- Cross-user/project unauthorized access is denied by DB policies.
- Core authorized workflows remain functional in staging and production.
- Migration and rollback procedures are documented and tested.
- Validation baseline passes (`lint`, `test`, `test:coverage`, `build`), with additional integration checks as needed.

## Validation Checklist
- Automated:
  - `npm run lint`
  - `npm test`
  - `npm run test:coverage`
  - `npm run build`
- Environment/integration:
  - Staging migration apply succeeds.
  - `/api/health/ready` remains healthy post-migration.
  - Core authenticated flows pass in staging.
  - Unauthorized access attempts are denied by DB policy.

## Open Questions (For Discussion)
1. Which exact tables are in v1 RLS scope vs deferred?
2. How will app principal be bound to DB session context safely?
3. Should any operational/admin role bypass be allowed, and how constrained?
4. What is the exact rollback trigger threshold in staging and in production?
5. Do we need a temporary feature flag for staged activation sequencing?

