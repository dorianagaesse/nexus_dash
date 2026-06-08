# Release Versioning Runbook

This runbook defines how NexusDash product versions move, how release evidence
is captured, and when the app should graduate from `0.x.y` to `1.0.0`.

## Principles

- `package.json` is the canonical product-version source.
- `package-lock.json` must match `package.json` for every product version bump.
- The app displays the clean product version, for example `v0.2.1`.
- Commit SHA, deployment URL, workflow run, and environment are build/revision
  evidence. Do not append them to the user-facing version label.
- Commit count is not part of the product version. A large PR and a small PR
  may both be one product release; commit SHA remains the exact build identity.
- Product-impacting PRs carry their version decision in the same PR so the
  production app cannot silently ship meaningful work forever under the same
  version.

## Pre-1.0 Bump Rules

Use `0.x.y` while NexusDash is still before its first stable product baseline.

- Minor: bump `0.2.0` to `0.3.0` for `feature/*` PRs that ship meaningful
  user-facing capabilities, workflow changes, or milestone-level product work.
- Patch: bump `0.3.0` to `0.3.1` for `fix/*`, `refactor/*`, and
  production-impacting `chore/*` PRs that ship bug fixes, operational
  corrections, performance work, small copy/UI polish, or low-risk
  improvements.
- Hold steady: do not bump for Dependabot PRs, routine CI cleanup, runbook-only
  clarifications, or task-tracking updates unless they are part of a release.
  If a production-bound branch is intentionally no-release-impact, label the PR
  `no-release-impact` or `release:none`.
- Major: reserve `1.0.0` for the first stable product baseline.

## PR Version Decision Rules

Every product-impacting PR must make exactly one version decision:

- `feature/*`: bump minor and reset patch, for example `0.2.0` to `0.3.0`.
- `fix/*`: bump patch, for example `0.3.0` to `0.3.1`.
- `refactor/*`: bump patch when the refactor ships production behavior or
  runtime risk.
- `chore/*`: bump patch only when product/runtime files change.
- `docs/*`: normally hold steady.
- `dependabot/*`: hold steady unless a human explicitly converts the update
  into a product release.

The CI `release:check` guard validates these rules for PRs:

- `package.json` and `package-lock.json` must agree.
- The expected SemVer bump must match the branch type.
- Version bumps must include a matching `CHANGELOG.md` entry.
- A production-bound PR without a version bump must carry an explicit
  `no-release-impact` or `release:none` label.

Historical reconciliation is the one version-only exception: when maintainers
discover that the current product version is already behind shipped history, use
a `chore/*` PR with an explicit target version, matching package-lock metadata,
a changelog entry, and a reconciliation note under `docs/releases/`. Because
that PR changes release metadata rather than shipping new product runtime files,
`release:check` validates that the target is greater than the base version and
that release notes exist, without forcing the normal patch/minor branch mapping.

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

## Version Checklist

1. Decide the next product version using the bump rules above.
2. Run the helper in dry-run mode:

   ```bash
   npm run release:version -- feature --dry-run
   ```

3. Apply the selected bump:

   ```bash
   npm run release:version -- feature
   ```

   Use `fix`, `refactor`, `chore`, `patch`, `minor`, `major`, or an explicit
   version such as `0.3.0` when needed.

4. Add or update the matching entry in `CHANGELOG.md`.
5. Keep the version/changelog change in the same product-impacting PR unless
   the PR is explicitly no-release-impact.
6. Validate:

   ```bash
   git diff --check
   npm run release:check -- --base origin/main --branch <branch-name>
   npm run lint
   ```

7. After the PR merges, create the matching git tag, for example:

   ```bash
   git tag v0.3.0
   git push origin v0.3.0
   ```

8. Confirm the staged-production deployment summary reports the intended
   `APP_VERSION` and short revision before promotion.
9. Promote the staged deployment intentionally, or roll it back if validation
   fails.

## Release Evidence

Each production release should be traceable to:

- product version, for example `v0.2.1`
- product-impacting PR
- git tag
- merge commit SHA
- staged-production deployment URL or ID
- workflow run that produced the deployment
- promotion or rollback decision

This evidence can live in the product-impacting PR, `CHANGELOG.md`, or a dated
file under `docs/releases/` if a release needs more detail than the changelog
entry.
