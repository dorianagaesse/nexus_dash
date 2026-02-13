# NexusDash

Personal productivity hub for managing projects, Kanban tasks, technical resources, and calendar context in one place.

## Tech Stack

- Next.js (App Router)
- TypeScript (strict)
- Tailwind CSS + Shadcn/UI
- Prisma + SQLite
- Docker + Docker Compose

## Local Setup

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Database (Prisma)

`npm run dev` and `npm run start` automatically run `prisma migrate deploy` first.
On a fresh clone/machine, this initializes `prisma/dev.db` before the app handles requests.

If you create a new migration during development:

```bash
npx prisma migrate dev --name <migration_name>
npx prisma generate
```

If you need to apply existing migrations manually:

```bash
npm run db:migrate
```

The SQLite file is created at `prisma/dev.db` and is gitignored.

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
```
