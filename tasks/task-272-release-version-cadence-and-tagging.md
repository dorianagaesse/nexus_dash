# TASK-272 Release Version Cadence and Tagging

## Task ID
TASK-272

## Status
Active

## Objective
Turn the TASK-132 app metadata cleanup into an operational release-version
model. NexusDash should keep showing a clean product version, but that version
must move intentionally through pre-1.0 releases and be tied to release notes,
git tags, and staged-production deployment evidence.

## Context
TASK-132 made `package.json` the canonical product-version source and changed
the app metadata pill to display only the clean version, such as `v0.2.0`.
Commit SHA and environment are now diagnostic metadata instead of being appended
to the visible version.

That fixed the misleading `0.1.0+<commit>` behavior, but it left the release
cadence undefined. As a result, every production deployment continues to show
`v0.2.0` until a release PR manually updates `package.json` and
`package-lock.json`.

## Current Behavior
- `package.json` and `package-lock.json` currently declare version `0.2.0`.
- Deploy workflows inject `APP_VERSION` from the checked-out `package.json`.
- The app strips SemVer build metadata from the visible label.
- No release tag or changelog process currently decides when `0.2.0` becomes
  `0.2.1`, `0.3.0`, or eventually `1.0.0`.

## Proposed Release Policy
Use SemVer-style pre-1.0 versioning for the product version:

- `0.x.y` means NexusDash is still before its first stable product baseline.
- Bump `0.2.y` for bug fixes, operational corrections, copy polish, and small
  low-risk improvements shipped after `0.2.0`.
- Bump to `0.3.0`, `0.4.0`, etc. for meaningful product capability milestones
  or batches of user-facing workflow changes.
- Do not bump the product version for every dependency update, CI cleanup, or
  routine task PR unless that PR is intentionally part of a release.
- Move to `1.0.0` only when the core product contract is stable enough to
  preserve: authentication/account flows, project/task collaboration, data
  safety, notification behavior, deploy/rollback path, and supportable user
  expectations.

Keep build identity separate:

- Product version: `v0.2.1`, `v0.3.0`, `v1.0.0`.
- Build/revision: commit SHA, deployment ID, workflow run, or timestamp.
- User-facing app label remains the product version.
- Operator-facing release evidence includes the short commit SHA and deployed
  Vercel target.

## Scope
- Add or update release documentation that defines:
  - pre-1.0 bump rules
  - `1.0.0` readiness criteria
  - release PR checklist
  - post-merge tagging and staged-production promotion steps
  - rollback expectations
- Add a release-notes/changelog convention, either:
  - a root `CHANGELOG.md`, or
  - dated files under `docs/releases/`
- Decide whether release PRs should use plain `npm version <patch|minor>
  --no-git-tag-version` or a small repo script that updates both
  `package.json` and `package-lock.json`.
- Ensure docs distinguish normal task PRs, Dependabot PRs, and release PRs.
- Keep the existing TASK-132 metadata display behavior unless a small
  operator-facing improvement is clearly useful.

## Acceptance Criteria
1. The repo documents exactly when to bump `0.x.y` patch/minor versions and
   when to hold the version steady.
2. The repo documents concrete readiness criteria for the first `1.0.0`
   release.
3. A release PR checklist exists and includes:
   - bump `package.json`
   - bump `package-lock.json`
   - add release notes/changelog entry
   - verify metadata in the staged deployment summary
   - create or plan the matching git tag
   - promote or roll back the staged deployment intentionally
4. Dependabot and routine maintenance PRs are explicitly excluded from product
   version bumps unless they are part of a release PR.
5. The release process preserves the TASK-132 separation between product
   version and build revision.

## Implementation Notes
- Prefer lightweight process over heavy release automation for this stage.
- If adding a script, keep it simple and non-destructive. A likely shape is a
  helper that runs `npm version patch --no-git-tag-version` or
  `npm version minor --no-git-tag-version`, then leaves the release notes and
  commit/tag workflow to the release PR author.
- Consider a first release example:
  - `0.2.1` for the next bugfix/operational release after TASK-271.
  - `0.3.0` for the next meaningful product capability batch.
- Do not reintroduce visible labels like `v0.2.1+abc123`; keep commit identity
  in diagnostic/operator metadata.

## Definition Of Done
- `README.md` and/or a dedicated runbook explains the release-version policy.
- Release notes/changelog convention exists.
- `tasks/backlog.md` points to this brief.
- Any helper script, if added, is documented and covered by basic validation.
- The implementation is opened as a focused PR.

## Validation Plan
- `git diff --check`
- `npm run lint` if code or scripts are touched.
- Run any newly added release helper in a non-committing/dry-run form if it has
  one, or validate the documented command manually without leaving unintended
  version changes.
