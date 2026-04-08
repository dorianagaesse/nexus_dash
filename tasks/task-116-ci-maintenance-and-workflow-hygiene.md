# TASK-116 Dependabot and CI Automation - Safe Merge + Event-Driven Bounded Repair Agent

## Task ID
TASK-116

## Status
Implementation in progress, awaiting review and validation

## Objective
Keep dependency automation trustworthy without letting it pull focus from
delivery by narrowing safe auto-merge lanes and adding a bounded event-driven
repair path for failing/manual-review Dependabot PRs, with weekly/manual
backstop coverage.

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
  Dependabot PRs: a bounded repair agent that reacts to Dependabot PR check
  completion events, can attempt straightforward repairs on repo-owned
  superseding branches, and hands them back for review.
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
- The red-PR repair agent is explicitly bounded:
  it works only on manual-review Dependabot PRs, opens repo-owned superseding
  branches/PRs, comments the original PRs, and leaves merge decisions to
  humans.
- The repair lane is event-driven first:
  it should react to CI completion on Dependabot-created `dependabot/*` PRs,
  while a weekly/manual run remains available only as a backstop.
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
  - the red-PR repair agent is implemented as a separate non-blocking workflow
    that reacts to completed CI on Dependabot-created PRs, while still keeping
    weekly/manual dispatch for backstop operation

---

Last Updated: 2026-04-08
Assigned To: User + Agent
