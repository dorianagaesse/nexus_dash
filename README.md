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

```bash
npx prisma migrate dev --name init
npx prisma generate
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

## Scripts

```bash
npm run dev
npm run build
npm run start
npm run lint
```
