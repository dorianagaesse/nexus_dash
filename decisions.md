# Architecture Decisions (ADR Log)

Use this file to record architectural decisions. Keep entries short and factual.

## Template
```
Date: YYYY-MM-DD
Decision: <short title>
Status: Proposed | Accepted | Deprecated
Context: <why this decision is needed>
Decision: <what was chosen and why>
Consequences: <tradeoffs, risks, follow-ups>
```

---
Date: 2026-02-11
Decision: Baseline stack setup (Next.js App Router + Prisma SQLite + Tailwind/Shadcn + Docker)
Status: Accepted
Context: TASK-001 requires a consistent foundation for the NexusDash app.
Decision: Use Next.js 14 App Router with TypeScript strict mode, Tailwind CSS + Shadcn UI components, Prisma ORM with SQLite, and Docker/Docker Compose for dev parity.
Consequences: Fast local iteration with a lightweight DB, consistent containerized dev flow, and a clear UI foundation for future features.
Date: 2026-02-11
Decision: Compose host port is configurable with safe default
Status: Accepted
Context: Local developer environments may already occupy host port `3000`, which blocked `docker compose up`.
Decision: Keep container port fixed at `3000` and map host port using `${APP_PORT:-3000}` in `docker-compose.yml`, documented in README.
Consequences: Default behavior remains `localhost:3000`, while developers can override to avoid conflicts without editing compose files.
Date: 2026-02-12
Decision: Use Next.js server actions for Project CRUD
Status: Accepted
Context: TASK-002 requires simple create/update/delete flows with low ceremony and direct Prisma access.
Decision: Implement CRUD mutations via server actions (`app/projects/actions.ts`) and render projects with a server component page (`app/projects/page.tsx`).
Consequences: Smaller API surface and simpler forms, with redirects used for status/error feedback.

Date: 2026-02-12
Decision: Use Debian Bullseye Node image for Prisma-compatible Docker runtime
Status: Accepted
Context: Prisma engine failed in Alpine and Debian Bookworm images due OpenSSL runtime mismatch during Next build/runtime.
Decision: Use `node:18-bullseye`, run `npx prisma generate` after source copy in `Dockerfile`, and run `npx prisma generate` at compose startup.
Consequences: Reliable Prisma behavior in containerized dev/build; slightly larger image footprint.
Date: 2026-02-12
Decision: Implement Kanban interactions with client-side DnD + server persistence API
Status: Accepted
Context: TASK-003 requires drag-and-drop interactions with reliable status/position persistence.
Decision: Use `@hello-pangea/dnd` in a client component (`components/kanban-board.tsx`) and persist board state through `POST /api/projects/[projectId]/tasks/reorder`.
Consequences: Smooth UX with optimistic movement and explicit persistence boundary; introduces one dedicated API endpoint for board updates.

Date: 2026-02-12
Decision: Normalize task status handling via shared constants/types
Status: Accepted
Context: Kanban columns and persistence logic require consistent status values across server/client.
Decision: Add `lib/task-status.ts` as the single source of truth for status values and validation helpers.
Consequences: Reduces string drift risk and improves strict typing for board operations.
