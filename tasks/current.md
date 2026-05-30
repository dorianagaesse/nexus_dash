# Current Task: TASK-274 Next.js Dependency Security Update

## Task ID
TASK-274

## Status
Implemented - PR validation in progress

## Source
- `tasks/backlog.md` execution queue, refreshed on 2026-05-26 after TASK-269
  and TASK-266 were merged.
- TASK-269 workflow audit finding: the production dependency audit previously
  failed because the installed `next` range included a high-severity advisory.
  On 2026-05-30, the high-severity advisory had cleared from the current npm
  audit feed, but moderate production advisories remained through Next.js'
  bundled PostCSS and Prisma's dev-server Hono dependencies.

## Objective
Restore a green production dependency audit by updating or overriding Next.js
and any tightly coupled framework packages in a focused dependency PR, without
mixing in product behavior changes.

## Current Baseline
- TASK-269 and TASK-266 are completed and merged.
- The execution queue now starts with TASK-274, followed by TASK-133,
  TASK-270, TASK-118, and TASK-129.
- TASK-275 has been added to Deferred as a measurement-first performance
  investigation/report for slow creation, update, and refresh flows.
- `next@16.2.6`, `eslint-config-next@16.2.6`, and `prisma@7.8.0` are already
  the latest stable versions available to npm on 2026-05-30.
- The implemented fix uses targeted npm overrides for `next`'s PostCSS
  dependency and Prisma's `@prisma/dev` Hono dependencies, then regenerates the
  lockfile from the updated manifest.

## Scope
- Confirm the current advisory and the minimum safe Next.js version from the
  local audit output and package metadata.
- Update or override Next.js and any required peer/tightly coupled framework
  dependencies.
- Regenerate lockfile state intentionally.
- Run the repository validation baseline appropriate for a framework update.
- Keep unrelated backlog, UI, and runtime behavior changes out of the dependency
  PR.

## Validation Notes
- `npm audit --omit=dev --audit-level=high` passes.
- `npm audit --omit=dev --audit-level=moderate` passes.
- `git diff --check`, `npm run lint`, explicit-local-DB `npm test`,
  explicit-local-DB `npm run test:coverage`, and placeholder-production-env
  `npm run build` pass locally.
- `npm run test:e2e` builds successfully but cannot complete Playwright tests
  because no PostgreSQL server is reachable at `127.0.0.1:5432` and Docker
  Desktop is unavailable on this machine. Chromium was installed with
  `npx playwright install chromium`, so the remaining blocker is database
  availability rather than browser setup.

## Acceptance Criteria
1. `npm audit --omit=dev --audit-level=high` passes or any remaining advisory is
   documented as unrelated/unavoidable.
2. Next.js and coupled framework packages are updated to a safe compatible
   version.
3. Lint, unit/API tests, coverage, build, and E2E smoke are green locally or any
   environment blocker is recorded.
4. The dependency PR clearly documents risk, validation, and rollback path.

## Definition Of Done
- Package and lockfile changes are committed on a dedicated TASK-274 branch.
- Validation evidence is recorded in `journal.md`.
- The PR is opened ready for review and automated feedback is handled.

## Out Of Scope
- Product feature changes.
- Broad UI polish.
- Performance remediation beyond dependency-update fallout.
