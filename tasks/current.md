# Current Task: TASK-313 App Version Governance

## Task ID
TASK-313

## Status
Implemented locally; PR workflow pending.

## Source
- User feedback on 2026-06-06: the app previously showed `0.1.<commit>` and
  now constantly shows `0.2.0`; the version number has no visible logic and
  should increment according to an industry-standard approach.
- Existing completed tasks:
  - TASK-087 exposed product metadata in the app.
  - TASK-272 defined a release-version cadence and helper.
  - TASK-132 made `package.json` the canonical product version and separated
    user-facing version from commit SHA.

## Objective
Review and fix NexusDash app version governance so the product version follows
SemVer-compatible release logic, increments predictably for production releases,
and keeps build/revision metadata separate and useful for diagnostics.

## Initial Position
`v0.2.0` being stable is understandable technically because `package.json` is
the canonical product version. The missing piece is process enforcement: no
release/version decision is currently required after meaningful shipped work.

Going back to `0.1.<commit>` would also be wrong: commit SHA/build revision is
not the same as product version. The right target is a clear product release
version plus diagnostic revision metadata.

## Selected Policy
- Keep `package.json` as the canonical product version.
- Keep commit SHA/build metadata separate from the visible product version.
- Do not use commit count in SemVer; it is repository/build metadata, not
  release intent.
- `feature/*` PRs that ship meaningful product work bump minor and reset patch,
  for example `0.2.0` to `0.3.0`.
- Release-impacting `fix/*`, `refactor/*`, and `chore/*` PRs bump patch, for
  example `0.3.0` to `0.3.1`.
- `docs/*`, Dependabot, routine CI cleanup, and task-tracking-only work hold
  steady unless explicitly converted into a product release.
- `1.0.0` remains reserved for the first stable product baseline.

## Implementation Summary
- Added `scripts/check-version-policy.mjs` and `npm run release:check`.
- Wired the version policy guard into the PR Quality Core workflow.
- Extended `scripts/release-version.mjs` with branch-type aliases:
  `feature`, `fix`, `refactor`, and `chore`.
- Bumped the app product version from `0.2.0` to `0.3.0` for this
  `feature/*` implementation PR.
- Updated release/version docs, README metadata guidance, changelog, and app
  metadata tests.
- Added guard tests that exercise feature minor bumps, fix patch requirements,
  changelog enforcement, and docs-only no-bump behavior.

## Out Of Scope
- Changing dependency package versions for their own sake.
- Reintroducing commit SHA as the primary user-facing product version.
- A full public release-management platform beyond the lightweight process
  NexusDash needs today.

## Acceptance Criteria
1. A clear versioning policy exists and explains product version vs
   build/revision metadata.
2. The visible app version follows that policy and no longer stagnates
   accidentally after meaningful production releases.
3. Release tooling can increment `package.json` and `package-lock.json`
   predictably.
4. CI/release automation catches missing version decisions for production-bound
   feature/fix work.
5. Changelog/release-note expectations are tied to version increments.
6. Preview and production build metadata remain deterministic and useful for
   debugging.
7. Tests cover the implemented version metadata and guard behavior.

## Definition Of Done
- [x] Existing TASK-272 and TASK-132 decisions are reviewed.
- [x] Policy and implementation path are documented.
- [x] Version increment automation or CI guardrails are implemented.
- [x] App metadata behavior remains tested.
- [x] Relevant validation passes.
- [ ] PR workflow is completed according to `agent.md`.
