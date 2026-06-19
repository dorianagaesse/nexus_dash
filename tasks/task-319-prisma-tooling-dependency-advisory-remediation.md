# TASK-319 Prisma Tooling Dependency Advisory Remediation

## Status

Pending. Near-term security maintenance; does not require a feature freeze.

## Source

TASK-088 architecture audit validation.

## Problem

`npm run security:audit` currently fails with high-severity Hono advisories
through this dependency path:

`@prisma/client -> prisma -> @prisma/dev -> @hono/node-server/hono`

The Hono and Prisma development packages are marked `devOptional` in the
lockfile, and NexusDash does not import Hono or expose the Prisma development
server in its deployed request runtime. This lowers direct production
exploitability, but the repository's declared production audit is red and the
previous green baseline from TASK-274 has regressed.

## Objective

Restore a green dependency-security audit with a supported, non-breaking
dependency resolution and document the actual runtime exposure.

## Scope

- Confirm which current advisories affect the installed Hono version.
- Confirm whether `npm audit --omit=dev` is including the chain because of
  Prisma's optional peer relationship with `@prisma/client`.
- Prefer, in order:
  1. a supported Prisma patch/minor release that removes or patches the chain;
  2. a compatible patched Hono/`@hono/node-server` override;
  3. a documented temporary exception only if no safe patched resolution is
     available.
- Remove stale overrides that are no longer needed.
- Validate Prisma generate, migrations, build, tests, and local developer CLI
  behavior after the dependency change.
- Record why the issue is or is not reachable in the deployed application.

## Acceptance Criteria

1. `npm run security:audit` exits successfully, or an explicit time-bounded
   exception is approved with upstream references and a removal condition.
2. No major Prisma downgrade is introduced as an audit workaround.
3. `npm ci` and `prisma generate` succeed from a clean install.
4. Database migration commands remain operational.
5. Lint, unit/API tests, coverage, build, and E2E smoke tests pass.
6. `package.json` overrides contain only still-required pins.
7. Dependency-security documentation records the advisory path and runtime
   exposure decision.

## Non-Goals

- Replacing Prisma.
- Treating a dev-tooling advisory as proof of a deployed NexusDash exploit.
- Running `npm audit fix --force` without reviewing breaking dependency changes.

## Dependencies

- TASK-061: Dependency security baseline.
- TASK-274: Prior production audit restoration.
- TASK-088: Architecture and security audit.

## Definition Of Done

- [ ] Advisory path and reachability are documented.
- [ ] Supported dependency or override remediation is applied.
- [ ] Production security audit is green or a bounded exception is recorded.
- [ ] Full repository validation passes.
