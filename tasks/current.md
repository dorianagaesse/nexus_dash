# Current Task: TASK-131 Local Validation Baseline Repair

## Task ID
TASK-131

## Status
Local validation baseline green on `feature/task-131-local-validation-baseline`.

## Objective
Restore a reproducible local validation path for NexusDash so a contributor can
start from a clean checkout and run the full baseline through install, Prisma
client generation, migrations, unit/API tests, coverage, production build, and
Playwright smoke tests without relying on undocumented machine state.

## Current Scope
- Align the repository toolchain contract around a supported Node/npm baseline
  for the current Next.js, Prisma, Vitest, jsdom, and Playwright dependencies.
- Make local database bootstrap explicit and reproducible, preferably through a
  Docker Compose Postgres service that matches the CI E2E database contract.
- Ensure Prisma generate/migrate commands use the intended local connection
  strings and do not require production-only secrets.
- Define a single documented local validation workflow that covers:
  - clean dependency install with `npm ci`
  - `npx prisma generate`
  - `npm run db:migrate`
  - `npm run lint`
  - `npm test`
  - `npm run test:coverage`
  - `npm run build`
  - `npm run test:e2e`
- Keep the app container path reproducible without assuming an external
  database URL is already present in the developer shell.
- Record validation evidence and any remaining local environment constraints in
  `journal.md`.

## Initial Findings
- The current shell is on Node `v20.17.0`; `npm ci` fails at Prisma preinstall
  because the current dependency tree requires Node `20.19+`, `22.13+`, or
  `24+`.
- `docker compose config` fails without shell-provided `DATABASE_URL` and
  `DIRECT_URL`, and the current compose file has no Postgres service.
- CI E2E already defines the desired local-style Postgres contract:
  `postgres:16-alpine` with
  `postgresql://postgres:postgres@127.0.0.1:5432/nexusdash?schema=public`.
- `npm run test:e2e` builds and launches `next start`, while Playwright helper
  code seeds test users directly through Prisma. That means E2E needs a
  migrated database and generated Prisma client before the browser run begins.

## Acceptance Criteria
1. A clean checkout exposes an explicit supported Node version contract through
   repo-owned configuration or documentation.
2. `npm ci` succeeds on the supported local Node baseline.
3. A developer can start a local PostgreSQL database for validation using a
   documented repo-owned command or compose profile.
4. Local `DATABASE_URL` and `DIRECT_URL` values for validation are documented
   and line up with the local database service.
5. `npx prisma generate` and `npm run db:migrate` succeed against the documented
   local validation database.
6. `npm run lint`, `npm test`, `npm run test:coverage`, and `npm run build`
   succeed after the documented bootstrap.
7. `npm run test:e2e` succeeds locally against the documented local database and
   app startup path.
8. Docker Compose can render its config and start the app/database baseline
   without requiring undocumented external database variables.
9. README or runbook documentation contains one copy-pasteable local validation
   sequence and describes cleanup/reset behavior for the local database.
10. `journal.md` records the commands run, observed failures, fixes, and final
    validation evidence.

## Definition Of Done
- TASK-131 has a dedicated worktree and branch.
- Toolchain, database, Docker/Compose, and test documentation changes are
  committed in the TASK-131 branch.
- The full local validation baseline has been run, or any remaining blocker is
  documented with exact command output and next action.
- `tasks/current.md`, `journal.md`, and any touched runbooks/README sections
  agree on the final local validation workflow.
- A PR is opened for TASK-131 once the branch is reviewable.

## Out Of Scope
- Reworking production deploy secrets or Vercel preview workflows beyond keeping
  local validation documentation consistent with existing runbooks.
- Expanding Playwright coverage beyond the existing smoke suite unless required
  to make the current suite reliable.

## Validation Evidence
- `npm run validate:local` passed on 2026-05-04 with Node `v24.15.0` and Docker
  Desktop running.
- The validation run started Docker Compose Postgres, ran `npm ci`, generated
  Prisma Client, applied migrations, ran lint, unit/API tests, coverage,
  production build, installed Playwright Chromium, and passed all Playwright E2E
  tests.
- `APP_PORT=3131 docker compose up --build -d app` started the app container,
  and `/api/health/live` plus `/api/health/ready` both returned HTTP 200.
