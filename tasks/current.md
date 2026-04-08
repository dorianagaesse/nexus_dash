# Current Task: TASK-116 Dependabot and CI Automation - Safe Merge + Event-Driven Bounded Repair Agent

## Task ID
TASK-116

## Status
Implementation in progress, awaiting review and validation

## Objective
Turn Dependabot into a low-friction maintenance lane instead of a delivery
distraction by:
- keeping safe update classes small and auto-mergeable only after full CI
- keeping risky majors/manual-review lanes explicit
- adding a bounded event-driven repair agent for Dependabot-created manual-
  review PRs, with a weekly backstop, so straightforward fixes can open
  repo-owned superseding branches and hand results back for review

## Why This Task Matters
- `TASK-061` enabled recurring Dependabot updates for npm and GitHub Actions.
- The current `Check Branch Name` workflow rejects `dependabot/*` branch names,
  which creates false CI failures on valid automated maintenance PRs.
- After the branch-name fix landed, the remaining failing Dependabot PRs became
  real compatibility signals rather than CI noise.
- Closing that loop matters because dependency automation is only useful if we
  can triage and land the safe upgrades while turning the larger ones into
  deliberate engineering work instead of ignored red PRs.

## Scope Snapshot
- Landed: update `.github/workflows/check-branch-names.yml` so Dependabot PRs
  can use `dependabot/*` without weakening the human branch contract.
- Landed: update `agent.md` and `README.md` so the documented policy matches
  the workflow behavior.
- Landed: repo-owned replacement PR `#127` now supersedes Dependabot `#120`
  for the React 19 compatibility upgrade and is merged on `main`.
- Landed: repo-owned replacement PR `#128` now supersedes Dependabot `#121`
  for the Next 16 compatibility upgrade and is merged on `main`.
- Landed: treat `PR #123` (ESLint 10) as a deliberate defer and codify that
  decision in `.github/dependabot.yml` so the blocked major does not keep
  reopening.
- Landed: group safe Dependabot update lanes and auto-merge them only after
  the normal required PR checks pass.
- Landed: add the bounded repair agent for red/manual-review Dependabot PRs so
  straightforward failures can get a repo-owned repair path without mutating
  bot branches or auto-merging guesswork.
- This follow-up slice updates that repair lane so it runs primarily from
  Dependabot PR check completions, with the weekly/manual path kept only as a
  backstop.
- Validation state target: the repair-agent workflow should react only to
  Dependabot-created `dependabot/*` PRs after relevant CI completes, while the
  scheduled/manual mode remains available for backfill and explicit reruns.
- Record outcomes, validation, and any superseding replacement PRs in
  `journal.md`.

## Acceptance Snapshot
- Valid Dependabot PRs no longer fail branch naming just because their branches
  start with `dependabot/`.
- Human contributors still cannot bypass the normal branch prefixes.
- The repo guidance is explicit about the exception.
- `PR #120`, `PR #121`, and `PR #123` each have a credible path forward:
  - `#120` is superseded by replacement PR `#127`
  - `#121` is superseded by replacement PR `#128`
  - `#123` is explicitly deferred with a recorded compatibility reason and an
    ignore rule that prevents repeated red reopenings
- Safe grouped Dependabot lanes can merge without manual babysitting once CI is
  green, while majors and excluded high-churn packages still surface for
  explicit review.
- Red/manual-review Dependabot PRs have a bounded-repair path:
  diagnose the failure, attempt a straightforward fix on a repo-owned
  superseding branch, comment the original PR, and open a replacement PR for
  human review rather than mutating the bot branch.

## Validation / Evidence Expectations
- Workflow-policy evidence should point to the merged branch-name logic and
  repo guidance.
- Dependency-fix evidence should include the actual compatibility diagnosis and
  the relevant local validation commands for each repaired upgrade branch.
- Current React-19 branch evidence:
  - replacement PR `#127` is green and merged on current `main`
  - React 19, React DOM 19, and the React-19-compatible DnD line are part of
    the baseline this branch now builds on
- Current Next 16 branch evidence:
  - `npm run lint` passes on the flat-config ESLint 9 +
    `eslint-config-next@16.2.2` stack
  - `npx vitest run tests/middleware.test.ts` passes after the `middleware.ts`
    to `proxy.ts` rename
  - `npm run build` passes on Next `16.2.2`
  - local `npm test` still hits the existing `jsdom@29.0.1` worker-startup
    issue on this workstation's Node `20.17.0`, which appears environment-
    specific rather than caused by the Next 16 diff itself
- Current ESLint 10 defer evidence:
  - `npm install -D eslint@^10.2.0` reproduces a real `npm run lint` failure
    inside `eslint-plugin-react` (`contextOrFilename.getFilename is not a function`) on the current Next 16 lint stack
  - `.github/dependabot.yml` ignores only the `eslint` semver-major line, so
    future patch/minor lint fixes still surface normally
- Current automation-policy evidence:
  - `.github/dependabot.yml` groups safe GitHub Actions updates plus curated
    npm patch/minor lanes so the PR queue stays smaller by default
  - `.github/workflows/dependabot-auto-triage.yml` labels safe lanes with
    `dependabot:auto-merge`, auto-approves them, and merges them after the
    required checks report success
  - `.github/workflows/dependabot-repair-agent.yml` now runs primarily from
    completed CI workflows on Dependabot PRs, with weekly schedule plus manual
    dispatch kept as a backstop
  - `scripts/dependabot_repair_agent.py` can target the exact Dependabot PR
    that triggered the workflow, no-op on green/safe PRs, and still fall back
    to bounded batch scanning for scheduled/manual runs
  - the original manual dispatch success on `main` still proves the backstop
    lane is wired, while this follow-up should prove the event-driven lane is
    scoped correctly
  - excluded majors and high-churn packages remain explicitly manual-review
    work instead of hidden auto-fix attempts
  - GitHub Actions rollup grouping is limited to patch/minor updates so major
    action bumps do not silently enter the safe auto-merge lane

## Notes
- This remains a workflow/dependency-maintenance task under `TASK-116`, not a
  reopening of `TASK-061`.
- The implemented execution order was deliberate:
  1. React 19 / `PR #120` -> replacement PR `#127`
  2. Next 16 / `PR #121` -> replacement PR `#128`
  3. ESLint 10 / `PR #123` -> explicit defer + ignore rule
  4. safe-lane auto-triage/auto-merge
  5. bounded red-PR repair agent
- The original Dependabot branches are not maintainer-writable, so repaired
  upgrades need to ship as repo-owned replacement PRs that explicitly
  supersede the bot PRs.
- I have not found a repo-local Dependabot setting that makes bot branches
  maintainer-writable; handling blocked majors through repo-owned replacement
  PRs or explicit ignore rules remains the practical path today.
- For delivery focus, the better default is narrow auto-merge plus explicit
  manual-review lanes, not an always-on agent trying to rewrite arbitrary red
  dependency PRs every Monday.
- The bounded red-PR repair agent belongs in the manual-review lane only:
  it should react to failing Dependabot PRs, attempt straightforward fixes on a
  repo-owned superseding branch, comment both the original and replacement PRs,
  and stop before merge so we can review the outcome together.

---

Last Updated: 2026-04-08
Assigned To: User + Agent
