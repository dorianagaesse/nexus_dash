# TASK-061 Dependency Security Baseline - Vulnerability Remediation and Scan Cadence Definition

## Task ID
TASK-061

## Status
Implementation complete locally; PR/review follow-through in progress

## Objective
Resolve known high-severity dependency vulnerabilities where safe and practical,
reduce transitive security exposure in the current toolchain, and define a
repeatable automated scan cadence so dependency risk is monitored continuously
rather than only during manual review.

## Why This Task Matters
- NexusDash now handles authenticated sessions, verified-email flows, project
  collaboration, object storage, and project-scoped agent credentials.
- Dependency vulnerabilities can undermine that security baseline even when the
  application code itself is careful.
- A one-time cleanup is not sufficient; the repo needs a recurring process to
  surface new advisories before they quietly accumulate.

## Current Baseline Confirmed In Repo
- CI already enforces lint, unit/API tests, E2E smoke, build, and container
  image reproducibility through GitHub Actions.
- The project currently uses Next.js 14, React 18, Prisma 5, Vitest 4,
  Playwright 1.58, Tailwind 3, and AWS SDK v3 packages.
- There is no dedicated scheduled dependency-security workflow and no
  repository-level Dependabot configuration checked into `.github/`.
- Dependency vulnerability visibility is currently ad hoc (`npm audit`) rather
  than codified in repository automation.

## Working Assumptions For This Task
- Production-impacting critical/high vulnerabilities should be prioritized over
  dev-only issues, but high-severity dev-tooling risks should still be reduced
  when safe to do so.
- Safe patch/minor updates and transitive overrides are preferable to
  framework-major migrations inside this task unless a major upgrade is clearly
  necessary to close the security exposure and can be validated responsibly.
- If a vulnerability cannot be responsibly resolved without a broader upgrade
  project, document it as an explicit residual risk with a concrete follow-up.
- The scan cadence should be lightweight enough to run continuously without
  training the team to ignore noisy failures.

## Scope
- Run a current dependency vulnerability audit and map findings to real
  dependency paths.
- Upgrade direct dependencies where that closes known security findings safely.
- Add targeted `overrides` or lockfile refreshes for vulnerable transitive
  packages when compatible.
- Add repository automation for recurring dependency-security checks and update
  docs describing the policy/cadence.
- Record residual risk and deferred follow-up items discovered during the pass.

## Out of Scope
- Unrelated framework modernization beyond what security remediation requires.
- Large product changes unrelated to dependency security.
- Full application security assessment beyond dependency risk.
- OS-level runner hardening or infrastructure security controls outside repo
  workflow scope.

## Initial Audit Focus
1. Production dependency vulnerabilities with `critical` or `high` severity
2. Direct dependencies with known advisories and reasonable upgrade paths
3. Vulnerable transitive packages in build/test tooling that can be fixed via
   safe lockfile refresh or overrides
4. Missing automation for recurring dependency/advisory monitoring
5. Any residual vulnerabilities that require major framework migration

## Acceptance Criteria
- Actionable critical/high vulnerabilities are remediated or explicitly
  documented as deferred with rationale.
- Dependency changes preserve current runtime and test behavior.
- A recurring scan cadence is implemented in-repo and documented.
- Validation passes locally and in PR checks.
- The final report clearly distinguishes:
  - remediated findings
  - residual/deferred findings
- recommended next actions

## Implemented In This Pass
- Audited the dependency graph with `npm audit --json` and confirmed the
  starting baseline included 12 vulnerabilities (2 critical, 8 high, 2
  moderate), including production-impacting findings in Next.js and the AWS SDK
  XML parser chain.
- Upgraded direct dependencies to patched lines, including `next`,
  `eslint-config-next`, `@aws-sdk/client-s3`,
  `@aws-sdk/s3-request-presigner`, `vitest`,
  `@vitest/coverage-v8`, `@playwright/test`, and `sanitize-html`.
- Added explicit `overrides` in `package.json` for patched transitive versions
  of `ajv`, `flatted`, `brace-expansion`, `minimatch`, and `picomatch`, then
  refreshed `package-lock.json`.
- Added dedicated dependency-security scripts:
  - `npm run security:audit`
  - `npm run security:audit:full`
- Added `.github/dependabot.yml` with weekly npm and GitHub Actions update
  cadence.
- Added `.github/workflows/dependency-security.yml` with a scheduled and
  on-demand audit workflow that fails on high/critical production findings and
  uploads audit artifacts.
- Updated `README.md` to document the new dependency-security cadence and
  operator workflow.
- Carried the security-required Next.js 15 migration through the repo,
  including async request API compatibility updates plus the Vitest config move
  to `vitest.config.mts` for ESM compatibility.

## Proposed Execution Plan
1. Audit the current dependency graph and vulnerability surface.
2. Categorize findings into safe-now remediations vs broader-upgrade follow-up.
3. Implement direct upgrades and compatible transitive fixes.
4. Add recurring scan automation and document the maintenance cadence.
5. Validate the repo, open the PR, and address Copilot review feedback.
6. Deliver a written security report with residual risk and follow-up actions.

## Likely File Ownership / Touch Points
- `package.json`
- `package-lock.json`
- `.github/workflows/**`
- `.github/dependabot.yml`
- `README.md`
- `tasks/current.md`
- `journal.md`

## Validation Plan
- `npm audit --json`
- `npm run lint`
- `npm test`
- `npm run test:coverage`
- `npm run build`
- `npm run test:e2e` if dependency changes touch browser/runtime behavior enough
  to justify the added confidence

## Validation Status
- Passed on 2026-04-04:
  - `npm audit --json`
  - `npm run security:audit`
  - `npm run lint`
  - `npm test`
  - `npm run test:coverage`
  - `$env:DATABASE_URL='postgresql://user:pass@localhost:5432/postgres'; $env:DIRECT_URL='postgresql://user:pass@127.0.0.1:5433/postgres'; $env:VERCEL_ENV='preview'; $env:RESEND_API_KEY='test-resend-key'; $env:GOOGLE_TOKEN_ENCRYPTION_KEY='0123456789abcdef0123456789abcdef'; $env:AGENT_TOKEN_SIGNING_SECRET='0123456789abcdef0123456789abcdef'; npm run build`
- Attempted but environment-blocked on 2026-04-04:
  - `npx playwright install chromium`
  - `$env:DATABASE_URL='postgresql://user:pass@127.0.0.1:5432/postgres'; $env:DIRECT_URL='postgresql://user:pass@127.0.0.1:5433/postgres'; $env:VERCEL_ENV='preview'; $env:RESEND_API_KEY='test-resend-key'; $env:GOOGLE_TOKEN_ENCRYPTION_KEY='0123456789abcdef0123456789abcdef'; $env:AGENT_TOKEN_SIGNING_SECRET='0123456789abcdef0123456789abcdef'; npm run test:e2e`
  - Blocker: Prisma could not reach PostgreSQL at `127.0.0.1:5432` in this local environment.

## Residual Risk / Follow-Up Notes
- No actionable `npm audit` vulnerabilities remained after the remediation
  pass.
- The largest risk introduced by the security remediation was framework
  compatibility churn from the required Next.js upgrade; that risk was reduced
  through lint, tests, coverage, and production-build validation.
- Full local Playwright confirmation still depends on restoring the local
  PostgreSQL fixture service.
- The existing GitHub Actions/runtime maintenance warning track remains a
  separate CI hygiene follow-up rather than an unresolved dependency
  vulnerability.

---

Last Updated: 2026-04-04
Assigned To: Agent
