# Changelog

Product releases use SemVer-style pre-1.0 versioning. Keep build identity
separate from product version: release entries describe `v0.x.y`, while commit
SHA, deployment URL, and workflow run belong in release evidence.

## Unreleased

- Define each release entry before the product-impacting PR is merged.

## v0.19.2 - 2026-06-19

- Restored the green production dependency-security audit by updating the
  Prisma development-tooling Hono override to a patched release.
- Refreshed patchable development-tooling transitive dependencies so the full
  npm audit also reports zero vulnerabilities.
- Preserved Prisma 7.8 and the Node 20.19 runtime baseline while documenting
  that the affected Hono packages are confined to Prisma CLI tooling and are
  not imported by the deployed NexusDash request runtime.

## v0.19.1 - 2026-06-18

- Prefetched project agent credentials when the settings modal opens so the
  Agent access tab no longer waits to begin its first load.
- Added an explicit initial credential loading state and contained long
  credential IDs, audit request paths, project IDs, and quickstart values
  within the settings modal.

## v0.19.0 - 2026-06-08

- Added a project-scoped Meeting Notes workspace with structured preparation
  inputs, task-style labels, explicit label filtering, participants,
  after-meeting outputs, personal todos, and overdue todo highlighting.
- Added searchable meeting-note history on the project dashboard so previous
  discussions can be found by title, participant, label, notes, or todos, with
  done notes shown in a separate archived list.
- Added meeting-note persistence, RLS-protected project APIs, dashboard stats,
  and Playwright coverage for the core meeting-notes workflow.

## v0.18.0 - 2026-06-08

- Corrected the app product version after auditing the merge history from
  TASK-132/#270 (`v0.2.0`) through TASK-313/#329.
- Backfilled the branch-based SemVer policy across shipped non-doc feature
  work so the current app version reflects the product capabilities already
  delivered instead of only the version-governance PR.
- Recorded the reconciliation basis in
  `docs/releases/version-reconciliation-2026-06-08.md`.

## v0.3.0 - 2026-06-06

- Added product version governance so feature branches bump minor versions,
  release-impacting fix/refactor/chore branches bump patch versions, and
  commit/build details remain diagnostic metadata instead of visible product
  version components.
- Added a CI guard that validates package version consistency, branch-based
  SemVer bumps, and matching changelog entries for production-bound PRs.
- Improved the release helper with branch-type aliases such as `feature`,
  `fix`, `refactor`, and `chore`.

## v0.2.0 - 2026-05-20

- Made `package.json` the canonical product-version source.
- Changed the app metadata pill to show a clean product version instead of
  appending commit SHA build metadata to the visible label.
- Kept commit SHA, runtime environment, and repository URL as diagnostic
  deployment metadata.
- Updated Vercel deploy workflows to inject `APP_VERSION`, `APP_ENV`,
  `COMMIT_SHA`, and `APP_REPOSITORY_URL` from the checked-out ref.
