# Current Task: TASK-319 Prisma Tooling Dependency Advisory Remediation

## Task ID
TASK-319

## Status
Implementation and local non-database validation complete. PostgreSQL-backed
migration/E2E validation and PR review are pending in GitHub Actions.

## Source
- TASK-088 architecture and security audit.
- `npm run security:audit` currently reports high-severity Hono advisories
  through Prisma's development-tooling dependency chain.

## Objective
Restore a green dependency-security audit using a supported, non-breaking
Prisma or transitive dependency resolution, while documenting why the current
advisory is or is not reachable in the deployed application.

## Scope
- Trace the exact `prisma -> @prisma/dev -> @hono/node-server` and `hono`
  dependency relationship.
- Prefer a supported Prisma patch/minor update or compatible patched override.
- Avoid `npm audit fix --force` and major downgrades.
- Remove stale dependency overrides where safe.
- Revalidate Prisma generation, migrations, tests, build, E2E, and the
  production security audit.
- Record deployed-runtime reachability and any bounded exception if upstream
  remediation is unavailable.

## Acceptance Criteria
1. `npm run security:audit` exits successfully, or a time-bounded documented
   exception has an explicit upstream/removal condition.
2. No breaking Prisma downgrade is used as an audit workaround.
3. Clean install and Prisma generation succeed.
4. Database migration commands remain operational.
5. Lint, tests, coverage, build, and E2E pass.
6. Remaining overrides are justified and documented.

## Definition Of Done
- [ ] Advisory path and runtime reachability are documented.
- [ ] Supported dependency remediation is applied.
- [ ] Production security audit is green or a bounded exception is recorded.
- [ ] Full repository validation passes.
- [ ] A ready-for-review PR is open and review feedback is resolved.
