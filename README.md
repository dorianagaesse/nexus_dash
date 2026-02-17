# NexusDash

Personal productivity hub for managing projects, Kanban tasks, technical resources, and calendar context in one place.

## Tech Stack

- Next.js (App Router)
- TypeScript (strict)
- Tailwind CSS + Shadcn/UI
- Prisma + PostgreSQL (Supabase-compatible)
- Docker + Docker Compose

## Local Setup

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Database (Prisma)

`npm run dev` and `npm run start` automatically run `prisma migrate deploy` first.
On a fresh clone/machine, ensure `.env` defines `DATABASE_URL` and `DIRECT_URL`
before starting the app.

- `DATABASE_URL`: use the Supabase session pooler URI.
- `DIRECT_URL`: use the direct PostgreSQL URI (used by Prisma migrate).
- Include `sslmode=require` on both URLs.
- If direct host resolution is unavailable in your network environment, set
  `DIRECT_URL` to the same value as `DATABASE_URL`.

## Configuration & Secrets Baseline

Environment and secret handling is centralized in `lib/env.server.ts`.

- Required (server): `DATABASE_URL`
- Required as a pair (when calendar auth is enabled): `GOOGLE_CLIENT_ID`,
  `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`
- Required in production: `DIRECT_URL`
- Optional with fallback in non-production: `DIRECT_URL` falls back to `DATABASE_URL`
- Optional as a pair: `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`
- Optional as a pair: `NEXTAUTH_URL`, `NEXTAUTH_SECRET`
- Optional provider selector: `STORAGE_PROVIDER` (`local` by default, `r2` for Cloudflare R2)
- Required when `STORAGE_PROVIDER=r2`: `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`,
  `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`
- Optional with default: `R2_SIGNED_URL_TTL_SECONDS` (defaults to `300`)

Startup/runtime validation:
- The app validates runtime config at server startup (`app/layout.tsx`).
- Invalid or partial env configuration fails fast with explicit error messages.

Deployment model:
- Local dev: `.env` (never committed)
- CI: repository/organization secrets + workflow/job env
- Vercel: environment-specific secrets in dashboard (Preview/Production)

If you create a new migration during development:

```bash
npx prisma migrate dev --name <migration_name>
npx prisma generate
```

If you need to apply existing migrations manually:

```bash
npm run db:migrate
```

## Docker (Dev)

```bash
docker compose up
```

The app runs on `http://localhost:3000` with hot reload enabled via bind mounts.
If port `3000` is already used, run:

```bash
APP_PORT=3001 docker compose up
```

Attachment uploads are stored server-side under `/app/storage/uploads` (mounted as
`storage_data` in Docker Compose).

## Attachments

- Supported kinds: link and file
- File size limit: `10MB`
- Allowed MIME types: PDF, PNG/JPEG/WebP, TXT/Markdown, CSV, JSON
- Storage provider architecture:
  - `local`: filesystem-backed storage under `/storage/uploads` (dev-friendly)
  - `r2`: Cloudflare R2 object storage with signed download URLs
- Task attachments are managed from the task detail modal
- Context-card attachments are managed from the context-card edit modal

## Scripts

```bash
npm run dev
npm run build
npm run start
npm run lint
npm run test
npm run test:coverage
npm run test:e2e
```

## E2E Smoke Tests (Playwright)

The E2E suite validates critical UI journeys:
- project creation + dashboard navigation
- task lifecycle with attachment interaction
- calendar panel interaction states

Run once (or after Playwright upgrades):

```bash
npx playwright install chromium
```

Run smoke tests:

```bash
npm run test:e2e
```

## CI Quality Gates

GitHub Actions enforces three CI gates on pull requests and `main`:
- `Quality Core`: `npm run lint`, `npm test`, `npm run test:coverage`, `npm run build`
- `E2E Smoke`: `npm run test:e2e` against an isolated PostgreSQL service with migrations applied
- `Container Image`: Docker image build validation with exported image metadata artifact

## CD and Rollback (Vercel CLI)

CD/rollback workflow: `.github/workflows/deploy-vercel.yml`

Required repository secrets:
- `VERCEL_TOKEN`
- `VERCEL_ORG_ID`
- `VERCEL_PROJECT_ID`

Required Vercel project environment variables:
- Configure all runtime app env vars from `.env.example` in Vercel project settings.
- At minimum, ensure database/runtime-critical vars (for example `DATABASE_URL`) are set for the target environment (Preview/Production).

Supported operations:
- automatic staged production deployment after successful `Quality Gates` on `main`
- manual workflow-dispatch operations:
  - `deploy-preview`
  - `deploy-production-staged`
  - `promote` (promote a staged deployment)
  - `rollback` (instant rollback to a previous production deployment)

Notes:
- On Vercel Hobby, rollback is limited to the previous production deployment.
- After rollback, auto-assignment behavior may require an explicit promote to restore standard flow.
- Workflow pins Vercel CLI to a fixed version for reproducible deploy behavior.
