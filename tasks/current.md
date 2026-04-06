# Current Task: TASK-116 CI Maintenance - Dependabot Branch Check Hygiene

## Task ID
TASK-116

## Status
Implementation in progress

## Objective
Allow valid Dependabot maintenance branches to pass the branch-name gate
without weakening the stricter naming contract used for human task branches.

## Why This Task Matters
- `TASK-061` enabled recurring Dependabot updates for npm and GitHub Actions.
- The current `Check Branch Name` workflow rejects `dependabot/*` branch names,
  which creates false CI failures on valid automated maintenance PRs.
- This is workflow hygiene, not product behavior, but it affects trust in the
  release gates and the usefulness of the new dependency automation.

## Scope Snapshot
- Update `.github/workflows/check-branch-names.yml` so:
  - human-authored PRs still require `feature/*`, `fix/*`, `refactor/*`,
    `docs/*`, or `chore/*`
  - Dependabot-authored PRs may use `dependabot/*`
- Update `agent.md` and `README.md` so the documented policy matches the
  workflow behavior.
- Record the change in `journal.md`.

## Acceptance Snapshot
- Valid Dependabot PRs no longer fail branch naming just because their branches
  start with `dependabot/`.
- Human contributors still cannot bypass the normal branch prefixes.
- The repo guidance is explicit about the exception.

## Validation / Evidence Expectations
- This is a workflow/documentation change, so codebase test suites are not
  required unless the scope expands unexpectedly.
- Evidence should point to the updated workflow logic and repo guidance.

## Notes
- This is a focused CI-policy correction under `TASK-116`, not a reopening of
  `TASK-061`.
- The `TASK-049` assessment remains valid and merged; this task only removes
  CI friction introduced by the new automation baseline.

---

Last Updated: 2026-04-05
Assigned To: User + Agent
