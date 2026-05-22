# NexusDash

NexusDash is a project execution workspace that combines:

- project management
- Kanban task flow
- project context cards
- file/link attachments
- Google Calendar context

in one authenticated application.

## Current Product State

Implemented today:

- Credentials auth from `/` (sign-up + sign-in)
- Email verification and password recovery for credentials accounts
- DB-backed session cookies
- Protected routes: `/projects/**`, `/account/**`
- Project CRUD
- Project sharing with owner-managed membership/invitation flows, including email-bound invite links
- In-app notification center for durable unread/read notification review, starting with project invitations
- Project notification email digests, delayed invitation reminders, and
  three-day task due-date reminders through the shared outbound email foundation
- Project-scoped agent access with owner-managed API credentials, short-lived bearer-token exchange, and audit trail
- Project dashboard with:
  - Context cards (CRUD + attachments)
  - Roadmap event-first milestone lanes with grouped child events, drag-and-drop regrouping, and target-date planning
  - Kanban board (`Backlog`, `In Progress`, `Blocked`, `Done`)
  - Calendar panel (Google Calendar list/create/update/delete)
- Per-user Google Calendar connection and calendar target setting (`/account/settings`)
- Attachment storage abstraction:
  - `local` provider (filesystem)
  - `r2` provider (Cloudflare R2)

## Tech Stack

- Next.js 16 (App Router)
- TypeScript (strict)
- Tailwind CSS + Shadcn UI
- Prisma + PostgreSQL
- Vitest + Playwright
- Docker + Docker Compose

## Local Setup

### 1. Prerequisites

- Node.js 20.19+ (v20), 22.13+ (v22), or 24+
- npm
- PostgreSQL database (local Docker Compose service or remote)

The repo pins the local Node baseline in `.node-version` as `20.19.0`.

### 2. Environment

Copy env template:

```bash
cp .env.example .env
```

Set at minimum:

- `DATABASE_URL`
- `DIRECT_URL`

For the repo-owned local Docker database, use:

```bash
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/nexusdash?schema=public
DIRECT_URL=postgresql://postgres:postgres@127.0.0.1:5432/nexusdash?schema=public
```

### 3. Install and run

```bash
npm install
npx prisma generate
npm run dev
```

Open `http://localhost:3000`.

`npm run dev` runs `prisma migrate deploy` before starting Next.js.

## Auth and Sessions

- Homepage (`/`) is the sign-in/sign-up entry when signed out.
- Credentials accounts require email verification before workspace access.
- Unverified signed-in users are redirected to `/verify-email`.
- Verification callback endpoint: `GET /api/auth/verify-email?token=...`.
- After verified authentication, users are redirected to `/projects`.
- Session persistence is database-backed (`Session` table) with HttpOnly cookie handling.
- Logout endpoint: `POST /api/auth/logout`.
- Agent access is project-scoped and owner-managed from the project settings surface.
- Agent raw API keys exchange at `POST /api/auth/agent/token` into short-lived bearer tokens.
- Agent v1 is limited to project/task/context APIs and does not include calendar or binary attachment parity.

## Database and Migrations

Scripts:

```bash
npm run db:migrate
```

Notes:

- Datasource is PostgreSQL (`prisma/schema.prisma`).
- Runtime and migration connection roles are split via `DATABASE_URL` + `DIRECT_URL`.
- In production with remote hosts, runtime validation enforces:
  - different runtime/direct endpoints
  - TLS
  - Supabase pooler/direct host sanity rules (when Supabase hosts are used)
  - Supabase runtime traffic on the transaction pooler port `6543`; the
    session pooler port `5432` is rejected for `DATABASE_URL` because it can
    exhaust session clients under Vercel/serverless request bursts
  - Supabase project-ref alignment between `DATABASE_URL`, `DIRECT_URL`, and
    `SUPABASE_URL` so production cannot silently boot against a preview or
    staging database

For Supabase production/preview:

- `DATABASE_URL`: transaction pooler URL, `*.pooler.supabase.com:6543`, with
  TLS enabled. For the shared Supabase pooler, use the least-privilege runtime
  role and include the project ref in the username, for example
  `app_runtime.<project-ref>`.
- `DIRECT_URL` / `MIGRATION_DATABASE_URL`: admin-capable migration connection,
  never `app_runtime`. Prefer the direct database URL
  `db.<project-ref>.supabase.co:5432` when the environment can reach it.
  Supabase direct hosts are IPv6-only by default; if GitHub Actions or Vercel
  cannot connect to the direct host, use the admin `postgres.<project-ref>`
  session-pooler URL on `*.pooler.supabase.com:5432`.
- `SUPABASE_URL`: the matching client API URL,
  `https://<project-ref>.supabase.co`.
- Prisma runtime automatically adds the compatibility flags needed for the
  Supabase transaction pooler when constructing the `@prisma/adapter-pg`
  connection string.

## Environment Contract (Server)

Environment access/validation is centralized in `lib/env.server.ts` and executed at startup (`app/layout.tsx`).

### Required

- `DATABASE_URL`

### Required in production

- `DIRECT_URL`
- `RESEND_API_KEY` (email verification delivery)
- `AGENT_TOKEN_SIGNING_SECRET` (agent bearer-token signing, minimum 32 chars; see `docs/runbooks/vercel-env-contract-and-secrets.md` for generation and rotation guidance)

### Optional grouped vars (must be complete if any value is set)

- Google OAuth group:
  - `GOOGLE_CLIENT_ID`
  - `GOOGLE_CLIENT_SECRET`
  - `GOOGLE_REDIRECT_URI`
- NextAuth compatibility group:
  - `NEXTAUTH_URL`
  - `NEXTAUTH_SECRET`
- Supabase client group:
  - `SUPABASE_URL`
  - `SUPABASE_PUBLISHABLE_KEY`
  - legacy fallback accepted for migration only: `SUPABASE_API_KEY`
- R2 credentials group:
  - `R2_ACCOUNT_ID`
  - `R2_ACCESS_KEY_ID`
  - `R2_SECRET_ACCESS_KEY`
  - `R2_BUCKET_NAME`

### Additional rules

- `APP_VERSION` is optional locally and should normally be omitted. When unset,
  the app reads the product version from `package.json`.
- `APP_ENV` is optional locally and may be `development`, `preview`,
  `production`, or `test`. Vercel deploy workflows inject it for preview and
  production deploys.
- `COMMIT_SHA` is optional locally and is used only as diagnostic build
  metadata. The user-facing app version does not include the commit SHA.
- `APP_REPOSITORY_URL` is optional and defaults to the NexusDash GitHub
  repository.
- In production, when Google OAuth is enabled, `GOOGLE_TOKEN_ENCRYPTION_KEY` is required.
- `AGENT_ACCESS_TOKEN_TTL_SECONDS` is optional, defaults to `600`, and must stay between `300` and `900`.
- `GOOGLE_CALENDAR_ID` must be unset or `primary`.
- `RESEND_FROM_EMAIL` defaults to `NexusDash <noreply@nexus-dash.app>` when unset.
- `TRUSTED_ORIGINS` (optional) can restrict verification-link origins in production.
- `CRON_SECRET` or `NOTIFICATION_EMAIL_DISPATCH_SECRET` protects the
  notification email dispatch endpoint. If both are set,
  `NOTIFICATION_EMAIL_DISPATCH_SECRET` takes precedence. Configured values must
  be at least 32 characters.
- `STORAGE_PROVIDER` must be `local` or `r2` (default `local`).

Runbooks:

- `docs/runbooks/vercel-env-contract-and-secrets.md`
- `docs/runbooks/database-connection-hardening.md`
- `docs/runbooks/notification-email-dispatch.md`
- `docs/runbooks/release-versioning.md`

## Attachments and Storage

Supported kinds:

- `link`
- `file`

Allowed file types:

- PDF
- JPEG / PNG / WebP
- TXT / Markdown
- CSV
- JSON

Upload limits:

- Form-based upload: `4MB`
- Direct upload flow (signed upload target): `25MB`

Provider behavior:

- `local`: filesystem-backed (`/storage/uploads`)
- `r2`: Cloudflare R2 with signed download URLs and direct upload support

## Docker (Dev)

```bash
docker compose up
```

Notes:

- Compose starts a local `postgres:16-alpine` service by default.
- App binds to `${APP_PORT:-3000}` on host.
- Container startup runs `npx prisma generate` then `npm run dev`.
- Storage volume is mounted at `/app/storage`.
- App container database defaults target the Compose `postgres` service. Host
  validation commands should use `127.0.0.1`.
- Use `APP_DATABASE_URL` and `APP_DIRECT_URL` only when overriding the app
  container database target.

## Scripts

```bash
npm run dev
npm run build
npm run start
npm run lint
npm test
npm run test:coverage
npm run test:e2e
npm run test:e2e:headed
npm run db:migrate
npm run db:local:up
npm run db:local:down
npm run db:local:reset
npm run release:version -- patch --dry-run
npm run validate:local
```

## Local Validation

Full local baseline:

```bash
npm run validate:local
```

Manual sequence and troubleshooting details are in
[`docs/runbooks/local-validation.md`](docs/runbooks/local-validation.md).

## Testing

### Unit/API tests

```bash
npm test
npm run test:coverage
```

### E2E (Playwright)

Install browser once:

```bash
npx playwright install --with-deps chromium
```

Run:

```bash
npm run test:e2e
```

Against a deployed preview:

```bash
PLAYWRIGHT_BASE_URL=https://<preview-url> npx playwright test tests/e2e/smoke-project-task-calendar.spec.ts
```

If the preview is behind Vercel protection, also set:

```bash
VERCEL_AUTOMATION_BYPASS_SECRET=<32-char-secret>
```

The Playwright config forwards that secret through the Vercel preview-protection
headers so smoke runs can target the deployed branch preview directly.

### Notification Email Dispatch

Digest/reminder dispatch endpoint:

```bash
GET /api/cron/notification-emails
```

Authenticate with the dedicated scheduler header:

```bash
x-notification-email-dispatch-secret: <CRON_SECRET-or-NOTIFICATION_EMAIL_DISPATCH_SECRET>
```

or the bearer fallback:

```bash
Authorization: Bearer <CRON_SECRET-or-NOTIFICATION_EMAIL_DISPATCH_SECRET>
```

Notification creation/refreshed paths enqueue durable recipient/project groups.
Project activity waits for a 30-minute quiet window, but the first unsent
activity in a group is capped at a 60-minute max delay. Task due-date reminders
are reconciled by the dispatcher when a task is exactly three local calendar
days from its date-only deadline. Each reminder creates one durable in-app
notification per task, recipient, and deadline date, then flows through the same
recipient/project digest pipeline as other project activity. Reminders target
the assignee when present, or the task creator when unassigned, and only while
that recipient still has project access. `Done`, archived, and undated tasks are
ignored. Due groups claimed in one dispatcher run are batched by recipient, with
project sections in one email when several projects are ready together. Project
invitation reminders are sent once after 6 hours when the verified invited user
has not opened, accepted, declined, or otherwise resolved the invitation
notification. Sending email never marks notifications read or resolved.

Production scheduler decision:

- Current production bridge: GitHub Actions invokes this endpoint every 3 hours
  through `.github/workflows/notification-email-dispatch.yml`.
- This is an accepted early-production tradeoff while Vercel remains on Hobby
  and no managed scheduler is in use. It preserves durable app-owned queueing
  and idempotent dispatch, but it does not satisfy the original one-hour
  max-delay delivery target.
- Manual workflow dispatch remains available for preview validation and
  diagnostics by overriding the target URL.
- Future preferred path: Vercel Cron or a managed HTTP scheduler with
  retries/visibility on a cadence that satisfies the product delivery target.

## CI/CD

### CI workflows

- `Quality Core (lint, test, coverage, build)`
- `E2E Smoke (Playwright)`
- `Container Image (build + metadata artifact)`
- `Check Branch Name` (PR branch naming contract)
- `Dependency Security` (scheduled + manual `npm audit` baseline with artifacts)
- `Notification Email Dispatch Scheduler` (scheduled + manual protected
  dispatch call)

Branch-name note:
- human-authored PR branches must use `feature/*`, `fix/*`, `refactor/*`,
  `docs/*`, or `chore/*`
- Dependabot PR branches may use `dependabot/*`

### Release version metadata

`package.json` is the canonical product-version source. Release PRs that
intentionally change the product version must update both `package.json` and
`package-lock.json`; Dependabot maintenance PRs must not bump the product
version by themselves.

Product versions move through intentional release PRs, not every production
deployment. While NexusDash is pre-1.0, use patch bumps such as `0.2.1` for
bugfix and operational releases, minor bumps such as `0.3.0` for meaningful
product capability milestones, and reserve `1.0.0` for the first stable product
baseline. The detailed checklist lives in
[`docs/runbooks/release-versioning.md`](docs/runbooks/release-versioning.md).

The running app displays only the clean product version, for example `v0.2.0`.
Build revision and runtime environment are kept as diagnostic metadata so
operators can identify the deployed commit without turning the user-facing
version into `v0.2.0+<sha>`.

The Vercel deploy workflow resolves metadata from the checked-out ref and
injects:

- `APP_VERSION`: product version from `package.json`
- `APP_ENV`: `preview` for preview deploys, `production` for staged production
- `COMMIT_SHA`: full git commit SHA for diagnostics
- `APP_REPOSITORY_URL`: GitHub repository URL

After a preview or staged-production deployment, check the workflow summary for
the resolved app version and short revision. Promoted production keeps the same
metadata as the staged deployment target.

### CD workflow

Workflow: `.github/workflows/deploy-vercel.yml`

Supports:

- automatic staged production deploy after successful `Quality Gates` on `main`
- manual actions:
  - `deploy-preview`
  - `deploy-production-staged`
  - `promote`
  - `rollback`

Required GitHub secrets:

- `VERCEL_TOKEN`
- `VERCEL_ORG_ID`
- `VERCEL_PROJECT_ID`
- `NOTIFICATION_EMAIL_DISPATCH_SECRET` or `CRON_SECRET` for scheduled/manual
  notification email dispatch
- `DATABASE_URL` (runtime connection; Supabase `app_runtime` transaction pooler
  on port `6543`)
- `DIRECT_URL` (admin-capable migration connection; direct host preferred,
  admin session-pooler fallback allowed when direct IPv6 is unavailable)
- `MIGRATION_DATABASE_URL` (admin-capable migration connection; must not be the runtime `DATABASE_URL`)
- `AGENT_TOKEN_SIGNING_SECRET` (required for production deploys; preview workflow falls back to a placeholder when intentionally unset)
- Preview deployments still need `AGENT_TOKEN_SIGNING_SECRET` at runtime. GitHub Actions fallback values do not automatically populate Vercel's shared preview runtime unless the deployment explicitly passes them through.

### Dependency Security Cadence

- `npm run security:audit`: fail on production dependency `high`/`critical` findings
- `npm run security:audit:full`: emit the full npm advisory JSON locally
- `.github/workflows/dependency-security.yml`: scheduled every Monday at 07:00 UTC and runnable on demand
- `.github/dependabot.yml`: weekly npm + GitHub Actions dependency update cadence
- `.github/workflows/dependabot-auto-triage.yml`: labels and auto-approves safe
  Dependabot lanes, reclassifies failed safe-lane PRs back into manual review,
  then auto-merges them after the required PR checks pass
- `.github/workflows/dependabot-repair-agent.yml`: weekly scheduled GitHub
  Copilot CLI repair lane for failing Dependabot PRs; it may create repo-owned
  superseding PRs and close the original Dependabot PRs, but it never merges
  the superseding PRs automatically

Dependabot automation policy:
- grouped GitHub Actions updates are considered safe auto-merge candidates
- grouped npm safe lanes are auto-merge candidates only for:
  - development dependency patch/minor updates outside the known high-churn
    framework/lint/test/ORM stack
  - selected low-risk production utility libraries (`tailwind-merge`, `clsx`,
    `class-variance-authority`, `lucide-react`, `@radix-ui/react-slot`,
    `tailwindcss-animate`, `sanitize-html`, `emojibase-data`)
- majors and excluded high-churn dependencies stay in manual review
- a weekly Copilot repair lane may triage failing/manual-review Dependabot PRs:
  - red safe-lane PRs are reclassified out of `dependabot:auto-merge` once
    required checks fail
  - it scans open red Dependabot-created `dependabot/*` PRs, so stale labels do
    not block repair follow-up
  - it uses a repository custom Copilot agent profile plus a scheduled GitHub
    Actions workflow
  - when it repairs an update, it opens a repo-owned superseding PR and closes
    the original Dependabot PR to keep one merge surface
  - when it does not repair an update, it comments the original Dependabot PR
    and leaves it in manual review
  - it never auto-merges its own superseding PRs

Copilot repair-lane prerequisite:
- set repository secret `COPILOT_ACTIONS_TOKEN` so the scheduled workflow can
  authenticate Copilot CLI in GitHub Actions

## Observability

- `GET /api/health/live`: process liveness
- `GET /api/health/ready`: dependency readiness (database reachability)
- API request/response correlation via `x-request-id`
- Structured server logging in `lib/observability/logger.ts`

## Project Documentation Map

- `project.md`: current architecture/product blueprint
- `agent.md`: repository-specific execution contract
- `tasks/current.md`: active task scope
- `tasks/backlog.md`: pending/completed task queue
- `journal.md`: execution log
- `adr/decisions.md` + `adr/*.md`: architecture decisions
