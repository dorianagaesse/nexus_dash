# NexusDash

Personal productivity hub for managing projects, Kanban tasks, technical resources, and calendar context in one place.

**📊 Architecture Quality: 8.1/10** - See [ARCHITECTURE_ASSESSMENT.md](./ARCHITECTURE_ASSESSMENT.md) for detailed code quality report.

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

GitHub Actions enforces two CI gates on pull requests and `main`:
- `Quality Core`: `npm run lint`, `npm test`, `npm run test:coverage`, `npm run build`
- `E2E Smoke`: `npm run test:e2e` against an isolated PostgreSQL service with migrations applied
