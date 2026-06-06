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

## App Metadata

The app displays a clean product version such as `v0.3.0`. The commit SHA is
not appended to that visible version; it is kept as diagnostic metadata for
operators.

Source of truth:

- `package.json` is the canonical product-version source.
- `APP_VERSION` is an environment override. GitHub/Vercel deploy workflows set
  it from the checked-out `package.json` before deploy.
- `COMMIT_SHA` identifies the deployed revision. GitHub/Vercel deploy workflows
  set it from `git rev-parse HEAD`.
- `APP_ENV` identifies the deployed app environment (`preview` or
  `production` in the deploy workflow).
- `APP_REPOSITORY_URL` points metadata links at the repository and is injected
  by the deploy workflow.

Operators normally do not need to configure these metadata variables manually
in Vercel. If `APP_VERSION` is set by hand, it must match the intended release
version from source control rather than a dependency-update or deployment
attempt number.

Release cadence, pre-1.0 bump rules, changelog expectations, and tag/promotion
steps are documented in `docs/runbooks/release-versioning.md`.

The GitHub Actions workflow inventory, including deploy workflow triggers,
permissions, artifacts, and operator paths, is documented in
`docs/runbooks/github-actions-workflows.md`.

## Database Runtime

Required for Vercel runtime/deployments:

- `DATABASE_URL`
- `DIRECT_URL`

For Supabase-backed Vercel deployments:

- `DATABASE_URL` must be the Supabase transaction pooler URL:
  `*.pooler.supabase.com:6543`.
- `DATABASE_URL` must use the least-privilege runtime role
  (`app_runtime.<project-ref>` on the shared Supabase pooler).
- `DIRECT_URL` / `MIGRATION_DATABASE_URL` must use an admin-capable role such
  as `postgres`; they must not use `app_runtime`.
- `DIRECT_URL` should be the Supabase direct database URL
  (`db.<project-ref>.supabase.co:5432`) when the deployment environment can
  reach Supabase direct hosts.
- Supabase direct hosts are IPv6-only by default unless IPv4 support is enabled.
  If GitHub Actions or Vercel cannot connect to the direct host, use the admin
  session-pooler URL (`postgres.<project-ref>` on
  `*.pooler.supabase.com:5432`) for `DIRECT_URL` and
  `MIGRATION_DATABASE_URL`.
- Both values must enforce TLS, for example `?sslmode=require`.

Do not configure `DATABASE_URL` with the Supabase session pooler on port `5432`.
That shape can exhaust the session pool under normal Vercel/serverless request
bursts and is rejected by runtime validation.

Do not configure `DATABASE_URL` with the admin `postgres` role. Runtime app
traffic should stay on `app_runtime` so forced RLS remains meaningful even if a
service query path regresses.

## Outbound Email

Provider:

- Resend is the app-owned outbound email provider.

Required for live delivery:

- `RESEND_API_KEY`

Optional:

- `RESEND_FROM_EMAIL` defaults to `NexusDash <noreply@nexus-dash.app>`.
- `OUTBOUND_EMAIL_DELIVERY_MODE` defaults to `auto`.
- `CRON_SECRET` or `NOTIFICATION_EMAIL_DISPATCH_SECRET` protects the
  notification digest/reminder dispatch endpoint. If both are configured,
  `NOTIFICATION_EMAIL_DISPATCH_SECRET` takes precedence. Either value must be at
  least 32 characters when set.

Delivery modes:

- `auto`: send only from live production; development, test, and preview
  deployments record the attempt and mark it skipped.
- `disabled`: always record and skip delivery.
- `live`: send from any environment when `RESEND_API_KEY` is present. Use this
  only for explicit smoke tests or controlled diagnostics.

TASK-125 records each delivery attempt in `OutboundEmailDelivery` before
contacting the provider. TASK-104 routes project invitation email sends through
that same foundation, using absolute invite URLs derived from the trusted app
origin and preserving copy-link fallback behavior when delivery is skipped or
fails. The current foundation does not run background retry workers, bounce
webhooks, suppression handling, or notification preferences; failed sends are
recorded and returned to the caller synchronously.

TASK-227 owns production-grade project notification email orchestration. The
dispatcher is exposed at `/api/cron/notification-emails` and accepts either
`x-notification-email-dispatch-secret: <secret>` or
`Authorization: Bearer <secret>`. Notification creation/refreshed paths enqueue
durable recipient/project groups. Project activity waits for a 30-minute quiet
window, but the first unsent activity in a group is capped at a 60-minute max
delay. Due groups are claimed safely by the dispatcher and batched by recipient
with project sections. Invitation reminders send once after 6 hours when a
verified invited user has not opened, accepted, declined, or otherwise resolved
the invitation notification.

Scheduler decision:

- Current production bridge: GitHub Actions invokes this endpoint every 30 minutes
  through `.github/workflows/notification-email-dispatch.yml`.
- This bridge uses the existing durable app queue, protected endpoint, and
  idempotent dispatcher. It improves the previous 3-hour bridge without adding
  a paid scheduler/provider. Expected project-activity email delivery is the
  quiet window plus at most one 30-minute scheduler cadence and normal GitHub
  Actions scheduling delay.
- Dispatcher responses and workflow summaries include scheduler-lag metrics for
  claimed groups so operators can see how long due work waited after
  `sendAfterAt`.
- Manual GitHub Actions dispatch remains available for preview validation and
  diagnostics by overriding the target URL.
- Future preferred path: Vercel Cron or a managed HTTP scheduler with
  retries/visibility on a cadence that satisfies the product delivery target.

GitHub Actions dispatch requirements:

- The workflow needs `NOTIFICATION_EMAIL_DISPATCH_SECRET` or legacy
  `CRON_SECRET` as a GitHub secret.
- Scheduled runs always target `https://nexus-dash.app`. Do not rely on
  `NOTIFICATION_EMAIL_DISPATCH_URL` to steer production scheduler traffic.
- Manual workflow dispatch may override the target URL with the `target_url`
  input for preview validation or diagnostics.
- Manual override targets are allowlisted to the canonical production domain
  and this project's Vercel deployment domains so the production dispatch
  secret is never sent to an arbitrary host.
- If the workflow uses the GitHub `production` environment for secrets, that
  environment must allow scheduled jobs to run without manual approval.

Preview deployments can be validated by invoking the endpoint directly with the
same dispatch secret. A live email smoke additionally needs
`OUTBOUND_EMAIL_DELIVERY_MODE=live` and a real `RESEND_API_KEY`.

If Google OAuth is enabled:

- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `GOOGLE_REDIRECT_URI` must
  be configured together.
- `GOOGLE_TOKEN_ENCRYPTION_KEY` must be configured for environments running
  production runtime checks (production and preview in this project).

## Sensitivity Policy

Set as sensitive in Vercel (Preview + Production):

- `RESEND_API_KEY`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_TOKEN_ENCRYPTION_KEY`
- `AGENT_TOKEN_SIGNING_SECRET`
- `CRON_SECRET`
- `NOTIFICATION_EMAIL_DISPATCH_SECRET`
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
- Production database secrets must come from the intended Supabase Production
  project, not local `.env` snapshots or preview/staging files. The app rejects
  production startup when Supabase project refs differ across `DATABASE_URL`,
  `DIRECT_URL`, and `SUPABASE_URL`.
- When Supabase direct-host connectivity is unavailable, `DIRECT_URL` may use
  the admin session pooler on port `5432`. That is an admin/migration fallback,
  not permission to use session pooling or admin credentials for
  `DATABASE_URL`.
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
- Preview email smoke tests need `OUTBOUND_EMAIL_DELIVERY_MODE=live` and a real
  `RESEND_API_KEY`. The default `auto` mode records preview attempts as skipped.
- Vercel Cron schedule changes are production-deployment behavior. Preview
  validation should call the protected endpoint manually and should not be used
  as evidence that Vercel Cron itself ran.
- Keep `GOOGLE_TOKEN_ENCRYPTION_KEY` stable per environment. Rotating it
  requires token re-authorization because existing encrypted tokens may become
  unreadable.
- Keep `AGENT_TOKEN_SIGNING_SECRET` stable per environment. Rotating it
  invalidates all outstanding short-lived bearer tokens immediately and should
  be coordinated with any active agent clients.
- `GOOGLE_CALENDAR_ID` must be unset or `primary` only.

## `AGENT_TOKEN_SIGNING_SECRET` Quick Reference

Purpose:

- App-level secret used to sign and verify the short-lived bearer tokens issued
  by `POST /api/auth/agent/token`.
- Not a user credential, not a project credential, and not an agent API key.
- Generate it once per environment and keep it stable:
  - one stable value for `Preview`
  - one different stable value for `Production`

Important behavior:

- If the secret is missing from the runtime, production-like startup validation
  can fail and preview/production can return `500`.
- If the secret is rotated, all currently issued short-lived bearer tokens
  become invalid immediately. Long-lived project API keys still work and can
  exchange again after the new secret is live.

PowerShell-safe generation (works on Windows PowerShell 5.1 and PowerShell 7):

```powershell
$bytes = New-Object byte[] 32
$rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
$rng.GetBytes($bytes)
($bytes | ForEach-Object { $_.ToString("x2") }) -join ""
if ($rng -is [System.IDisposable]) { $rng.Dispose() }
```

Notes:

- The output is 64 hex characters representing 32 random bytes.
- This avoids the static `RandomNumberGenerator::Fill(...)` API, which is not
  available in older Windows PowerShell/.NET combinations.

Where to store it:

1. Vercel Project Settings -> Environment Variables
2. Add `AGENT_TOKEN_SIGNING_SECRET` to `Preview`
3. Add a different `AGENT_TOKEN_SIGNING_SECRET` to `Production`
4. If deploys run through GitHub Actions, also set the matching GitHub secret
   `AGENT_TOKEN_SIGNING_SECRET`

Recommended handling:

- Treat it as sensitive in Vercel.
- Do not share it with agent runtimes; agents should only receive
  project-scoped API keys created from the product UI.
- Rotate it deliberately, not casually.

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

Do not use pulled production env files as an input source for secret rewrites.
For production recovery, use the provider dashboards directly and compare only
non-secret fingerprints such as the Supabase project ref and endpoint mode.

## PR Readiness Gate (Env-Aware)

Before merging deploy-affecting changes:

1. Confirm required env vars exist for target environment.
2. Confirm sensitive vars are marked sensitive where supported.
3. Run manual preview deploy (`deploy-vercel.yml`, `action=deploy-preview`).
4. Validate critical auth/integration path(s) on preview URL.
5. If any preview path bypasses deployment-time `-e` injection, confirm
   `AGENT_TOKEN_SIGNING_SECRET` exists in Vercel Preview before relying on that
   preview URL.
