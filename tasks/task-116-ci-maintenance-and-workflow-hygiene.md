# TASK-116 Dependabot and CI Automation - Safe Merge + Weekly Copilot Repair Lane

## Task ID
TASK-116

## Status
Implementation in progress, live validation follow-up patched and awaiting review

## Objective
Keep dependency automation trustworthy without letting it pull focus from
delivery by narrowing safe auto-merge lanes and moving failing/manual-review
Dependabot PRs into a weekly scheduled GitHub Copilot repair lane.

## Why This Task Matters
- `TASK-061` intentionally enabled recurring Dependabot updates for npm and
  GitHub Actions.
- The repository needed three follow-through pieces to make that automation
  useful in practice: a branch-name exception for bot PRs, a safe auto-merge
  lane for low-risk updates, and a bounded repair path for failing/manual-
  review PRs.
- Without that full loop, dependency automation turns into noisy red branches
  instead of a trustworthy maintenance lane.

## Scope
- Land the branch-name workflow exception so Dependabot PR branches are allowed
  in a controlled way.
- Keep the stricter human branch contract intact for normal task branches.
- Align repository guidance (`agent.md`, `README.md`) with the actual workflow
  behavior.
- Repair the first two high-value failing upgrade PRs through repo-owned
  superseding branches:
  - `PR #120` React 19 compatibility -> replacement PR `#127`
  - `PR #121` Next 16 compatibility -> replacement PR `#128`
- Triage the remaining blocked major update and record an explicit defer so
  Dependabot does not keep reopening the same known-bad branch:
  - `PR #123` ESLint 10 -> ignore major until upstream compatibility catches up
- Reduce routine Dependabot overhead by grouping safe update lanes and
  auto-merging them after the repository's normal quality gates pass.
- Implement the next automation tier for the remaining red/manual-review
  Dependabot PRs as a weekly scheduled GitHub Copilot CLI custom-agent pass
  that can attempt repairs on repo-owned superseding branches and hand them
  back for review.
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
- Safe grouped update lanes can be approved and merged automatically without
  weakening the existing quality gates or expanding automation to risky major
  migrations.
- The red-PR repair lane is explicitly bounded:
  it works only on manual-review Dependabot PRs, opens repo-owned superseding
  branches/PRs, comments and closes the original Dependabot PRs once
  superseded, and leaves merge decisions to humans.
- The repair lane is schedule-driven:
  it runs weekly and stays operationally separate from feature-adjacent CI.
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
- Current automation-policy validation target:
  - safe grouped Dependabot PRs receive an explicit auto-merge label/approval
    from workflow automation
  - those PRs still merge only after `check-name`,
    `Quality Core (lint, test, coverage, build)`,
    `E2E Smoke (Playwright)`, and
    `Container Image (build + metadata artifact)` are all green
  - excluded majors and high-churn packages remain visible manual-review PRs
  - grouped GitHub Actions updates stay patch/minor only so major action bumps
    remain outside the auto-merge lane
- the red-PR repair lane is implemented as a separate weekly workflow using
  GitHub Copilot CLI with a repository custom agent profile
- the workflow scans only open red/manual-review Dependabot PRs and creates
  repo-owned superseding PRs when Copilot produces a repair
- the workflow closes original Dependabot PRs once a superseding PR exists
  - superseding PRs are not auto-merged
- a live smoke test on Dependabot PR `#133` must prove the Copilot lane
  actually reaches agent execution and does not stop early on missing repair
  context files
- a live smoke test on a generated superseding PR must also prove the required
  checks actually start
  - because PRs created by `GITHUB_TOKEN` do not automatically trigger new
    workflow runs
  - the repair lane therefore needs an explicit post-create dispatch path for
    the required `Check Branch Name` and `Quality Gates` workflows
- generated superseding PRs should be self-explanatory enough for maintainers
  to review quickly
  - include the original Dependabot PR, the key repair summary, the changed
    file list, a rough diff-size summary, and Copilot-reported validation
- manual workflow dispatch should allow a targeted force-rerun on a marked
  Dependabot PR head so live debugging does not require reopening or mutating
  the original PR first
- live validation must also prove the workflow does not regress when Copilot
  creates a local commit on the repair branch instead of leaving uncommitted
  edits for finalize to capture
- replacement PR creation must stay bounded even when Copilot writes a long
  markdown summary, or the lane will fail late on `gh pr create`

---

Last Updated: 2026-04-09
Assigned To: User + Agent
