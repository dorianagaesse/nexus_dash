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

## Verification Checklist
- `validateServerRuntimeConfig()` passes in the target environment.
- `/api/health/ready` returns healthy status after deploy.
- Prisma migrations run using `DIRECT_URL`.
- Runtime traffic uses Supabase transaction pooling (`DATABASE_URL` on port
  `6543`) when the database is Supabase.
- Vercel logs do not show `EMAXCONNSESSION` during representative authenticated
  request bursts.
- No credentials appear in logs, errors, or build artifacts.
