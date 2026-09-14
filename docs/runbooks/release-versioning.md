# Release Versioning Runbook

This runbook defines how NexusDash product versions move, how a production
release boundary is prepared, and when the app should graduate from `0.x.y`
to `1.0.0`.

## Principles

- The product version identifies a cohesive production release — not an
  individual PR, branch, or commit.
- Commit SHA, deployment URL, workflow run, and environment are build/revision
  evidence. Do not append them to the user-facing version label.
- `package.json` is the canonical product-version source; `package-lock.json`
  moves with it in the same release-preparation PR.
- Product PRs (`feature/*`, `fix/*`, `refactor/*`, `docs/*`, `chore/*`,
  `dependabot/*`) merge without touching the version. One production release
  can contain many product PRs.
- The product version moves only at a release-preparation boundary: a
  dedicated `chore/release-vX.Y.Z` PR that selects the version and composes the
  `CHANGELOG.md` entry. CI enforces both sides of this contract.
- The app keeps displaying the clean `vX.Y.Z` format.

## The Release Boundary

A production release is cut in this order:

1. Product PRs merge into `main` normally. They change no version metadata;
   `release:check` rejects product-version changes outside release
   preparation.
2. When the maintainer decides the merged work should ship as a cohesive
   release, a release-preparation PR is created on
   `chore/release-vX.Y.Z` from the latest `main` (see the procedure below).
3. CI (`release:check`) validates the release boundary. The PR is reviewed and
   merged like any other.
4. The release is tagged: `vX.Y.Z` on the release merge commit.
5. The staged production deployment built from that commit is verified
   (`APP_VERSION` plus short revision) and promoted — or rolled back.
6. Release evidence is recorded (see below).

Between two release boundaries, staged deployments carry the last released
version plus a newer commit SHA. That is expected: the version label describes
the release, the SHA identifies the exact build.

## Deciding the Version

Keep pre-1.0 `0.x.y` until the first stable product baseline.

- **Minor** (`0.73.0` → `0.74.0`): the release contains at least one meaningful
  new user-facing capability, workflow change, or milestone-level product work.
- **Patch** (`0.73.0` → `0.73.1`): the release contains only bug fixes,
  operational corrections, performance work, polish, or other low-risk
  improvements.
- **Hold** (no version move): the default state for every merged product PR.
  The version stays put until a release-preparation PR moves it. Maintainers
  may also hold a boundary deliberately to accumulate more PRs into one
  release.
- **Major** (`1.0.0`): reserved for the first stable product baseline. See the
  readiness list below.
- **Hotfix**: merge the fix PR to `main` like any other product PR (no version
  change), then prepare an immediate patch release.

## Parallel PRs and In-Flight Work

- Product PRs never change `package.json` / `package-lock.json`, so they can
  merge in any order without version conflicts — the friction this workflow
  removes.
- Only release-preparation PRs can conflict on version metadata. If `main`
  advances to or past the prepared version while a release PR is open, CI
  fails the release PR deliberately; rebase it and re-prepare the next
  version.
- Product PRs opened against an older `main` still pass: their version
  metadata matches their base.

## Release-Preparation Procedure

1. Start from the latest `main`:

   ```bash
   git switch -c chore/release-v0.74.0 origin/main
   ```

2. Select the version with the helper (dry-run first):

   ```bash
   npm run release:version -- minor --dry-run
   npm run release:version -- minor
   ```

   Accepts `minor`, `patch`, `major`, or an explicit version such as `0.74.0`.
   The helper updates `package.json` and `package-lock.json` together and
   refuses to run if they disagree.

3. Compose the release entry in `CHANGELOG.md`: a `## v0.74.0 - <date>`
   section with at least one bullet describing what the release contains,
   written from the merged PRs since the previous tag.

4. Optional: add `docs/releases/v0.74.0.md` when the release needs more detail
   than a changelog entry.

5. Validate locally:

   ```bash
   git diff --check
   npm run release:check -- --base origin/main --branch chore/release-v0.74.0
   npm run lint
   ```

6. Open the release-preparation PR. It is metadata-only: `package.json`,
   `package-lock.json`, `CHANGELOG.md`, `journal.md`, and `docs/releases/**`
   are the only files it may touch. New product changes go in their own PR.

7. After the PR merges, create the tag (see Tagging) and promote the release
   (see Promotion and Rollback).

## CI Enforcement

`npm run release:check` runs on every PR through the Quality Gates workflow:

- `package.json` and `package-lock.json` must agree on the version, on base
  and head.
- Non-release branches: the version must equal the base version. A version
  change fails with a pointer to the release-preparation workflow.
- Release-preparation branches (`chore/release-vX.Y.Z`, optional `-suffix`):
  - the branch name, `package.json`, and `package-lock.json` must carry
    exactly the claimed version
  - the version must be greater than the current `main` version
  - `CHANGELOG.md` must contain a matching `## vX.Y.Z` section with at least
    one entry bullet
  - the changed-file set must stay inside the metadata-only allowlist
- Dependabot PRs follow the same no-bump rule automatically: dependency
  updates never move the product version, and the auto-merge lanes keep
  passing because no bump is required.

The historical `no-release-impact` / `release:none` PR labels are obsolete:
no product PR carries a version decision anymore.

## Tagging

Tag the release-preparation merge commit after it lands on `main`:

```bash
git switch main
git pull --ff-only
node -p "require('./package.json').version"   # confirm vX.Y.Z
git tag -a v0.74.0 -m "NexusDash v0.74.0"
git push origin v0.74.0
```

The tag must match the `package.json` version at that commit; never tag a
commit whose version was not prepared through this workflow.

## Promotion and Rollback

- Pushing `main` triggers the staged production deployment
  (`.github/workflows/deploy-vercel.yml`).
- Promote only the staged deployment built from the release-preparation merge
  commit: check the workflow summary `APP_VERSION` and short revision against
  the tag and merge SHA, then promote:

  ```bash
  gh workflow run deploy-vercel.yml -f action=promote
  ```

- If validation fails, roll back with the workflow's `rollback` action. A
  production defect discovered after promotion is fixed by a `fix/*` PR
  (no version change) and shipped as an immediate patch release-preparation
  PR; roll back the deployment first if the regression is severe.

## Release Evidence

Each production release should be traceable to:

- product version, for example `v0.74.0`
- release-preparation PR
- git tag
- release merge commit SHA
- staged-production deployment URL or ID
- workflow run that produced the deployment
- promotion or rollback decision

This evidence can live in the release-preparation PR, `CHANGELOG.md`,
`journal.md`, or a dated file under `docs/releases/`.

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

Prepare `1.0.0` as a normal release-preparation PR
(`chore/release-v1.0.0`, `npm run release:version -- 1.0.0`).

## Historical Reconciliations

`docs/releases/version-reconciliation-2026-06-08.md` records a past
version-behind-history reconciliation. Future corrections follow the normal
release-preparation path: prepare the release that carries the correct
version, and note the reconciliation in `docs/releases/` if it needs context.
