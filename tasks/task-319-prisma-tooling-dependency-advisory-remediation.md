# TASK-319 Prisma Tooling Dependency Advisory Remediation

## Status

Implemented on `fix/task-319-prisma-tooling-advisory`; validation and PR review
evidence are recorded below.

## Source

TASK-088 architecture audit validation.

## Problem

`npm run security:audit` currently fails with high-severity Hono advisories
through this dependency path:

`@prisma/client -> prisma -> @prisma/dev`, with `@prisma/dev` depending on
`@hono/node-server` and `hono` as separate packages

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

- [x] Advisory path and reachability are documented.
- [x] Supported dependency or override remediation is applied.
- [x] Production security audit is green or a bounded exception is recorded.
- [x] Full repository validation passes.

## Investigation And Decision

On June 19, 2026, Prisma 7.8.0 was still the latest stable Prisma release. Its
CLI dependency remained pinned to `@prisma/dev` 0.24.3, which depends on
`@hono/node-server` 1.19.11 and `hono ^4.12.8`.

The production audit included this otherwise development-oriented path because:

- `@prisma/client` is a production dependency;
- `@prisma/client` declares `prisma` as an optional peer dependency;
- npm therefore records the Prisma CLI subtree as `devOptional`, and
  `npm audit --omit=dev` still evaluates it.

The installed Hono 4.12.23 release was covered by five advisories reported by
npm audit:

- `GHSA-wwfh-h76j-fc44`
- `GHSA-j6c9-x7qj-28xf`
- `GHSA-88fw-hqm2-52qc`
- `GHSA-rv63-4mwf-qqc2`
- `GHSA-wgpf-jwqj-8h8p`

The existing `@hono/node-server` 1.19.14 override remains required because
removing it restores the `GHSA-92pp-h63x-v22m` finding from Prisma's pinned
1.19.11 dependency.

The selected remediation updates only the Hono override from 4.12.23 to
4.12.26. A broader override to `@prisma/dev` 0.24.14 was rejected because it
would replace Prisma's pinned internal package and update several unrelated
local-tooling dependencies when a one-package Hono patch is sufficient. The
current 0.24.3 subtree already includes an `@prisma/streams-local` package with
a declared Node 22 engine, so that engine declaration is not a new constraint
introduced by 0.24.14 and was not the deciding factor.

The same clean lockfile refresh also advanced already-compatible
development-tooling transitives to `js-yaml` 4.2.0, `undici` 7.28.0, and Vite
8.0.16. Those changes removed three unrelated advisories surfaced by the clean
install without changing direct dependency ranges.

## Runtime Exposure

The advisory path is confined to Prisma CLI development tooling. No NexusDash
application, service, route, migration, or test source imports `hono` or
`@hono/node-server`, and the Prisma development server is not started by the
deployed application. Direct deployed request-runtime reachability is therefore
not demonstrated. The remediation is still required because CI and local
tooling install the affected packages and the repository's production audit
must remain green.

## Validation Evidence

- `npm run security:audit`: passed with zero vulnerabilities.
- `npm audit --omit=dev --audit-level=moderate`: passed with zero
  vulnerabilities.
- `npm run security:audit:full`: passed with zero vulnerabilities.
- `npm ci`: passed; postinstall generated Prisma Client 7.8.0.
- `npx prisma generate` and `npx prisma validate`: passed.
- `npx prisma --version`: confirmed Prisma CLI and Client 7.8.0.
- `npm run release:check -- --base origin/main --branch
  fix/task-319-prisma-tooling-advisory`: passed for `v0.19.2`.
- `npm run lint`: passed.
- `npm test`: passed (122 files passed, 2 skipped; 906 tests passed, 2
  skipped).
- `npm run test:coverage`: passed with 91.37% statements, 81.33% branches,
  92.2% functions, and 91.88% lines.
- Preview-style `npm run build`: passed.
- GitHub Quality Gates run `27850400507`: passed Quality Core, PostgreSQL-backed
  Prisma migration deployment, all nine Playwright E2E specs, and the container
  image build.
- Local `npm run db:migrate` and `npm run test:e2e` could not use the isolated
  PostgreSQL fixture because Docker Desktop's Linux engine returned HTTP 500
  and ports 5432/5433 were unavailable. The E2E command completed its build,
  then all nine specs failed during database setup with `Can't reach database
  server at 127.0.0.1:5432`. GitHub Actions supplied the required
  PostgreSQL-backed migration and E2E confirmation.
