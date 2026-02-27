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
- DB-backed session cookies
- Protected routes: `/projects/**`, `/account/**`
- Project CRUD
- Project dashboard with:
  - Context cards (CRUD + attachments)
  - Kanban board (`Backlog`, `In Progress`, `Blocked`, `Done`)
  - Calendar panel (Google Calendar list/create/update/delete)
- Per-user Google Calendar connection and calendar target setting (`/account/settings`)
- Attachment storage abstraction:
  - `local` provider (filesystem)
  - `r2` provider (Cloudflare R2)

## Tech Stack

- Next.js 14 (App Router)
- TypeScript (strict)
- Tailwind CSS + Shadcn UI
- Prisma + PostgreSQL
- Vitest + Playwright
- Docker + Docker Compose

## Local Setup

### 1. Prerequisites

- Node.js 18+ (Node 20 recommended)
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

## CI/CD

### CI workflows

- `Quality Core (lint, test, coverage, build)`
- `E2E Smoke (Playwright)`
- `Container Image (build + metadata artifact)`
- `Check Branch Name` (PR branch naming contract)

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
