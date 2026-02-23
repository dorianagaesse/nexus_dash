# Vercel Env Contract and Secrets Runbook

This runbook defines how environment variables must be managed across Vercel
environments for NexusDash.

## Goals

- Keep deploys deterministic across `development`, `preview`, and `production`.
- Prevent secret leakage in logs/UI/screenshots.
- Make troubleshooting reproducible without ad-hoc env edits.

## Required Variables (Google Calendar path)

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REDIRECT_URI`
- `GOOGLE_TOKEN_ENCRYPTION_KEY`

If Google OAuth is enabled, all four should be configured in Vercel.

## Sensitivity Policy

Set as sensitive in Vercel (Preview + Production):

- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_TOKEN_ENCRYPTION_KEY`
- `NEXTAUTH_SECRET`
- `DATABASE_URL`
- `DIRECT_URL`
- `R2_SECRET_ACCESS_KEY`
- `R2_ACCESS_KEY_ID`

Can stay non-sensitive:

- `GOOGLE_CLIENT_ID`
- `GOOGLE_REDIRECT_URI`
- `GOOGLE_CALENDAR_ID`
- `R2_BUCKET_NAME`
- `R2_ACCOUNT_ID`
- `SUPABASE_URL`

Important:

- Vercel currently does not allow `--sensitive` variables on the `development`
  target in the CLI. Treat this as a platform constraint.

## Operational Notes

- Preview builds run with production-like checks (`NODE_ENV=production` during
  build), so missing production-only guards can break preview deploys.
- Keep `GOOGLE_TOKEN_ENCRYPTION_KEY` stable per environment. Rotating it
  requires token re-authorization because existing encrypted tokens may become
  unreadable.
- `GOOGLE_CALENDAR_ID` should be unset or `primary` only.

## Verification Commands

List vars:

```bash
npx vercel env ls
```

Pull runtime values locally for diagnostics:

```bash
npx vercel env pull .env.preview.local --environment=preview --yes
npx vercel env pull .env.production.local --environment=production --yes
```

After diagnostics, delete pulled files if not needed.

## PR Readiness Gate (Env-Aware)

Before merging deploy-affecting changes:

1. Confirm required env vars exist for target environment.
2. Confirm sensitive vars are marked sensitive where supported.
3. Run manual preview deploy (`deploy-vercel.yml`, `action=deploy-preview`).
4. Validate critical auth/integration path(s) on preview URL.
