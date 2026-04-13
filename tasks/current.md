# Current Task: TASK-120 Dependabot Repair-Lane Follow-Up - Precise Labels and Resilient Superseding PRs

## Task ID
TASK-120

## Status
In progress

## Objective
Restore trustworthy Dependabot maintenance behavior after the live post-TASK-116
drift by making labels reflect actual PR state and by hardening the repair lane
so failing Dependabot PRs can still produce reviewable repo-owned superseding
PRs when a bounded repair path exists.

## Why This Task Matters
- `TASK-116` established the intended Dependabot operating model, but the latest
  live PR batch exposed two gaps:
  - red safe-lane PRs can remain mislabeled as auto-mergeable
  - the repair lane can reach execution without producing a repo-owned
    superseding PR
- That breaks the maintenance contract the repo is trying to create:
  maintainers should not have to manually triage mislabeled red Dependabot PRs
  or wonder whether the repair lane actually attempted a fix.
- The repo also now has a concrete red-failure mode on current Dependabot PRs:
  lockfile drift causes `npm ci` to fail before real validation begins, so the
  repair lane needs a practical bounded path for that class of failure.

## Initial Focus
- tighten Dependabot label transitions so red PRs do not remain in the
  auto-merge lane
- make the repair scanner resilient to stale/misleading labels when a Dependabot
  PR is clearly red
- restore reliable superseding-PR creation when the repair lane can apply a
  bounded fix or when Copilot changes the branch but omits the expected
  metadata file
- align CI/install assumptions where necessary so current Dependabot PRs stop
  failing for tooling drift before real checks run

## Expected Output
- workflow and orchestration changes that keep Dependabot labels aligned with
  actual PR readiness
- repair-lane changes that increase the chance of creating a repo-owned
  superseding PR for qualifying red Dependabot PRs
- any supporting package/CI alignment needed to prevent lockfile-only false-red
  failures on fresh Dependabot PRs
- updated task tracking and operator-facing docs/journal notes for the revised
  behavior

## Acceptance Criteria
- A Dependabot PR that is red on required checks does not remain labeled as
  `dependabot:auto-merge`.
- A Dependabot PR that is actually eligible for the safe green lane still keeps
  the existing auto-merge behavior after required checks pass.
- The repair-lane scanner can target qualifying red Dependabot PRs even if a
  stale label state exists temporarily.
- The repair lane can create a repo-owned superseding PR when a bounded
  repair is available for the current failure mode, or when Copilot leaves
  repair changes on the branch without writing the expected metadata file.
- Superseding PRs remain human-merge-owned and continue to dispatch the required
  reviewable CI surface.
- The work stays focused on Dependabot/CI maintenance and does not widen into an
  unrelated product feature pass.

## Definition Of Done
1. The TASK-116 follow-up behavior is implemented in code and workflow config.
2. Required tracking docs are updated and consistent:
   - `tasks/current.md`
   - `tasks/backlog.md`
   - `journal.md`
   - `README.md` when operator expectations or automation behavior change
3. Validation is completed with evidence captured:
   - `npm run lint`
   - `npm run build`
   - targeted workflow/script validation for the Dependabot follow-up
   - live PR/workflow validation on the follow-up branch once pushed
4. A branch and PR are created for this task, Copilot review is monitored, and
   actionable review feedback is handled before handoff.

## Dependencies
- `TASK-116`
- `TASK-061`
- `TASK-041`

## Notes
- Treat this as a bounded workflow-maintenance follow-up, not a new broad
  Dependabot redesign.
- Current live batch signal to address first:
  - red safe-lane PRs can remain mislabeled as auto-mergeable
  - red/manual-review PRs can reach the Copilot lane without producing a
    superseding PR
  - current failures are dominated by `npm ci` lockfile-sync errors rather than
    surfaced app-compatibility regressions
- Keep the final ownership model intact:
  green safe lanes should disappear automatically, while repaired/manual lanes
  come back as repo-owned review surfaces rather than raw bot PRs.

---

Last Updated: 2026-04-13
Assigned To: User + Agent
