# Current Task

## TASK-406: Stable Preview OAuth Alias After Immutable Validation

## Status

Ready for user testing on `fix/task-406-stable-preview-auth-alias` via PR #448.

## Context

TASK-370 correctly removed a stale alias that pointed to production and made
immutable deployment validation authoritative. The follow-up Preview test
showed that social OAuth cannot use a new immutable callback for every deploy:
GitHub rejected the generated `redirect_uri` because the provider application
is registered against the long-lived static Preview URL. The static URL must
therefore remain usable without weakening the immutable deployment checks.
The first TASK-406 deployment exposed a second regression from TASK-370:
removing `AUTH_GITHUB_REDIRECT_URI` also changed the derived callback path from
the registered `/api/auth/callback/github` route to the unregistered
`/api/auth/oauth/github/callback` route.

## Scope

- Add one exact `PREVIEW_AUTH_ORIGIN` allowlist entry for Preview request-origin
  resolution while preserving the immutable `VERCEL_URL` fallback.
- Preserve the existing provider-specific callback contracts: GitHub uses
  `/api/auth/callback/github`, while social Google stays on
  `/api/auth/oauth/google/callback` to avoid the Calendar OAuth route.
- Require a valid HTTPS `PREVIEW_AUTH_ORIGIN` whenever social or Calendar OAuth
  is enabled in Vercel Preview.
- Validate the immutable deployment first, then atomically assign the stable
  alias and verify it resolves to the same deployment and readiness metadata.
- Document which URL is deployment evidence and which URL testers should use
  for provider-backed OAuth.

## Acceptance Criteria

1. A request through the exact configured stable Preview alias generates
   callbacks on that alias; any unconfigured alias falls back to the immutable
   `VERCEL_URL`.
2. Preview startup fails closed when OAuth is enabled without a valid exact
   HTTPS `PREVIEW_AUTH_ORIGIN`.
3. The deploy workflow never moves the stable alias until the immutable target,
   revision, environment, migration project ref, and database readiness pass.
4. After assignment, the workflow proves the alias resolves to that same Vercel
   deployment and repeats environment/revision/database readiness checks.
5. GitHub OAuth initiation from the stable Preview URL is accepted by GitHub
   with the registered `/api/auth/callback/github` URI and does not redirect to
   the production domain.
6. Existing production routing and TASK-370 database isolation remain unchanged.

## Definition Of Done

- Focused request-origin and runtime-environment coverage passes.
- `npm run lint`, `npm run rls:check`, `npm test`, `npm run test:coverage`,
  and `npm run build` pass.
- GitHub Preview environment metadata contains `PREVIEW_AUTH_ORIGIN` without
  exposing credentials.
- The branch preview workflow completes for the explicit branch ref and its
  logs prove the checked-out ref, validated immutable target, and alias target.
- A ready-for-review PR is open; required checks and initial Copilot review are
  complete; actionable threads are resolved before merge.
- `tasks/current.md`, `tasks/backlog.md`, relevant runbooks, and `journal.md`
  record the diagnosis and validation outcome.

## Runtime Assumptions

- The existing static Preview alias is registered in the Preview GitHub and
  Google OAuth applications.
- The alias may move only through the Preview deployment workflow after the
  immutable deployment passes all existing TASK-370 checks.
- `PREVIEW_AUTH_ORIGIN` is non-secret environment metadata; OAuth client secrets
  and database connection strings remain secret.

## Validation Evidence

- Workflow run `32843605455` deployed commit `8df7e1c`, validated immutable
  Preview URL
  `https://nexus-dash-7ykoau18s-dorian-agaesses-projects.vercel.app`, then
  assigned and verified the stable Preview auth alias.
- Both URLs report `APP_ENV=preview`, revision `8df7e1c`, database ready, and
  the same Vercel deployment identity.
- The first unauthenticated provider probe only proved that GitHub would send an
  unauthenticated client to login; the user's authenticated test correctly
  exposed the callback-path mismatch. Corrected deployment evidence and
  user-owned completion of the signed-in OAuth flow are pending before merge.
