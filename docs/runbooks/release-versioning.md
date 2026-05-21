# Release Versioning Runbook

This runbook defines how NexusDash product versions move, how release evidence
is captured, and when the app should graduate from `0.x.y` to `1.0.0`.

## Principles

- `package.json` is the canonical product-version source.
- `package-lock.json` must match `package.json` for every release PR.
- The app displays the clean product version, for example `v0.2.1`.
- Commit SHA, deployment URL, workflow run, and environment are build/revision
  evidence. Do not append them to the user-facing version label.
- Routine task, dependency, workflow, or documentation PRs do not automatically
  bump the product version. Version bumps happen in intentional release PRs.

## Pre-1.0 Bump Rules

Use `0.x.y` while NexusDash is still before its first stable product baseline.

- Patch: bump `0.2.0` to `0.2.1` for bug fixes, operational corrections,
  small copy/UI polish, and low-risk improvements.
- Minor: bump `0.2.1` to `0.3.0` for meaningful user-facing capabilities,
  workflow changes, or a planned batch of feature work.
- Hold steady: do not bump for Dependabot PRs, routine CI cleanup, runbook-only
  clarifications, or task-tracking updates unless they are part of a release.
- Major: reserve `1.0.0` for the first stable product baseline.

## 1.0.0 Readiness

Move to `1.0.0` when the team is ready to preserve the core product contract:

- Authentication and account flows are stable.
- Project/task collaboration workflows are reliable enough for everyday use.
- Data safety, tenant boundaries, and forced RLS behavior have been validated.
- Notification behavior has predictable in-app and email semantics.
- Production deploy, staged promotion, rollback, and secret/env operations are
  documented and repeatable.
- Known breaking workflow or schema changes are either resolved or explicitly
  accepted as post-1.0 migration work.

## Release PR Checklist

1. Decide the next product version using the bump rules above.
2. Run the helper in dry-run mode:

   ```bash
   npm run release:version -- patch --dry-run
   ```

3. Apply the selected bump:

   ```bash
   npm run release:version -- patch
   ```

   Use `minor`, `major`, or an explicit version such as `0.3.0` when needed.

4. Add or update the matching entry in `CHANGELOG.md`.
5. Keep the release PR focused on release metadata, release notes, and any
   small release-only documentation updates.
6. Validate:

   ```bash
   git diff --check
   npm run lint
   ```

7. After the PR merges, create the matching git tag, for example:

   ```bash
   git tag v0.2.1
   git push origin v0.2.1
   ```

8. Confirm the staged-production deployment summary reports the intended
   `APP_VERSION` and short revision before promotion.
9. Promote the staged deployment intentionally, or roll it back if validation
   fails.

## Release Evidence

Each production release should be traceable to:

- product version, for example `v0.2.1`
- release PR
- git tag
- merge commit SHA
- staged-production deployment URL or ID
- workflow run that produced the deployment
- promotion or rollback decision

This evidence can live in the release PR, `CHANGELOG.md`, or a dated file under
`docs/releases/` if a release needs more detail than the changelog entry.
