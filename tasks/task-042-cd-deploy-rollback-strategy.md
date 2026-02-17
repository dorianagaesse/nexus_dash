# TASK-042 CD Deployment and Rollback Strategy

## Goal
Introduce a controlled CD baseline with explicit rollback paths using Vercel CLI.

## Scope Implemented
- Added workflow: `.github/workflows/deploy-vercel.yml`
- Automatic CD path:
  - Trigger: successful `Quality Gates` workflow on `main`
  - Action: create staged production deployment (`--prod --skip-domain`)
  - Output: staged deployment URL artifact + job summary
- Manual CD/rollback operations via `workflow_dispatch`:
  - `deploy-preview`
  - `deploy-production-staged`
  - `promote`
  - `rollback`
- Added strict secret preflight validation in workflow for:
  - `VERCEL_TOKEN`
  - `VERCEL_ORG_ID`
  - `VERCEL_PROJECT_ID`
- Updated README with CD + rollback operational model.

## Rollback Strategy
1. Keep production deploy staged by default.
2. Promote only validated staged deployment URLs.
3. Rollback by targeting the previous known-good deployment URL/ID.
4. Use workflow summaries/artifacts for traceability.

## Required Input to Execute in CI
- Repository secrets:
  - `VERCEL_TOKEN`
  - `VERCEL_ORG_ID`
  - `VERCEL_PROJECT_ID`
- Vercel project environment variables:
  - Mirror required runtime vars from `.env.example` into Vercel environments.
  - Ensure `DATABASE_URL` (and other required runtime vars) are configured for Preview/Production.

## Validation
- Workflow file added and schema-level syntax validated by GitHub Actions on PR.
- Local lint/test/build remain covered by existing quality gates.
