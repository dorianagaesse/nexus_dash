# Database Connection Hardening Runbook

## Purpose
Define a safe and repeatable way to configure, rotate, and verify database
connections across local dev, CI, and production.

## Connection Roles
- `DATABASE_URL`: runtime application traffic. In hosted Supabase production
  and preview this must be a least-privilege runtime role through transaction
  pooling.
- `DIRECT_URL`: admin/migration traffic. Prefer a direct database endpoint when
  the execution environment can reach it; use an admin-capable session-pooler
  endpoint when Supabase's direct host is unreachable from that environment.

In production with remote hosts, these URLs must:
- target different endpoints
- not reuse the same full URL
- use TLS (for example `?sslmode=require`)

For Supabase production:
- `DATABASE_URL` must use the Supabase transaction pooler:
  `*.pooler.supabase.com:6543`
- `DATABASE_URL` must use the least-privilege runtime database role
  (`app_runtime.<project-ref>` on the shared pooler in current environments).
- `DIRECT_URL` and `MIGRATION_DATABASE_URL` must use an admin-capable role such
  as `postgres`; they must never use `app_runtime`.
- `DIRECT_URL` should use the direct database endpoint when reachable:
  `db.<project-ref>.supabase.co:5432`.
- Supabase direct database hosts are IPv6-only by default unless the project has
  IPv4 support enabled. GitHub Actions, Vercel, and local machines may be unable
  to resolve or connect to that host. In those cases, use the admin
  session-pooler URL (`postgres.<project-ref>` on
  `*.pooler.supabase.com:5432`) for `DIRECT_URL` and
  `MIGRATION_DATABASE_URL` instead of weakening `DATABASE_URL`.
- `DATABASE_URL`, `DIRECT_URL`, and `SUPABASE_URL` must all target the same
  Supabase project ref. On the shared pooler, the project ref is encoded in the
  username (`<role>.<project-ref>`, for example `app_runtime.<project-ref>` or
  `postgres.<project-ref>`). On direct/client URLs, it is encoded in the host
  (`db.<project-ref>.supabase.co` and
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
  - transaction-pooled `app_runtime` runtime URL in `DATABASE_URL`
  - admin-capable migration URL in `DIRECT_URL`
  - use the direct host for `DIRECT_URL` when IPv6/direct connectivity is
    available
  - use the `postgres.<project-ref>` session-pooler URL for `DIRECT_URL` /
    `MIGRATION_DATABASE_URL` when direct host connectivity is unavailable
  - TLS enabled on both URLs

## Credential Hygiene
- Never commit credentials in repository files.
- Store production values in platform secret stores only.
- Rotate passwords/keys on a fixed cadence and after incidents.
- Remove old credentials immediately after successful rotation.

## Rotation Procedure
1. Create new database credentials in provider console.
2. Update secret manager values for `DATABASE_URL`, `DIRECT_URL`, and
   `MIGRATION_DATABASE_URL` as needed.
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
2. Copy the Production transaction-pooler connection string for `DATABASE_URL`
   and set it to the least-privilege runtime role (`app_runtime.<project-ref>`).
3. Copy the matching Production direct connection string for `DIRECT_URL` and
   `MIGRATION_DATABASE_URL` when direct IPv6 connectivity is available.
   Otherwise copy the admin `postgres.<project-ref>` session-pooler URL on port
   `5432`.
4. Confirm the same project ref appears in:
   - runtime pooler username: `app_runtime.<project-ref>`
   - admin pooler username, when used: `postgres.<project-ref>`
   - direct host: `db.<project-ref>.supabase.co`
   - client URL: `https://<project-ref>.supabase.co`
5. Update Vercel Production runtime secrets and GitHub production environment
   secrets through their secret managers. Never substitute the admin URL into
   `DATABASE_URL`.
6. Deploy a staged production build, promote it, then verify `/api/health/live`
   and an authenticated project list.

Agents must not read, print, or rewrite production secret values during this
recovery unless the operator explicitly authorizes a specific secret operation.

## Verification Checklist
- `validateServerRuntimeConfig()` passes in the target environment.
- `/api/health/ready` returns healthy status after deploy.
- Prisma migrations run using `DIRECT_URL` / `MIGRATION_DATABASE_URL` with an
  admin-capable role.
- Runtime traffic uses Supabase transaction pooling (`DATABASE_URL` on port
  `6543`) and the least-privilege `app_runtime` role when the database is
  Supabase.
- `DIRECT_URL` / `MIGRATION_DATABASE_URL` do not use `app_runtime`.
- Supabase project refs match across `DATABASE_URL`, `DIRECT_URL`, and
  `SUPABASE_URL`.
- Vercel logs do not show `EMAXCONNSESSION` during representative authenticated
  request bursts.
- No credentials appear in logs, errors, or build artifacts.
