# Database Connection Hardening Runbook

## Purpose
Define a safe and repeatable way to configure, rotate, and verify database
connections across local dev, CI, and production.

## Connection Roles
- `DATABASE_URL`: runtime application traffic (pooled endpoint in production).
- `DIRECT_URL`: direct admin/migration traffic (non-pooler endpoint).

In production with remote hosts, these URLs must:
- target different endpoints
- not reuse the same full URL
- use TLS (for example `?sslmode=require`)

For Supabase production:
- `DATABASE_URL` must use the Supabase transaction pooler:
  `*.pooler.supabase.com:6543`
- `DIRECT_URL` must use the direct database endpoint:
  `db.<project-ref>.supabase.co:5432`
- `DATABASE_URL`, `DIRECT_URL`, and `SUPABASE_URL` must all target the same
  Supabase project ref. On the shared pooler, the project ref is encoded in the
  username (`postgres.<project-ref>`). On direct/client URLs, it is encoded in
  the host (`db.<project-ref>.supabase.co` and
  `https://<project-ref>.supabase.co`).

Do not use the Supabase session pooler (`*.pooler.supabase.com:5432`) for
`DATABASE_URL` in Vercel/serverless runtime. Session mode is capped by the
pooler session `pool_size` and can return `EMAXCONNSESSION` during normal
serverless bursts. Transaction mode on port `6543` is the intended path for
short-lived/serverless application connections.

## Environment Baseline
- Local development:
  - `DATABASE_URL` may target localhost.
  - `DIRECT_URL` may target localhost.
- CI:
  - keep ephemeral/local endpoints where possible.
  - avoid production credentials in CI.
- Production:
  - transaction-pooled runtime URL in `DATABASE_URL`
  - direct migration/admin URL in `DIRECT_URL`
  - TLS enabled on both URLs

## Credential Hygiene
- Never commit credentials in repository files.
- Store production values in platform secret stores only.
- Rotate passwords/keys on a fixed cadence and after incidents.
- Remove old credentials immediately after successful rotation.

## Rotation Procedure
1. Create new database credentials in provider console.
2. Update secret manager values for `DATABASE_URL` and `DIRECT_URL`.
3. Run validation pipeline (`lint`, `test`, `test:coverage`, `build`).
4. Deploy staged production release.
5. Validate readiness endpoint and critical app workflows.
6. Revoke old credentials after verification succeeds.

## Production Secret Recovery

Restore production database secrets only from the intended Supabase Production
project dashboard. Do not derive production runtime values from local `.env`
snapshots, preview files, staging files, or old pulled Vercel env caches.

Use this checklist when production DB routing is suspect:

1. Open the Supabase Production project.
2. Copy the Production transaction-pooler connection string for `DATABASE_URL`.
3. Copy the matching Production direct connection string for `DIRECT_URL` and
   `MIGRATION_DATABASE_URL`.
4. Confirm the same project ref appears in:
   - pooler username: `postgres.<project-ref>`
   - direct host: `db.<project-ref>.supabase.co`
   - client URL: `https://<project-ref>.supabase.co`
5. Update Vercel Production runtime secrets and GitHub production environment
   secrets through their secret managers.
6. Deploy a staged production build, promote it, then verify `/api/health/live`
   and an authenticated project list.

Agents must not read, print, or rewrite production secret values during this
recovery unless the operator explicitly authorizes a specific secret operation.

## Verification Checklist
- `validateServerRuntimeConfig()` passes in the target environment.
- `/api/health/ready` returns healthy status after deploy.
- Prisma migrations run using `DIRECT_URL`.
- Runtime traffic uses Supabase transaction pooling (`DATABASE_URL` on port
  `6543`) when the database is Supabase.
- Supabase project refs match across `DATABASE_URL`, `DIRECT_URL`, and
  `SUPABASE_URL`.
- Vercel logs do not show `EMAXCONNSESSION` during representative authenticated
  request bursts.
- No credentials appear in logs, errors, or build artifacts.
