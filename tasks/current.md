# Current Task: TASK-132 Version Update System Adjustments

## Task ID
TASK-132

## Status
Implemented locally on branch `feature/task-132-version-update-system`;
preview/PR handoff pending.

## Source
- `tasks/backlog.md` pending entry:
  "Version update system adjustments - align version metadata, automation, and
  release communication."
- Existing product metadata surface from TASK-087:
  `lib/app-metadata.ts`, `components/app-metadata-pill.tsx`, and
  `tests/lib/app-metadata.test.ts`.
- Existing maintenance/release automation:
  `.github/dependabot.yml`, `.github/workflows/dependabot-auto-triage.yml`,
  `.github/workflows/dependabot-repair-agent.yml`, and
  `.github/workflows/deploy-vercel.yml`.
- Existing operating context:
  `agent.md`, `project.md`, `README.md`, `tasks/task-116-*.md`, and
  `adr/decisions.md`.

## Objective
Make the app's version/update story coherent across runtime metadata,
dependency maintenance, release/deploy operations, and user-facing visibility.
The running app should expose a predictable version and revision label, release
operators should know how that label is set during preview and production
deploys, and future API/agent-facing surfaces should have a documented source
of truth for build and release metadata.

## Current Baseline
- `package.json` is fixed at `0.1.0`; `lib/app-metadata.ts` falls back to that
  value when `APP_VERSION` or `NEXT_PUBLIC_APP_VERSION` is absent.
- Runtime revision labels come from `VERCEL_GIT_COMMIT_SHA`, `GITHUB_SHA`, or
  `COMMIT_SHA`, shortened to seven characters.
- The metadata pill always renders in top-right controls and links to the
  repository, but README only documents `APP_VERSION` and `APP_REPOSITORY_URL`
  in `.env.example`, not the release/version operating model.
- Vercel deploy workflows do not explicitly inject `APP_VERSION` or
  `COMMIT_SHA`; production and preview version labels therefore depend on
  ambient Vercel/GitHub variables and the unchanged package version.
- Dependabot maintenance has a separate operating model, but dependency-update
  cadence and release/version communication are not tied together in docs.

## Scope
- Audit the current metadata implementation and decide the source of truth for:
  app version, build revision, repository URL, deployment environment, and any
  release label shown to users or exposed to API/agent consumers.
- Adjust metadata helpers so labels are deterministic and defensible for local,
  CI, preview, and production contexts.
- Update deploy automation if needed so preview/staged-production deployments
  pass explicit version/revision inputs instead of relying on ambiguous ambient
  state.
- Update documentation so operators understand when to bump `package.json`
  version, when `APP_VERSION` should be set, how Dependabot updates relate to
  product releases, and how to validate the running version after deploy.
- Add or update tests around metadata normalization, fallback order, and any
  newly exposed metadata contract.

## Likely Touchpoints
- `lib/app-metadata.ts`
- `components/app-metadata-pill.tsx`
- `tests/lib/app-metadata.test.ts`
- `.github/workflows/deploy-vercel.yml`
- `.env.example`
- `README.md`
- `docs/runbooks/vercel-env-contract-and-secrets.md`
- `tasks/backlog.md`
- `journal.md`

## Acceptance Criteria
1. Runtime metadata has an explicit source-of-truth order for version,
   revision, repository URL, and environment/release context.
2. Local, CI, Vercel preview, staged production, and promoted production labels
   are deterministic and covered by focused tests where practical.
3. The in-app metadata pill remains useful without exposing secrets or noisy
   internal implementation details.
4. Deploy workflow summaries or environment injection make it clear which
   version/revision was built and deployed.
5. Documentation explains the release/version operating model, including how
   dependency-update PRs differ from intentional product version bumps.
6. Any API/agent-facing metadata decision is either implemented consistently or
   recorded as explicitly out of scope/follow-up.
7. `tasks/current.md`, `tasks/backlog.md`, and `journal.md` are updated to
   reflect the implementation and validation outcome.

## Definition Of Done
- TASK-132 changes are implemented on the dedicated branch.
- Focused metadata/workflow tests pass.
- Repository validation baseline passes unless a blocker is documented:
  `npm run lint`, `npm test`, `npm run test:coverage`, and `npm run build`.
- Preview validation is run if deploy workflow behavior or visible app metadata
  changes require branch-scoped runtime evidence.
- Documentation reflects the final contract and does not leave versioning
  behavior implicit.
- The branch is pushed, a PR is opened, Copilot/check feedback is monitored,
  and the handoff includes the delivered commit SHA.

## Implementation Summary
- Bumped the product version from `0.1.0` to `0.2.0` in `package.json` and
  `package-lock.json`.
- Changed app metadata so the visible version label is a clean product version
  (`v0.2.0`) while revision, environment, and build details remain structured
  diagnostic metadata.
- Updated the Vercel deploy workflow to resolve `APP_VERSION`, `APP_ENV`,
  `COMMIT_SHA`, and `APP_REPOSITORY_URL` from the checked-out ref and pass them
  through build/deploy operations.
- Documented the release/version operating model in README and the Vercel env
  runbook.

## Validation Plan
- `npm test -- --run tests/lib/app-metadata.test.ts` - passed
- `npm run lint` - passed
- `npm test` - passed with local temporary PostgreSQL on port `55432`
- `npm run test:coverage` - passed with local temporary PostgreSQL on port
  `55432`
- `npm run build` - passed after `npx prisma generate` refreshed the local
  Prisma client
- `git diff --check` - passed
- If deploy workflow behavior changes:
  `gh workflow run deploy-vercel.yml -f action=deploy-preview -f git_ref=feature/task-132-version-update-system`,
  then verify the workflow logs and preview metadata label match the active
  branch/revision.

## Out Of Scope
- Building a public changelog or release-notes product surface unless required
  to make the metadata contract coherent.
- Changing Dependabot's safe-lane or Copilot repair policy beyond documenting
  how dependency updates relate to release communication.
- Introducing public API version negotiation beyond documenting how future
  API/agent surfaces should consume app/release metadata.
- Changing the staged production promote/rollback strategy from TASK-042.

## Decisions
- `package.json` is the canonical product-version source in git.
- `APP_VERSION` remains an override/injected deploy value, not the primary
  release authority.
- The visible app metadata pill shows only the clean product version
  (`vX.Y.Z`). Commit SHA/revision stays available as diagnostic metadata, not
  appended to the visible version.
- TASK-132 will not add a user-facing release notes path.
- TASK-132 will not expose build/revision metadata through agent/OpenAPI
  surfaces. Future API/agent metadata should reuse `lib/app-metadata.ts` and
  expose structured fields rather than parsing the UI label.
