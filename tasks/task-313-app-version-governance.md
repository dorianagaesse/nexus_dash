# TASK-313 App Version Governance

## Status
Complete once PR #329 merges.

## Source
- User feedback on 2026-06-06: the app used to show `0.1.<commit>` and now
  constantly shows `0.2.0`, so the visible version feels unprincipled and does
  not increment with shipped work.
- Existing context:
  - TASK-087 added product metadata visibility.
  - TASK-272 added a release-version policy and helper script.
  - TASK-132 made `package.json` the canonical product version and moved commit
    SHA into build metadata instead of the visible product version.

## Problem
The current implementation follows the idea that `package.json` is the product
version, but the workflow does not operationalize version increments. As a
result, many meaningful PRs can ship while the visible production app remains
`v0.2.0`, which weakens release communication, support/debugging, and user trust.

At the same time, going back to `0.1.<commit>` would blur product version and
build revision. That is not the right industry-standard model. The product
version should express release intent; commit SHA/build ID should express the
exact artifact.

## Goal
Create a durable versioning system where NexusDash:
- follows SemVer-compatible product versions;
- increments the product version intentionally for production releases;
- keeps build metadata and commit revision available for diagnostics;
- makes the visible app version logical to users;
- gives maintainers a low-friction release process and CI guardrails.

## Selected Direction
- Keep `package.json` as the canonical product version.
- Preserve clean user-facing product display such as `v0.3.0`.
- Preserve diagnostic metadata separately, for example `revision`, commit SHA,
  deployment environment, and build date where available.
- Do not use commit count as part of SemVer. Commit count can describe build
  shape, but not product release intent.
- Define pre-1.0 semantics explicitly:
  - `major`: reserved for the `1.0.0` milestone or breaking public API/contract
    decisions.
  - `minor`: meaningful `feature/*` product capabilities; reset patch to `0`.
  - `patch`: release-impacting `fix/*`, `refactor/*`, and `chore/*` work.
- Add automation so production-bound feature/fix/refactor/chore work cannot
  merge without an intentional version decision, matching package-lock
  metadata, and release notes.

## Acceptance Criteria
1. A clear versioning policy exists in the repo and explains product version vs
   build/revision metadata.
2. The app version display follows that policy and remains useful for users and
   diagnostics.
3. Release tooling can increment `package.json` and `package-lock.json`
   predictably for patch/minor/major or an explicit target.
4. CI or repository automation prevents accidental production-bound stagnation
   at `0.2.0` after meaningful feature/fix work.
5. Changelog/release-note expectations are connected to version increments.
6. Existing deployment metadata remains deterministic for previews and
   production.
7. Tests cover version metadata formatting and any new release/version guard.

## Definition Of Done
- [x] Existing TASK-272/TASK-132 decisions are reviewed and either preserved,
      amended, or superseded with a documented rationale.
- [x] Versioning policy and runbook updates are ready for review.
- [x] Release/version automation or CI guardrails are implemented.
- [x] App metadata tests cover product version and build metadata behavior.
- [x] `npm run release:version -- feature --dry-run` passes.
- [x] `npm run lint`, relevant tests, and `npm run build` pass.
- [x] A PR is opened, Copilot feedback is handled, and the task is marked
      complete only after merge.

## Initial Implementation Notes
- Start by reading:
  - `docs/runbooks/release-versioning.md`
  - `scripts/release-version.mjs`
  - `lib/app-metadata.ts`
  - `.github/workflows/*`
  - prior journal entries for TASK-272 and TASK-132
- Be careful not to treat every preview commit as a product release. Preview
  builds should remain identifiable by revision, while production releases
  should have coherent product versions.
