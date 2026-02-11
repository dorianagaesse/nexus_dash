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
