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

- Node.js 20.19+ (v20), 22.12+ (v22), or 24+
- npm
- PostgreSQL database (local or remote)

### 2. Environment

Copy env template:

```bash
cp .env.example .env
```

Set at minimum:

- `DATABASE_URL`
- `DIRECT_URL`

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

- In production, when Google OAuth is enabled, `GOOGLE_TOKEN_ENCRYPTION_KEY` is required.
- `AGENT_ACCESS_TOKEN_TTL_SECONDS` is optional, defaults to `600`, and must stay between `300` and `900`.
- `GOOGLE_CALENDAR_ID` must be unset or `primary`.
- `RESEND_FROM_EMAIL` defaults to `NexusDash <noreply@nexus-dash.app>` when unset.
- `TRUSTED_ORIGINS` (optional) can restrict verification-link origins in production.
- `STORAGE_PROVIDER` must be `local` or `r2` (default `local`).

Runbooks:

- `docs/runbooks/vercel-env-contract-and-secrets.md`
- `docs/runbooks/database-connection-hardening.md`

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

- App binds to `${APP_PORT:-3000}` on host.
- Container startup runs `npx prisma generate` then `npm run dev`.
- Storage volume is mounted at `/app/storage`.
- `DATABASE_URL` and `DIRECT_URL` are required by compose config.

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
```

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

## CI/CD

### CI workflows

- `Quality Core (lint, test, coverage, build)`
- `E2E Smoke (Playwright)`
- `Container Image (build + metadata artifact)`
- `Check Branch Name` (PR branch naming contract)
- `Dependency Security` (scheduled + manual `npm audit` baseline with artifacts)

Branch-name note:
- human-authored PR branches must use `feature/*`, `fix/*`, `refactor/*`,
  `docs/*`, or `chore/*`
- Dependabot PR branches may use `dependabot/*`

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
