# Current Task: TASK-259 Production DB Project-Ref Guardrails

## Task ID
TASK-259

## Status
In progress on dedicated worktree `../nexus_dash_task259` and branch
`fix/task-259-production-db-project-ref-guardrails`.

## Source
- GitHub issue: #260
- Incident: after the TASK-258 pooler repair, production could authenticate but
  the signed-in user saw no projects, indicating runtime `DATABASE_URL` pointed
  at a valid but wrong Supabase database/environment.

## Objective
Prevent production from silently booting or deploying with database and
Supabase client environment variables that target different Supabase project
refs.

## Assumptions
- Agents must not read, print, or rewrite production secret values unless the
  operator explicitly authorizes a specific secret operation.
- Production DB restoration must use the intended Supabase Production project
  dashboard values, not local `.env` snapshots, preview files, staging files, or
  cached pulled Vercel env files.
- `DATABASE_URL` remains the runtime pooled URL; `DIRECT_URL` and
  `MIGRATION_DATABASE_URL` remain direct/admin migration URLs.

## Acceptance Criteria
1. Production runtime validation extracts Supabase project refs from:
   - shared pooler username (`postgres.<project-ref>`)
   - direct DB host (`db.<project-ref>.supabase.co`)
   - client URL (`https://<project-ref>.supabase.co`)
2. Production validation rejects mismatches between `DATABASE_URL` and
   `DIRECT_URL`.
3. Production validation rejects mismatches between DB URLs and `SUPABASE_URL`
   when `SUPABASE_URL` is configured.
4. Existing pooler/direct/TLS hardening from TASK-258 remains intact.
5. Focused tests cover matching refs and both mismatch cases.
6. README and runbooks document the recovery process and the no-agent-secret-
   rewrite policy.
7. GitHub issue #260 is referenced in the PR.

## Definition Of Done
- Work remains on `fix/task-259-production-db-project-ref-guardrails`.
- `tasks/current.md`, `tasks/backlog.md`, `journal.md`, README, and env/DB
  runbooks are updated.
- Required validation passes or any environment blocker is documented:
  - `npm run lint`
  - `npm test`
  - `npm run test:coverage`
  - `npm run build`
- A ready-for-review PR is opened and linked to issue #260.
- CI/Copilot feedback is monitored and addressed.
- Final handoff includes PR URL, commit SHA(s), validation results, and the
  exact operator action needed to restore production secrets.

## Validation Plan
- Focused:
  - `npm test -- --run tests/lib/env.server.test.ts`
- Baseline:
  - `npm run lint`
  - `npm test`
  - `npm run test:coverage`
  - `npm run build`

## Out Of Scope
- Changing or rotating production secrets without explicit operator approval.
- Migrating data between Supabase projects.
- Notification email business logic.
