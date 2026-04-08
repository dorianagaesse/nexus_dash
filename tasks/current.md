# Current Task: TASK-116 Dependabot Operating Model - Green Auto-Merge + Weekly Copilot Repair Lane

## Task ID
TASK-116

## Status
Implementation in progress, awaiting review and validation

## Objective
Turn Dependabot into a low-friction maintenance lane instead of a delivery
distraction by:
- keeping Dependabot cadence separate from feature/product PR flow
- auto-merging green Dependabot PRs after full CI when they are in the safe
  lane
- treating red Dependabot PRs as one explicit manual-review lane
- running a weekly scheduled GitHub Copilot CLI custom-agent pass on those red
  PRs so it can repair them on repo-owned superseding branches, comment and
  close the originals once superseded, and leave the final review decision to
  humans

## Why This Task Matters
- `TASK-061` enabled recurring Dependabot updates for npm and GitHub Actions.
- The useful part of Dependabot is automated update proposal, not forcing us
  to spend feature-review attention on maintenance PRs every day.
- The repository now needs a cleaner operating model that keeps green bot PRs
  out of the way and gives red bot PRs a deliberate weekly AI-assisted
  review/fix lane that does not bleed into product PRs.

## Scope Snapshot
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
- Repo guidance should explain the two-lane Dependabot model clearly:
  green auto-merge vs red weekly Copilot repair.
- The implementation note should explain how red PRs are selected, how a
  superseding PR is opened, when the original bot PR is closed, and why merge
  stays human-owned.
- We should record the GitHub-side prerequisites for Copilot CLI automation:
  the `COPILOT_ACTIONS_TOKEN` secret, the repository custom agent profile, and
  the fact that model selection intentionally falls back to Auto in the weekly
  workflow.

## Notes
- This remains a workflow/dependency-maintenance task under `TASK-116`, not a
  reopening of `TASK-061`.
- The current `main` baseline is coherent, but it does not yet match this
  clarified weekly Copilot repair model.
- PR `#145` is the active rollout vehicle for aligning the workflow and docs to
  the final weekly model.

---

Last Updated: 2026-04-09
Assigned To: User + Agent
