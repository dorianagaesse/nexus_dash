# TASK-116 CI Maintenance - Refresh GitHub Actions Versions and Workflow Hygiene

## Task ID
TASK-116

## Status
In progress

## Objective
Keep CI trustworthy by tightening workflow hygiene and removing avoidable
friction from automation, including Dependabot-generated pull requests and
future GitHub Actions maintenance work.

## Why This Task Matters
- `TASK-061` intentionally enabled recurring Dependabot updates for npm and
  GitHub Actions.
- The repository's branch-name gate currently blocks Dependabot branch names,
  which creates noisy false failures on valid automated maintenance PRs.
- CI policy should protect the human task workflow without accidentally
  fighting the repo's own automation.

## Scope
- Update the branch-name workflow so Dependabot PR branches are allowed in a
  controlled way.
- Keep the stricter human branch contract intact for normal task branches.
- Align repository guidance (`agent.md`, `README.md`) with the actual workflow
  behavior.
- Record the change in the development journal.

## Acceptance Criteria
- Human-authored PR branches still must match `feature/*`, `fix/*`,
  `refactor/*`, `docs/*`, or `chore/*`.
- Dependabot-authored PR branches using `dependabot/*` pass the branch-name
  gate.
- Repo docs clearly explain the exception so the policy remains understandable.
- The change is isolated as workflow/documentation hygiene rather than mixed
  into product work.

## Validation Plan
- Review the final workflow logic and confirm it distinguishes human and
  Dependabot PR actors correctly.
- No app/runtime test suite is required unless unrelated code changes occur.

---

Last Updated: 2026-04-05
Assigned To: User + Agent
