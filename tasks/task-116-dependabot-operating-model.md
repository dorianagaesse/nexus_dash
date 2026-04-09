# TASK-116 Dependabot Operating Model

## Purpose
Make dependency maintenance feel operationally separate from product delivery.
Dependabot should keep dependencies current without stealing review attention
from feature PRs.

## Core Principle
Dependabot PRs are maintenance traffic, not product traffic.

They should be handled in a dedicated lane with a simple mental model:
- green Dependabot PRs merge automatically
- red Dependabot PRs go to a scheduled AI-assisted repair lane

## Desired Model

### 1. Dependabot cadence stays independent
- Dependabot opens update PRs on its own schedule.
- This schedule is independent from feature development and feature CI.
- We do not want dependency-fix agents waking up on every unrelated feature
  build.

### 2. Green Dependabot PRs auto-merge
- Green Dependabot PRs in the safe lane should merge automatically after the
  repository's required checks pass.
- This keeps low-risk maintenance work off the review queue.

### 3. Red Dependabot PRs form one manual-review lane
- Any open Dependabot PR that is red and not auto-mergeable belongs to the
  red/manual-review lane.
- This gives the repo only two practical classes of Dependabot PRs:
  - green auto-merge
  - red agent-review

### 4. Scheduled Copilot repair pass
- On a schedule, a GitHub Copilot CLI custom-agent pass scans open red
  Dependabot PRs.
- For each selected PR, the agent should:
  - inspect the PR and failed checks
  - assess whether the update is worth pursuing now
  - if worth pursuing, create a repo-owned superseding PR and try to make it
    green
  - comment the original Dependabot PR with the diagnosis and replacement link
  - close the original Dependabot PR once the superseding PR exists
- The superseding PR is the only review surface humans should consider.

### 5. No auto-merge for agent-created superseding PRs
- The Copilot repair lane may open and update the superseding PR.
- It must not merge that PR.
- Human review remains the final decision point.

## Why This Model Fits NexusDash
- The repository is already maintained in an agent-heavy way.
- The real cost of Dependabot is not PR count but review attention.
- A scheduled red-PR repair lane keeps maintenance work away from feature work.
- Closing the original bot PR once superseded prevents accidental merge on the
  wrong branch.

## Dependabot Behavior Clarification
- Dependabot normally updates dependency manifests and lockfiles.
- It can also update GitHub Actions references in workflow files.
- It is not expected to rewrite arbitrary feature code.
- That makes it a good upstream updater, but not a good complete solver for
  compatibility breakage.

## Current Baseline On `main`
- Dependabot branch naming is allowed without weakening the human branch
  contract.
- Safe grouped green Dependabot PRs can auto-merge after required checks.
- A bounded deterministic repair workflow exists today, but it is not the final
  intended model.
- The clarified goal is to replace that red-PR repair behavior with a weekly
  scheduled Copilot CLI repair lane.

## Implementation Big Picture

### Repository automation that stays
- `.github/dependabot.yml` keeps update cadence and grouping.
- `.github/workflows/dependabot-auto-triage.yml` keeps safe-lane labeling and
  green auto-merge.

### Repository automation that changes
- The red-PR repair path should become schedule-driven rather than
  feature-CI-driven.
- The scheduler should scan only open Dependabot PRs in the manual-review lane.
- When the lane chooses a PR, it should trigger GitHub Copilot CLI with a
  repository custom agent, not just a deterministic local repair script.

### Copilot repair-agent role
- GitHub Copilot CLI should run a repository custom agent that repairs the
  selected Dependabot PR on a repo-owned branch.
- Superseding PRs are opened deterministically by the workflow after Copilot
  writes its repair summary and leaves changes on the repair branch.
- The agent should be instructed to:
  - work only on the selected Dependabot PR
  - preserve the dependency intent
  - repair compatibility or explain why it is not worth pursuing now
  - leave PR creation, PR closing, and merge ownership to the workflow/humans

## Open Constraints / Decisions

### Model selection
- The weekly workflow intentionally uses Copilot's Auto model selection.
- If we want to pin a specific model later, Copilot CLI supports that, but it
  is not required for the initial rollout.

### Authentication and workflow execution
- The scheduled lane needs a repository secret for Copilot CLI automation:
  `COPILOT_ACTIONS_TOKEN`.
- Superseding PRs are opened by the scheduled workflow after Copilot has
  produced changes.
- Because those PRs are created by `GITHUB_TOKEN`, the workflow must explicitly
  dispatch the repository's required `Check Branch Name` and `Quality Gates`
  workflows on the superseding branch so the PR becomes normally mergeable.
- The generated PR body should also explain the original Dependabot PR, the
  file list, the rough diff size, and Copilot-reported validation so
  maintainers can review it quickly.

### Selection policy for red PRs
- The scheduled lane should not blindly pursue every red Dependabot PR.
- We still need a written heuristic for:
  - trivial / straightforward
  - non-trivial but worth pursuing now
  - not worth it now
- That heuristic should be explicit before the agent lane is enabled.

## Recommended First Implementation
- Keep green safe-lane auto-merge exactly as it is.
- Add a schedule-driven scanner for red/manual-review Dependabot PRs.
- Start with a conservative weekly run.
- Let the scanner invoke the Copilot repair agent for at most a small number of
  PRs per run.
- Close original Dependabot PRs only after the superseding PR is created
  successfully.
- Keep human merge ownership for all superseding PRs.

## Success Condition
Maintainers rarely need to look at raw Dependabot PRs:
- safe green ones disappear automatically
- red ones come back as reviewed repo-owned superseding PRs or clear diagnosis

---

Last Updated: 2026-04-09
Assigned To: User + Agent
