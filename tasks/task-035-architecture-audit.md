# TASK-035 Architecture Audit (Draft)

Date: 2026-02-15
Status: In Progress

## 1) Executive Summary

NexusDash has a solid MVP architecture for a single-user/local environment, with good momentum and clear product value. The current structure is not yet ready for production-grade multi-user authentication, stronger security controls, and reliable operations without targeted refactoring.

Recommendation: do a **targeted medium refactor**, not a rewrite.

- Do **not** do a big-bang redesign.
- Do **not** keep architecture fully as-is.
- Refactor specific boundaries before TASK-020/TASK-021/TASK-023 execution.

## 2) Current Architecture Snapshot

### Runtime and Application Structure

- Framework: Next.js App Router + TypeScript strict.
- Rendering pattern:
  - Server-rendered pages and server actions for core project/task/context-card mutations.
  - Client-heavy components for interactive Kanban/context/calendar panels.
- API layer:
  - Dedicated API routes for drag reorder, task edit, attachments CRUD/download, calendar reads/writes, OAuth callback.

Key references:
- `app/projects/[projectId]/page.tsx`
- `app/projects/[projectId]/actions.ts`
- `app/api/projects/[projectId]/tasks/reorder/route.ts`
- `app/api/projects/[projectId]/tasks/[taskId]/route.ts`
- `app/api/calendar/events/route.ts`
- `app/api/calendar/events/[eventId]/route.ts`

### Data and Persistence

- Database: Prisma + SQLite.
- Core models: `Project`, `Task`, `Resource`, `TaskAttachment`, `ResourceAttachment`, `TaskBlockedFollowUp`.
- Calendar tokens stored in a singleton record:
  - `GoogleCalendarCredential.id @default("default")`.

Key references:
- `prisma/schema.prisma:10`
- `prisma/schema.prisma:21`
- `prisma/schema.prisma:40`
- `prisma/schema.prisma:92`
- `prisma/schema.prisma:93`

### Integration Boundaries

- Google OAuth/Calendar integration:
  - OAuth init + callback routes set/validate state cookie and persist token.
  - Calendar access token refresh handled by `lib/google-calendar-access.ts`.
- Attachments:
  - Stored on local filesystem (`/storage/uploads`) through `lib/attachment-storage.ts`.
  - Exposed via download endpoints.

Key references:
- `app/api/auth/google/route.ts`
- `app/api/auth/callback/google/route.ts`
- `lib/google-calendar-access.ts`
- `lib/attachment-storage.ts`

### Test Posture

- Unit tests for core libs.
- Integration tests for important API routes (tasks reorder/update, calendar routes).
- Coverage thresholds active in Vitest config.

## 3) Strengths

1. Product-first delivery cadence is strong; features are shipping end-to-end with tests.
2. Good use of shared utility modules for status/label/rich-text/attachments.
3. API contracts and error mapping are reasonably explicit.
4. Dockerized local environment exists and Prisma migrations are in place.

## 4) Risks and Debt (Honest Assessment)

### A. UI/Component Overgrowth (High)

Major components are now too large and carry mixed concerns (rendering + orchestration + networking + form state + modal logic):

- `components/kanban-board.tsx` (~1236 lines)
- `components/project-context-panel.tsx` (~841 lines)
- `components/project-calendar-panel.tsx` (~1355 lines)

Impact:
- Higher regression risk.
- Harder code review and onboarding.
- Slower feature changes in auth/security-sensitive flows.

### B. Server Actions + API Routes Split Without Clear Mutation Boundary (High)

Mutations are split across server actions and API routes with duplicated validation/attachment handling patterns.

Examples:
- `app/projects/[projectId]/actions.ts` (~414 lines)
- Attachments logic duplicated between server actions and API route handlers.

Impact:
- Drift risk between paths.
- Harder to enforce consistent auth and audit controls later.

### C. Missing User/Tenant Boundary (Critical for Upcoming Work)

Current schema has no user/account model and no membership/ownership relation to projects.
Project/task routes currently scope by `projectId`/`taskId`, not authenticated principal.

Impact:
- Blocks secure multi-user auth rollout.
- Authorization model is currently absent.

### D. Global Calendar Credential Singleton (High)

Google credential storage is global (`id="default"`), not per user/workspace.

Impact:
- Incompatible with real multi-user auth model.
- Security and data isolation concerns.

### E. Domain Logic Embedded in Page Layer (Medium)

Business logic such as automatic archive update is in page data-loading path.

Reference:
- `app/projects/[projectId]/page.tsx:81`
- `app/projects/[projectId]/page.tsx:84`

Impact:
- Harder reuse/testing and future worker/cron extraction.

### F. Operational Readiness Gaps (High for Production)

- SQLite + local filesystem are fine for MVP, but fragile for production scale and horizontal deploy.
- No explicit observability baseline yet.
- No auth middleware gate yet.

## 5) Should Architecture Be Rethought?

Yes, but **not** as a full rewrite.

Accurate framing in English:
- "The architecture should be **rethought at key boundaries**."

Those boundaries are:
1. Identity/authorization boundary (user and project ownership).
2. Mutation boundary (single application/service layer used by server actions and API).
3. Frontend composition boundary (break giant components into focused modules).
4. Infrastructure boundary (storage, secrets, deployment, observability).

## 6) Refactor Recommendation (Small vs Big)

Recommendation: **targeted medium refactor** before deep auth/security implementation.

### Not recommended
- Big rewrite now.
- Continuing with current shape unchanged into TASK-021 and TASK-023.

### Recommended phased approach

1. **Refactor-1: Backend application services**
   - Extract task/context-card/attachment/calendar domain logic into `lib/services/*`.
   - Keep route handlers/actions thin (parse -> call service -> map response).

2. **Refactor-2: Auth-ready data model foundation**
   - Add user/account/session/project-membership models.
   - Replace singleton calendar credential with user-scoped credential.

3. **Refactor-3: Frontend decomposition**
   - Split each large panel into smaller components + hooks:
     - board state/reorder hook
     - task modal/edit hook
     - attachment manager module
     - calendar event form + date picker modules

4. **Refactor-4: Security/ops guardrails**
   - Route guards/middleware.
   - Structured logging, health endpoints, and deploy-safe configuration.

## 7) Practical Go/No-Go for Upcoming Tasks

- **Go** for deployment baseline phases (TASK-039..TASK-043), but include auth-ready constraints.
- **Go** for TASK-020 only after architecture audit findings are accepted.
- **No-Go** for full TASK-021 implementation until user/membership model and auth boundary are designed.
- **No-Go** for TASK-023 remediation sprint until auth baseline exists, otherwise many fixes will be reworked.

## 8) Proposed Follow-Up Tasks Triggered by This Audit

Suggested additions (if accepted):

1. `TASK-052`: Service-layer extraction for task/context-card/attachment/calendar mutations.
2. `TASK-053`: Auth-ready schema evolution (User, Session, ProjectMembership, scoped Google credentials).
3. `TASK-054`: Frontend panel decomposition (Kanban/context/calendar modularization).

