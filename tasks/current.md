# Current Task: TASK-313 App Version Governance

## Task ID
TASK-313

## Status
Pending investigation and implementation.

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

## Scope
- Review current versioning implementation, docs, workflows, and release helper.
- Decide the release policy: per-production-merge patch bumps vs batched release
  PRs, with explicit tradeoffs.
- Implement the selected policy with automation and CI/release guardrails.
- Ensure visible app metadata and diagnostic metadata match the policy.
- Update docs/runbooks/changelog expectations.
- Add tests for version metadata and any guard logic.

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
- [ ] Existing TASK-272 and TASK-132 decisions are reviewed.
- [ ] Policy and implementation path are documented.
- [ ] Version increment automation or CI guardrails are implemented.
- [ ] App metadata behavior remains tested.
- [ ] Relevant validation passes.
- [ ] PR workflow is completed according to `agent.md`.
