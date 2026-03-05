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

## Locked Decisions (Product/Auth Behavior)
- Role model for now is two-level in product semantics:
  - `owner`
  - `contributor`
- Current schema/enums stay unchanged during TASK-085:
  - `contributor` maps to existing DB role `editor`.
  - `viewer` remains in schema for compatibility but is not the target product role.
- Human actor permissions:
  - `owner`: full CRUD on project content + project deletion + membership/invitation management.
  - `contributor` (`editor`): create/update project content, but no deletion of project/content and no membership/invitation management.
- Agent behavior (future TASK-059) is intentionally different and does not change TASK-085 implementation:
  - `owner` agent: full CRUD.
  - `contributor` agent: full CRUD except project deletion.
- Archive semantics:
  - archive/unarchive is treated as update behavior (not hard delete).

## RLS v1 Table Scope
Apply RLS in this task to:
- `Project`
- `ProjectMembership`
- `Task`
- `Resource`
- `TaskBlockedFollowUp`
- `TaskAttachment`
- `ResourceAttachment`
- `GoogleCalendarCredential`

Out of scope for RLS in v1:
- Auth/session lifecycle tables (`User`, `Account`, `Session`, `VerificationToken`, `EmailVerificationToken`, `PasswordResetToken`)
- Non-project global operational tables (none currently)

## Permission Matrix (v1, Human Runtime)
Mapping note: `contributor` = DB enum `editor`.

| Resource | Owner | Contributor (`editor`) | Notes |
| --- | --- | --- | --- |
| Project | create/read/update/delete | read | Locked: contributor cannot mutate project metadata. Project rows may only be created with `ownerId = app.current_user_id()`. |
| ProjectMembership | read/create/update/delete | read (own membership row) | Membership/invite management owner-only in v1; contributor can read own membership row but not full project membership list. |
| Task | read/create/update/delete | read/create/update | Contributor cannot delete task rows. |
| Resource (context cards) | read/create/update/delete | read/create/update | Contributor cannot delete card rows. |
| TaskBlockedFollowUp | read/create/update/delete | read/create/update | Delete owner-only for parity with task delete policy. |
| TaskAttachment | read/create/update/delete | read/create/update | Contributor cannot delete attachments. |
| ResourceAttachment | read/create/update/delete | read/create/update | Contributor cannot delete attachments. |
| GoogleCalendarCredential | CRUD on own row only | CRUD on own row only | User-scoped, independent from project role. |

## Non-Goals
- Replacing service-layer authz checks with DB-only checks.
- Shipping project sharing/invitation UX in this task.
- Introducing new identity/token products.

## Constraints
- Rollout must be reversible without data loss.
- Existing CI/CD and migration pipeline must remain functional.
- Local development/test ergonomics should remain practical.
- No database connectivity/pooling topology change in this task (keep current pooled vs direct endpoint usage as-is).

## Actor Context Propagation Contract
- App runtime must set actor identity in DB transaction context for all RLS-protected service operations:
  - `set_config('app.user_id', <actorUserId>, true)` where `true` is transaction-local.
- All protected queries must run in the same transaction/client after setting context.
- Runtime connections (`DATABASE_URL`, through the pooler) must remain least-privilege (non-owner, no RLS bypass).
- Migration/admin connections use the direct admin path (`DIRECT_URL`), typically wired from a separate `MIGRATION_DATABASE_URL` secret in CI (for example GitHub Actions) for migration env vars.

## Proposed Rollout Plan
1. Finalize policy SQL and actor-context helpers in-repo.
2. Apply migration to staging only (`ENABLE RLS` + policies, no `FORCE RLS` yet).
3. Validate allow/deny behavior on staging (automated + targeted manual checks).
4. Keep staging soak window with logs/health checks.
5. Apply follow-up migration in staging to `FORCE ROW LEVEL SECURITY` on target tables.
6. Re-validate on staging after `FORCE RLS`.
7. Promote same sequence to production.
8. Verify production health + critical workflows.

## SQL Policy Plan (Staging First)
### Phase A: Prerequisites
- Confirm staging runtime uses a least-privilege runtime role in `DATABASE_URL` (non-owner, no RLS bypass).
- Confirm GitHub deploy workflow uses dedicated `MIGRATION_DATABASE_URL` for migrations.

### Phase B: Migration Contents (RLS v1)
Migration should:
1. Create helper function(s) to read actor context safely.
2. Enable RLS on target tables.
3. Create explicit `SELECT/INSERT/UPDATE/DELETE` policies per matrix above.
4. Do not set `FORCE ROW LEVEL SECURITY` in this first migration.

Recommended helper function shape:
```sql
create schema if not exists app;

create or replace function app.current_user_id()
returns text
language sql
stable
as $$
  select nullif(current_setting('app.user_id', true), '');
$$;
```

Example policy shape (project-scoped tables):
```sql
exists (
  select 1
  from "ProjectMembership" pm
  where pm."projectId" = <table>."projectId"
    and pm."userId" = app.current_user_id()
    and pm.role in ('owner', 'editor')
)
```

### Phase C: Service Integration
- Add a shared service helper that:
  - starts transaction,
  - sets `app.user_id`,
  - executes all protected DB reads/writes through the tx client.
- Apply helper to project-scoped services used by routes/actions.

### Phase D: Staging Validation
- Happy-path checks:
  - owner flows still work.
  - contributor (`editor`) create/update works.
- Deny-path checks:
  - contributor cannot delete project/task/card/attachments.
  - non-member cannot read/mutate project rows.
  - user cannot read/write another user's `GoogleCalendarCredential`.
- Operational checks:
  - `/api/health/ready` healthy post-migration.
  - preview deploy + critical smoke flows pass.
- Soak checks:
  - Keep staging running under normal usage for a soak window (target 24-48h).
  - Monitor for permission-denied regressions and false-negative policy blocks.

### Phase E: Staging `FORCE RLS`
- Apply second migration to enforce `FORCE ROW LEVEL SECURITY` on target tables.
- Re-run validation checklist and critical manual flows.

### Phase F: Production Promotion
- Promote same two-step sequence after staging sign-off:
  - step 1: `ENABLE RLS` + policies
  - step 2: `FORCE RLS`
- Monitor logs and error rates for authz/permission regressions.

### Rollback Plan
- Short-term rollback: disable RLS on affected tables in reverse dependency order if critical outage occurs.
- Keep rollback SQL prepared and reviewed before production rollout.
- If rollback happens, document root cause and required policy corrections before retry.

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
1. None currently blocking implementation.
