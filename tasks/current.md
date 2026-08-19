# Current Task

## TASK-370: Preview Authentication and Database Isolation Guardrails

## Status

Complete on `fix/task-370-preview-auth-isolation`; validated on the immutable
Vercel Preview deployment and delivered through PR #432.

## Context

Authentication from a URL believed to be a preview reached production and a
signup reported an email already present in the production user database.
Investigation confirmed that the tested Vercel alias currently targets a
production deployment. The Vercel Preview environment also retained that alias
as `NEXTAUTH_URL`, so preview auth callbacks and generated links could select a
stale production origin even when the immutable deployment itself was a real
preview. Preview and production currently use distinct Supabase project refs,
but the deployment contract does not pin either environment to its intended
ref or verify the deployed target before publishing the preview URL.

## Scope

- Resolve request origins from the current immutable Vercel deployment host in
  preview instead of using a static `NEXTAUTH_URL`.
- Pin production-like runtimes to an explicitly configured expected Supabase
  project ref and reject cross-environment database routing at startup.
- Validate the preview migration target, Vercel deployment target, deployed
  environment/revision metadata, and database readiness before uploading the
  preview URL artifact.
- Remove stale Vercel Preview origin/redirect overrides (`NEXTAUTH_URL` and
  OAuth callback URLs) and configure expected project-ref metadata for Preview
  and Production.
- Exercise signup/signin on the fixed preview without touching production.

## Acceptance Criteria

1. A preview request resolves auth callback/link origins to that preview's
   immutable `VERCEL_URL`, never the production domain or a stale alias.
2. Preview and production fail closed when their runtime Supabase project ref
   does not match `EXPECTED_SUPABASE_PROJECT_REF`.
3. The preview deploy workflow rejects a non-preview Vercel target, a revision
   mismatch, an environment mismatch, an unreachable database, or a migration
   connection aimed at the wrong Supabase project.
4. The workflow artifact contains the immutable URL of the exact requested
   branch deployment only after all preview checks pass.
5. A new account can sign up and sign back in on the fixed preview while the
   browser remains on the preview origin.
6. Existing production routing and trusted-origin behavior remain unchanged.

## Definition Of Done

- Focused origin, runtime-environment, health-route, and deploy-validation
  coverage passes.
- `npm run lint`, `npm run rls:check`, `npm test`, `npm run test:coverage`,
  `npm run build`, and relevant deployed-preview Playwright checks pass.
- Vercel/GitHub environment metadata is configured without exposing secrets.
- The branch preview workflow completes for the explicit branch ref and its
  logs prove the checked-out ref and validated Preview target.
- A ready-for-review PR is open; required checks and initial Copilot review are
  complete; actionable threads are resolved before merge.
- `tasks/current.md`, `tasks/backlog.md`, relevant runbooks, and `journal.md`
  record the diagnosis and validation outcome.

## Runtime Assumptions

- Preview and production remain separate Supabase projects; their project refs
  are safe non-secret deployment metadata while connection strings stay secret.
- GitHub `preview` and `production` environments and the corresponding Vercel
  environments are available to configure `EXPECTED_SUPABASE_PROJECT_REF`.
- Preview validation uses the immutable URL emitted by `deploy-vercel.yml`, not
  a branch alias or a historical Vercel URL.

## Validation Evidence

- Workflow run `32313383142` checked out the explicit fix branch, applied
  staging migrations, verified Preview target/revision/environment/database
  readiness, and published
  `https://nexus-dash-h1s18isxe-dorian-agaesses-projects.vercel.app`.
- The deployed opt-in Playwright case created a staging account, signed out,
  signed back in, and remained on that immutable origin.
- Lint, RLS inventory, unit/API, coverage, build, and CI Playwright validation
  passed. Copilot's initial review completed; its environment-restoration
  comment was applied and covered by the focused request-origin test.
