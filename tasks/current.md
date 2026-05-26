# Current Task: TASK-274 Next.js Dependency Security Update

## Task ID
TASK-274

## Status
Queued - next execution candidate

## Source
- `tasks/backlog.md` execution queue, refreshed on 2026-05-26 after TASK-269
  and TASK-266 were merged.
- TASK-269 workflow audit finding: the production dependency audit currently
  fails because the installed `next` range includes a high-severity advisory.

## Objective
Restore a green production dependency audit by updating Next.js and any tightly
coupled framework packages in a focused dependency PR, without mixing in product
behavior changes.

## Current Baseline
- TASK-269 and TASK-266 are completed and merged.
- The execution queue now starts with TASK-274, followed by TASK-133,
  TASK-270, TASK-118, and TASK-129.
- TASK-275 has been added to Deferred as a measurement-first performance
  investigation/report for slow creation, update, and refresh flows.

## Scope
- Confirm the current advisory and the minimum safe Next.js version from the
  local audit output and package metadata.
- Update Next.js and any required peer/tightly coupled framework dependencies.
- Regenerate lockfile state intentionally.
- Run the repository validation baseline appropriate for a framework update.
- Keep unrelated backlog, UI, and runtime behavior changes out of the dependency
  PR.

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
