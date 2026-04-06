# TASK-116 CI Maintenance - Dependency Automation Follow-Through

## Task ID
TASK-116

## Status
In progress

## Objective
Keep dependency automation trustworthy by removing avoidable CI friction and
then addressing the first real upgrade failures that Dependabot surfaced.

## Why This Task Matters
- `TASK-061` intentionally enabled recurring Dependabot updates for npm and
  GitHub Actions.
- The repository's branch-name gate currently blocks Dependabot branch names,
  which creates noisy false failures on valid automated maintenance PRs.
- Once that policy issue is fixed, the repo still needs an ownership path for
  failing upgrade PRs so useful automation does not stagnate into a queue of
  ignored red branches.

## Scope
- Update the branch-name workflow so Dependabot PR branches are allowed in a
  controlled way.
- Keep the stricter human branch contract intact for normal task branches.
- Align repository guidance (`agent.md`, `README.md`) with the actual workflow
  behavior.
- Triage the first failing npm upgrade PRs opened after the policy fix.
- Repair the highest-value failing upgrades in sequence:
  - `PR #120` React 19 compatibility
  - `PR #121` Next 16 compatibility
- Triage any remaining blocked major updates after those replacements land and
  either repair them or record a deliberate defer so Dependabot does not keep
  reopening the same known-bad branch.
- Use repo-owned replacement branches/PRs because the original Dependabot
  branches are not maintainer-writable.
- Record the change in the development journal.

## Acceptance Criteria
- Human-authored PR branches still must match `feature/*`, `fix/*`,
  `refactor/*`, `docs/*`, or `chore/*`.
- Dependabot-authored PR branches using `dependabot/*` pass the branch-name
  gate.
- Repo docs clearly explain the exception so the policy remains understandable.
- The first failing Dependabot upgrade PRs have an explicit, validated path
  forward instead of remaining unexplained CI failures.
- Known-blocked majors can be intentionally deferred with repository-owned
  configuration instead of staying open as recurring red PR noise.
- The work stays isolated as workflow/dependency maintenance rather than
  product-scope feature changes.

## Validation Plan
- Review the final workflow logic and confirm it distinguishes human and
  Dependabot PR actors correctly.
- For dependency-fix branches, run the minimal relevant validation suite needed
  to prove the upgraded stack is safe to merge.
- Current React 19 validation status:
  - replacement PR `#127` is green and merged on current `main`
  - the React 19 runtime/types plus DnD compatibility upgrade are part of the
    current branch baseline
- Current Next 16 validation status:
  - `npm run lint` passes after the flat-config ESLint migration required by
    `eslint-config-next@16.2.2`
  - `npx vitest run tests/middleware.test.ts` passes after the `proxy.ts`
    migration
  - `npm run build` passes on Next `16.2.2`
  - local `npm test` is environment-blocked on Node `20.17.0` by the existing
    `jsdom@29.0.1` worker startup issue, so CI will be the authoritative full
    suite signal for the replacement branch
- Current ESLint 10 triage status:
  - a direct bump to `eslint@^10.2.0` reproduces a real `npm run lint`
    failure in `eslint-plugin-react` on the current Next 16 baseline
  - the repo should keep the validated ESLint 9 baseline on `main` and ignore
    only the blocked `eslint` semver-major line until the upstream lint stack
    becomes compatible

---

Last Updated: 2026-04-06
Assigned To: User + Agent
