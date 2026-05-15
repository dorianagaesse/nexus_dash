# Current Task: TASK-258 Production DB Session Pool Exhaustion

## Task ID
TASK-258

## Status
In progress on dedicated worktree `../nexus_dash_task258` and branch
`fix/task-258-db-session-pool-exhaustion`.

## Source
- GitHub issue: #258
- Incident: production notification email smoke succeeded, then authenticated
  navigation around account/notification/project pages intermittently returned
  server error pages.

## Objective
Prevent production authenticated request bursts from exhausting the
Supabase/Postgres session pool. Runtime traffic must use the serverless-safe
Supabase transaction pooler, while direct/admin migration traffic continues to
use the direct database endpoint.

## Evidence
- Vercel logs around the incident showed:
  `DriverAdapterError: (EMAXCONNSESSION) max clients reached in session mode -
  max clients are limited to pool_size: 15`.
- The local ignored production env snapshot showed `DATABASE_URL` pointed at a
  Supabase pooler host on port `5432`, which is session mode.
- Supabase documentation describes transaction pooling on port `6543` as the
  serverless/short-lived connection path; session pooling remains on port
  `5432`.

## Assumptions
- Vercel and GitHub production secret values must not be printed or committed.
- `DIRECT_URL` remains direct/non-pooler for migrations and admin workflows.
- RLS must remain enforced through `withActorRlsContext`.
- A production env change may be required in addition to code/docs, but the
  repository should fail fast on the known unsafe Supabase session-pooler shape.

## Acceptance Criteria
1. Production runtime validation rejects Supabase pooler `DATABASE_URL` values
   that point at session mode (`5432`) instead of transaction mode (`6543`).
2. Validation continues to allow local development database URLs and non-Supabase
   remote providers that satisfy the existing hardening rules.
3. Runtime Prisma connection-string normalization preserves existing behavior
   and remains compatible with Supabase transaction-pooler URLs.
4. Tests cover the rejected session-pooler case and the accepted
   transaction-pooler case.
5. README and runbooks clearly document the Supabase/Vercel contract:
   `DATABASE_URL` is transaction pooler on port `6543`; `DIRECT_URL` is direct
   database endpoint on port `5432`; secrets are never logged.
6. Production env validation/smoke evidence is recorded without exposing secret
   values.
7. GitHub issue #258 is referenced in the PR.

## Definition Of Done
- Work remains on `fix/task-258-db-session-pool-exhaustion`.
- `tasks/current.md`, `tasks/backlog.md`, `journal.md`, README, and the DB/env
  runbooks are updated where behavior/operations changed.
- Required validation passes:
  - `npm run lint`
  - `npm test`
  - `npm run test:coverage`
  - `npm run build`
- A ready-for-review PR is opened and linked to issue #258.
- CI and Copilot review are monitored; actionable review feedback is addressed.
- Final handoff includes PR URL, commit SHA(s), validation results, deployment
  status, and remaining operational caveats.

## Validation Plan
- Focused:
  - `npm test -- --run tests/lib/env.server.test.ts`
- Baseline:
  - `npm run lint`
  - `npm test`
  - `npm run test:coverage`
  - `npm run build`
- Production after merge/deploy:
  - Verify `/api/health/live`.
  - Verify no new `EMAXCONNSESSION` logs during a representative authenticated
    navigation/notification smoke burst.

## Validation Evidence
- Masked production env inspection confirmed the pre-fix local ignored
  production `DATABASE_URL` shape was Supabase pooler host on port `5432`
  with TLS, while `DIRECT_URL` was Supabase direct host on port `5432`.
- Updated GitHub production environment secret `DATABASE_URL` to the derived
  Supabase transaction-pooler shape on port `6543` without printing the value.
- Updated Vercel Production `DATABASE_URL` to the derived Supabase
  transaction-pooler shape on port `6543` without printing the value.
- `npm ci` passed and generated Prisma Client.
- Focused env validation passed:
  `npm test -- --run tests/lib/env.server.test.ts` with 68 tests.
- `npm run lint` passed.
- `npm run db:local:up` could not bind port `5432` because another local
  PostgreSQL service was already using it; validation used that existing
  `127.0.0.1:5432` service.
- `npm run db:migrate` passed against
  `postgresql://postgres:postgres@127.0.0.1:5432/nexusdash?schema=public`;
  no pending migrations.
- Local DB `NODE_ENV=test npm test` passed with 107 files passed, 2 skipped;
  807 tests passed, 2 skipped.
- Local DB `NODE_ENV=test npm run test:coverage` passed with 91.23%
  statements, 81.2% branches, 93.42% functions, and 91.75% lines.
- Production-guarded `npm run build` passed with local PostgreSQL, disabled
  outbound delivery mode, localhost trusted origins, local agent signing
  secret, local Google token key, and explicit `NEXTAUTH_URL`/`NEXTAUTH_SECRET`.

## Out Of Scope
- Changing notification email business logic beyond any validation evidence
  needed for the incident.
- Removing RLS or weakening project/user authorization boundaries.
- Broad dashboard performance rewrites.
- Paid infrastructure upgrades as the only fix.
