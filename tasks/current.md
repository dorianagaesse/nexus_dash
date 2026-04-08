<<<<<<< HEAD
# Current Task: TASK-116 Dependabot and CI Automation - Safe Merge + Bounded Repair Agent
=======
# Current Task: TASK-116 Dependabot Operating Model - Green Auto-Merge + Weekly Copilot Repair Lane
>>>>>>> a488cf0 (chore(task-116): schedule copilot dependabot repair lane)

## Task ID
TASK-116

## Status
Implementation complete, awaiting validation

## Objective
Turn Dependabot into a low-friction maintenance lane instead of a delivery
distraction by:
<<<<<<< HEAD
- keeping safe update classes small and auto-mergeable only after full CI
- keeping risky majors/manual-review lanes explicit
- adding a bounded scheduled repair agent that can attempt straightforward
  fixes on repo-owned superseding branches and hand results back for review
=======
- keeping Dependabot cadence separate from feature/product PR flow
- auto-merging green Dependabot PRs after full CI when they are in the safe
  lane
- treating red Dependabot PRs as one explicit manual-review lane
- running a weekly scheduled GitHub Copilot CLI custom-agent pass on those red
  PRs so it can repair them on repo-owned superseding branches, comment and
  close the originals once superseded, and leave the final review decision to
  humans
>>>>>>> a488cf0 (chore(task-116): schedule copilot dependabot repair lane)

## Why This Task Matters
- `TASK-061` enabled recurring Dependabot updates for npm and GitHub Actions.
- The useful part of Dependabot is automated update proposal, not forcing us
  to spend feature-review attention on maintenance PRs every day.
- The repository now needs a cleaner operating model that keeps green bot PRs
  out of the way and gives red bot PRs a deliberate weekly AI-assisted
  review/fix lane that does not bleed into product PRs.

## Scope Snapshot
<<<<<<< HEAD
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
- Landed: add the bounded scheduled/manual repair agent for red/manual-review
  Dependabot PRs so straightforward failures can get a repo-owned repair path
  without mutating bot branches or auto-merging guesswork.
- Validation state: the repair-agent workflow is now on `main` and has already
  completed one successful manual dispatch against the live repo.
- Record outcomes, validation, and any superseding replacement PRs in
  `journal.md`.
=======
- Landed baseline:
  - Dependabot branch naming works without weakening the human branch contract
  - safe grouped Dependabot lanes can auto-merge after full CI
  - blocked upgrade cases already proved the need for repo-owned superseding
    PRs (`#127`, `#128`)
  - the repo can already classify manual-review Dependabot PRs separately from
    safe-lane PRs
- Clarified next slice:
  - replace the event-driven red-PR repair idea with a weekly scheduled repair
    workflow
  - run GitHub Copilot CLI with a dedicated repository custom agent profile
  - scan only open red/manual-review Dependabot PRs
  - require any agent fix to land on a repo-owned superseding PR
  - close the original Dependabot PR once the superseding PR exists so there is
    only one merge surface
  - keep all final merge decisions human-owned
- Dedicated design note: `tasks/task-116-dependabot-operating-model.md`
>>>>>>> a488cf0 (chore(task-116): schedule copilot dependabot repair lane)

## Acceptance Snapshot
- Dependabot runs on its own cadence, separate from feature/product PR flow.
- Green safe-lane Dependabot PRs can merge automatically after required checks
  pass.
- Red/manual-review Dependabot PRs are the only Dependabot PRs considered by
  the scheduled weekly Copilot repair lane.
- The scheduled repair lane works only on Dependabot-created PRs.
- Copilot-generated fixes land on repo-owned superseding PRs rather than
  mutating the original bot branch.
- Original Dependabot PRs are commented and then closed once a superseding PR
  exists, preventing accidental merge on the wrong surface.
- Superseding PRs are never auto-merged by the automation.

## Validation / Evidence Expectations
<<<<<<< HEAD
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
  - `.github/workflows/dependabot-repair-agent.yml` runs on a weekly schedule
    plus manual dispatch, scans failing/manual-review Dependabot PRs, and
    attempts only bounded repairs on repo-owned superseding branches
  - the first live manual dispatch of the repair-agent workflow succeeded on
    `main`, proving the scheduled/manual plumbing is wired correctly
  - excluded majors and high-churn packages remain explicitly manual-review
    work instead of hidden auto-fix attempts
  - GitHub Actions rollup grouping is limited to patch/minor updates so major
    action bumps do not silently enter the safe auto-merge lane
=======
- Repo guidance should explain the two-lane Dependabot model clearly:
  green auto-merge vs red weekly Copilot repair.
- The implementation note should explain how red PRs are selected, how a
  superseding PR is opened, when the original bot PR is closed, and why merge
  stays human-owned.
- We should record the GitHub-side prerequisites for Copilot CLI automation:
  the `COPILOT_ACTIONS_TOKEN` secret, the repository custom agent profile, and
  the fact that model selection intentionally falls back to Auto in the weekly
  workflow.
>>>>>>> a488cf0 (chore(task-116): schedule copilot dependabot repair lane)

## Notes
- This remains a workflow/dependency-maintenance task under `TASK-116`, not a
  reopening of `TASK-061`.
<<<<<<< HEAD
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
  it should scan failing Dependabot PRs, attempt straightforward fixes on a
  repo-owned superseding branch, comment both the original and replacement PRs,
  and stop before merge so we can review the outcome together.

---

Last Updated: 2026-04-07
=======
- The current `main` baseline is coherent, but it does not yet match this
  clarified weekly Copilot repair model.
- PR `#144` is the active rollout vehicle for aligning the workflow and docs to
  the final weekly model.

---

Last Updated: 2026-04-09
>>>>>>> a488cf0 (chore(task-116): schedule copilot dependabot repair lane)
Assigned To: User + Agent
