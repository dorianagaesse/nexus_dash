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
- Landed: repo-owned replacement PR `#127` now supersedes Dependabot `#120`
  for the React 19 compatibility upgrade and is merged on `main`.
- Landed: repo-owned replacement PR `#128` now supersedes Dependabot `#121`
  for the Next 16 compatibility upgrade and is merged on `main`.
- Current focus: close the last stale red Dependabot branch by treating
  `PR #123` (ESLint 10) as a deliberate defer, because the current Next 16
  lint stack is green on ESLint 9 but still incompatible with the ESLint 10
  major line.
- Current focus: codify that defer in `.github/dependabot.yml` so the next
  scheduled Dependabot run does not reopen the same blocked major upgrade
  before the upstream lint stack catches up.
- Record outcomes, validation, and any superseding replacement PRs in
  `journal.md`.

## Acceptance Snapshot
- Valid Dependabot PRs no longer fail branch naming just because their branches
  start with `dependabot/`.
- Human contributors still cannot bypass the normal branch prefixes.
- The repo guidance is explicit about the exception.
- `PR #120`, `PR #121`, and `PR #123` each have a credible path forward:
  - `#120` is superseded by replacement PR `#127`
  - `#121` is repaired on a repo-owned replacement branch/PR
  - `#123` is explicitly deferred with a recorded compatibility reason and an
    ignore rule that prevents repeated red reopenings

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

## Notes
- This remains a workflow/dependency-maintenance task under `TASK-116`, not a
  reopening of `TASK-061`.
- The immediate execution order is deliberate:
  1. React 19 / `PR #120` -> replacement PR `#127`
  2. Next 16 / `PR #121` -> replacement PR `#128`
- The original Dependabot branches are not maintainer-writable, so repaired
  upgrades need to ship as repo-owned replacement PRs that explicitly
  supersede the bot PRs.
- I have not found a repo-local Dependabot setting that makes bot branches
  maintainer-writable; handling blocked majors through repo-owned replacement
  PRs or explicit ignore rules remains the practical path today.

---

Last Updated: 2026-04-06
Assigned To: User + Agent
