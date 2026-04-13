# Current Task: TASK-122 Dependabot Repair Cadence - Scheduled Full-Backlog Drain

## Task ID
TASK-122

## Status
In Progress

## Objective
Update the Dependabot repair lane so the weekly scheduled run attempts every
eligible red Dependabot PR instead of stopping at a small fixed batch size,
while keeping manual targeted controls and bounded execution characteristics for
operators.

## Why This Task Matters
- The current Monday schedule still behaves like “repair only the first N red
  PRs,” which can leave a backlog behind even when the repair lane itself is
  functioning correctly.
- The intended operating model is stronger: every scheduled run should attempt
  the full eligible red Dependabot backlog, while maintainers still retain
  precise manual controls for debugging or single-PR reruns.
- Now that TASK-120 has proven the repair lane end to end, the safety mechanism
  should shift from a weekly item cap to explicit matrix parallelism.

## Implementation Plan
- Make scheduled runs call the scanner without a numeric item cap so every
  eligible red Dependabot PR enters the matrix.
- Keep `workflow_dispatch` support for `max_prs`, `pr_number`, and `force_rerun`
  so maintainers can still run small, targeted repairs manually.
- Add explicit matrix `max-parallel` control so “repair all” does not become
  uncontrolled concurrency.
- Validate the new scan behavior locally, then open and monitor a PR until the
  Copilot review appears and handle any actionable feedback.

## Expected Output
- a workflow/script change that makes the Monday repair run attempt the full
  eligible red Dependabot backlog
- preserved manual controls for bounded or single-PR runs
- controlled parallel repair execution instead of a weekly item cap
- a PR with review/validation evidence for the new operating model

## Acceptance Criteria
- Scheduled runs no longer enforce a small fixed `max_prs` cap and instead scan
  the full eligible red Dependabot set.
- Manual dispatch retains `max_prs`, `pr_number`, and `force_rerun` controls.
- Repair execution uses explicit bounded parallelism rather than a silent scan
  cap as the primary safety control.
- The implementation is validated and reviewed through a dedicated PR.

## Definition Of Done
1. `TASK-122` is tracked in `tasks/current.md` and `tasks/backlog.md`.
2. The repair workflow and script implement the new scheduled/manual split.
3. The change is validated with targeted local checks.
4. A PR is opened and monitored through Copilot review, with any valid review
   follow-up addressed.

## Dependencies
- `TASK-120`
- `TASK-116`
- repository GitHub Actions / Copilot automation secrets

## Notes
- Recommended operating model for this task:
  - scheduled Mondays drain all eligible red Dependabot PRs
  - manual runs stay bounded and targetable for diagnosis or controlled reruns
- Preferred safety control:
  - matrix `max-parallel`, not a hidden weekly item cap

---

Last Updated: 2026-04-13
Assigned To: User + Agent
