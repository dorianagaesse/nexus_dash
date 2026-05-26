# Current Task: TASK-266 Production pg Query Deprecation Warning Cleanup

## Task ID
TASK-266

## Status
Active

## Source
- Backlog execution queue entry for TASK-266.
- Production smoke evidence captured in `journal.md` on 2026-05-16 after
  notification digest validation.

## Objective
Remove the recurring production `pg` warning:

```text
Calling client.query() when the client is already executing a query is deprecated and will be removed in pg@9.0
```

The fix must preserve the existing Prisma/PostgreSQL runtime contract, service
authorization boundaries, and transaction-scoped RLS behavior.

## Current Baseline
- Prisma 7 uses `@prisma/adapter-pg` through `lib/prisma.ts`.
- Runtime database traffic is expected to use the Supabase transaction pooler in
  production and preview.
- Project-scoped mutations run in service-layer RLS transactions via
  `withActorRlsContext()`, which sets `app.user_id` with `set_config(..., true)`
  before project data access.
- Production logs showed the deprecation warning on both task creation and
  notification-email dispatch paths, indicating overlapping queries are reaching
  a single `pg` client somewhere in the Prisma/adapter/service flow.

## Scope
- Identify whether the warning comes from the Prisma pg adapter construction or
  from service code issuing parallel queries on one transaction client.
- Fix the root cause without weakening RLS, transaction, or authorization
  guarantees.
- Add regression coverage around the changed behavior where practical without
  making the default unit suite depend on external production services.
- Update task tracking docs and journal evidence.
- Open a ready PR, monitor checks and Copilot review, and address actionable
  feedback.
- Deploy a Vercel preview from
  `feature/task-266-pg-query-deprecation-cleanup` and validate the task creation
  / notification dispatch path against that preview.

## Acceptance Criteria
1. Task creation no longer emits the `client.query()` overlap deprecation
   warning during preview smoke validation.
2. Notification-email dispatch no longer emits the same warning during preview
   smoke validation.
3. RLS context remains transaction-scoped and actor-bound for project data
   reads/writes.
4. The production/preview database connection contract remains aligned with the
   existing Supabase transaction-pooler guardrails.
5. Local validation passes for focused coverage, lint, full unit/API tests,
   coverage, and build, or any environment blocker is recorded in `journal.md`.
6. The PR remains unmerged for maintainer review.

## Definition Of Done
- Root cause is documented in the final PR description and `journal.md`.
- Code and tests are committed on the TASK-266 branch.
- Branch is pushed and a ready PR is open.
- Automated checks and initial Copilot review are handled.
- A branch-scoped preview deploy completes using explicit `git_ref` evidence.
- Preview smoke evidence records the preview URL and the absence of the pg
  warning on the exercised task creation and notification dispatch paths.

## Validation Plan
- `git diff --check`
- Focused tests for the changed Prisma/service behavior.
- `npm run lint`
- `npm test`
- `npm run test:coverage`
- `npm run build`
- Branch-scoped preview workflow:
  `gh workflow run deploy-vercel.yml -f action=deploy-preview -f git_ref=feature/task-266-pg-query-deprecation-cleanup`
- Preview smoke:
  - `PLAYWRIGHT_BASE_URL=<preview-url> npx playwright test tests/e2e/smoke-project-task-calendar.spec.ts`
  - protected notification-email dispatch request against the same preview when
    runtime secrets allow it
  - runtime log inspection for the `client.query()` warning after smoke traffic

## Out Of Scope
- Replacing Prisma or PostgreSQL.
- Changing the notification email scheduler cadence.
- Weakening RLS policies or bypassing project authorization.
- Broad notification-email redesign beyond what is needed to remove the pg
  query overlap warning.
