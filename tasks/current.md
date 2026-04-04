# Current Task: TASK-061 Dependency Security Baseline - Vulnerability Remediation and Scan Cadence Definition

Dedicated task brief: [`tasks/task-061-dependency-security-baseline.md`](./task-061-dependency-security-baseline.md)

## Task ID
TASK-061

## Status
Implementation complete locally; PR/review follow-through in progress

## Objective
Reduce current dependency-driven security exposure by remediating actionable
high-severity vulnerabilities, tightening transitive dependency hygiene where
safe, and establishing a recurring automated scan cadence so the repo does not
silently drift back into a risky state.

## Why Now
- The app now has a meaningful auth, sharing, storage, and agent-access
  surface, which raises the cost of carrying known dependency vulnerabilities.
- Security-sensitive tasks are queued next, so the dependency baseline should
  be tightened before broader OWASP-focused assessment and remediation work.
- The current CI stack validates quality and deployability well, but it does
  not yet provide a clear recurring dependency-security monitoring cadence.

## Scope Snapshot
- Inventory the current dependency vulnerability surface with emphasis on
  production-impacting critical/high findings.
- Apply safe direct upgrades, lockfile refreshes, and targeted overrides where
  they materially reduce risk, including framework upgrades when the security
  remediation path requires them and validation stays controlled.
- Define and implement a recurring automated scan cadence for dependency
  security visibility.
- Document residual risks, deferred items, and follow-up decisions explicitly.

## Acceptance Snapshot
- Known actionable critical/high dependency findings are remediated or clearly
  justified as deferred with explicit follow-up tracking.
- The repo gains an automated dependency-security scan cadence beyond ad hoc
  manual audit runs.
- Validation remains green after dependency changes.
- Tracking docs and task notes capture what was fixed, what remains, and why.

## Notes
- This task is security-critical and should prefer conservative, explainable
  changes over large speculative framework migrations.
- Any unresolved vulnerability that requires a major-version jump or broader
  architecture migration must be surfaced clearly rather than buried.
- The final handoff should include an actionable report, not just a changelog.

## Implemented In This Pass
- Remediated the previously reported actionable dependency vulnerabilities by
  upgrading direct dependencies including Next.js, the AWS SDK S3 packages,
  Vitest, Playwright, and `sanitize-html`.
- Added targeted `overrides` in `package.json` so vulnerable transitive
  packages (`ajv`, `flatted`, `brace-expansion`, `minimatch`, `picomatch`)
  resolve to patched versions consistently through the lockfile.
- Replaced the floating `lucide-react` version with a pinned semver range so
  dependency resolution stays reproducible instead of silently drifting.
- Added recurring dependency-security automation with `.github/dependabot.yml`
  and `.github/workflows/dependency-security.yml`.
- Documented the new dependency-security cadence in `README.md`.
- Completed the required Next.js 15 async request API migration and related
  test/config updates so the security-driven framework upgrade remains green.

## Validation Snapshot
- `npm audit --json` now reports `0` vulnerabilities.
- `npm run security:audit`, `npm run lint`, `npm test`,
  `npm run test:coverage`, and `npm run build` all passed on 2026-04-04.
- `npm run test:e2e` was attempted after installing Chromium, but local
  Playwright execution is still blocked in this environment because Prisma
  cannot reach PostgreSQL at `127.0.0.1:5432`.

## Residual Notes
- No actionable npm audit vulnerabilities remained at the end of this pass.
- Full local Playwright reruns still depend on a reachable PostgreSQL fixture
  database, which is an environment prerequisite rather than a dependency
  remediation bug.
- Next.js 15 now emits the expected deprecation notice around `next lint`;
  workflow/tooling cleanup remains better tracked as CI hygiene follow-up work
  rather than bundled into this security task.

---

Last Updated: 2026-04-04
Assigned To: Agent
