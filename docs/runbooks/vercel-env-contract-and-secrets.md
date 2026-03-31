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

## Required Variables (Agent access path)

- `AGENT_TOKEN_SIGNING_SECRET`

Optional but bounded:

- `AGENT_ACCESS_TOKEN_TTL_SECONDS` (`300-900`, default `600`)

If Google OAuth is enabled:

- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `GOOGLE_REDIRECT_URI` must
  be configured together.
- `GOOGLE_TOKEN_ENCRYPTION_KEY` must be configured for environments running
  production runtime checks (production and preview in this project).

## Sensitivity Policy

Set as sensitive in Vercel (Preview + Production):

- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_TOKEN_ENCRYPTION_KEY`
- `AGENT_TOKEN_SIGNING_SECRET`
- `NEXTAUTH_SECRET`
- `DATABASE_URL`
- `DIRECT_URL`
- `R2_SECRET_ACCESS_KEY`
- `R2_ACCESS_KEY_ID`

`R2_ACCESS_KEY_ID` is treated as sensitive here for defense-in-depth and to
avoid key-id leakage in screenshots/log captures.

Can stay non-sensitive:

- `GOOGLE_CLIENT_ID`
- `GOOGLE_REDIRECT_URI`
- `GOOGLE_CALENDAR_ID`
- `R2_BUCKET_NAME`
- `R2_ACCOUNT_ID`
- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`

Important:

- Vercel currently does not allow `--sensitive` variables on the `development`
  target in the CLI. Treat this as a platform constraint.

## Operational Notes

- Preview builds run with production-like checks (`NODE_ENV=production` during
  build), so missing production-only guards can break preview deploys.
- GitHub-managed preview deploys and Vercel-managed preview deployments do not
  get runtime secrets from the same place:
  - `deploy-vercel.yml` can inject preview fallback values into the specific
    deployment it creates.
  - Vercel Git-based preview deployments still require the secret to exist in
    the Vercel Preview environment itself.
- `AGENT_TOKEN_SIGNING_SECRET` must reach the preview runtime either through
  the Vercel Preview environment or explicit `vercel deploy -e ...` injection.
  Without it, server startup validation will fail and the preview can return
  `500` on `/`.
- Preview deploy workflow falls back to a placeholder
  `AGENT_TOKEN_SIGNING_SECRET` only when the preview environment intentionally
  omits the real secret. Use a real stable secret in shared preview
  environments when agent access behavior needs to be validated end to end.
- Keep `GOOGLE_TOKEN_ENCRYPTION_KEY` stable per environment. Rotating it
  requires token re-authorization because existing encrypted tokens may become
  unreadable.
- Keep `AGENT_TOKEN_SIGNING_SECRET` stable per environment. Rotating it
  invalidates all outstanding short-lived bearer tokens immediately and should
  be coordinated with any active agent clients.
- `GOOGLE_CALENDAR_ID` must be unset or `primary` only.

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
5. If any preview path bypasses deployment-time `-e` injection, confirm
   `AGENT_TOKEN_SIGNING_SECRET` exists in Vercel Preview before relying on that
   preview URL.
