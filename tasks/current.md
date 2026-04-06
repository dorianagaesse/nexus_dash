# Current Task: TASK-116 CI Maintenance - Dependabot Upgrade Follow-Through

## Task ID
TASK-116

## Status
Implementation in progress

## Objective
Keep the dependency automation introduced by `TASK-061` trustworthy end to end:
first by fixing the branch-name gate for Dependabot PRs, then by handling the
first real upgrade failures that automation surfaced.

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
- Current focus: repair the first two failing dependency PRs surfaced after the
  policy fix:
  - `PR #120` React 19 upgrade compatibility
    - replacement branch in progress: `chore/task-116-react-19-compat`
  - `PR #121` Next 16 upgrade compatibility
- Record outcomes, validation, and any superseding replacement PRs in
  `journal.md`.

## Acceptance Snapshot
- Valid Dependabot PRs no longer fail branch naming just because their branches
  start with `dependabot/`.
- Human contributors still cannot bypass the normal branch prefixes.
- The repo guidance is explicit about the exception.
- `PR #120` and `PR #121` each have a credible path forward:
  - either repaired and replaced with green repo-owned PRs
  - or clearly documented as coordinated follow-up work if the upgrade proves
    too broad for a narrow fix

## Validation / Evidence Expectations
- Workflow-policy evidence should point to the merged branch-name logic and
  repo guidance.
- Dependency-fix evidence should include the actual compatibility diagnosis and
  the relevant local validation commands for each repaired upgrade branch.
- Current React-19 branch evidence:
  - `npm run lint` passes
  - `npm run build` passes after aligning a nullable menu ref type in
    `app/projects/projects-grid-client.tsx`
  - local `npm test` is currently blocked by a `jsdom@29.0.1` fork-worker
    startup issue on this workstation's Node `20.17.0`, which appears
    environment-specific rather than caused by the React diff itself

## Notes
- This remains a workflow/dependency-maintenance task under `TASK-116`, not a
  reopening of `TASK-061`.
- The immediate execution order is deliberate:
  1. React 19 / `PR #120`
  2. Next 16 / `PR #121`
- The original Dependabot branches are not maintainer-writable, so repaired
  upgrades may need to ship as repo-owned replacement PRs that explicitly
  supersede the bot PRs.

---

Last Updated: 2026-04-06
Assigned To: User + Agent
