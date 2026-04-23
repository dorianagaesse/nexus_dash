# NexusDash Project Blueprint (Current State)

Last verified: 2026-04-23

## 1. Vision

NexusDash is a personal/team execution workspace that keeps project planning, delivery tracking, contextual notes, file attachments, and calendar execution in one place.

## 2. Current Product Scope (Implemented)

- Email/password sign-up and sign-in from `/`.
- Email verification and password recovery lifecycle for credentials accounts.
- DB-backed session authentication with protected app routes (`/projects/**`, `/account/**`).
- Multi-project workspace with project CRUD.
- Project sharing v2 with owner-managed invites, role-based membership, email-bound invitation flows, and resumable invite acceptance.
- Project dashboard with core panels:
  - Context cards (create/edit/delete + attachments)
  - Roadmap milestones with manual visual sequencing and target-date planning
  - Kanban board (`Backlog`, `In Progress`, `Blocked`, `Done`) with reorder, deadline/comment visibility, task epic links, and task detail modal
  - Project epics registry with dedicated epic CRUD, automatic status/progress, and linked-task rollups
  - Google Calendar panel (read/create/update/delete events when connected)
- Task comments:
  - project-scoped, append-only task discussion threads
  - chronological author-attributed comment history in the task detail modal
  - lazy-loaded thread reads with lightweight board-level comment counts
- Project-scoped agent access:
  - owner-managed API credentials in project settings
  - one-time raw API key reveal with rotate/revoke lifecycle
  - short-lived bearer token exchange for supported project/task/context APIs
  - audit trail for credential lifecycle and request use
  - hosted agent onboarding at `/docs/agent/v1` with account-level developer entry and OpenAPI JSON contract
- Attachment system for tasks and context cards:
  - Link + file attachments
  - Local storage provider and Cloudflare R2 provider
  - Provider-aware upload flows (form upload + direct upload pipeline)
- Per-user Google Calendar credential ownership and per-user calendar target setting (`/account/settings`).
- Operational baseline:
  - Health probes (`/api/health/live`, `/api/health/ready`)
  - Request ID propagation (`x-request-id`)
  - Structured server logging

## 3. Architecture and Stack

- Framework: Next.js 16 App Router + TypeScript strict
- UI: Tailwind CSS + Shadcn UI + Lucide + `@hello-pangea/dnd`
- Data: Prisma 7 + PostgreSQL
- Auth model (current):
  - Credentials onboarding + DB sessions for humans
  - Project-scoped agent API credentials exchanged into short-lived signed bearer tokens
  - Google OAuth used for Calendar integration (user-scoped credentials)
- Storage: `StorageProvider` abstraction (`local` or `r2`)
- Testing: Vitest + Playwright
- Runtime/deploy: Docker, GitHub Actions, Vercel CLI staged production deploy/promotion/rollback

## 4. Data Model Snapshot

Current schema includes:

- Auth/session: `User`, `Account`, `Session`, `VerificationToken`
- Authorization boundaries: `Project.ownerId`, `ProjectMembership` (`owner|editor|viewer`)
- Agent auth: `ApiCredential`, `ApiCredentialScopeGrant`, `AuthAuditEvent`
- Domain: `Project`, `RoadmapMilestone`, `Epic`, `Task`, `Resource` (context cards), `TaskBlockedFollowUp`
- Collaboration on tasks: `TaskComment`
- Attachments: `TaskAttachment`, `ResourceAttachment` with `uploadedByUserId`
- Calendar: `GoogleCalendarCredential` (one row per user)

Source of truth: [`prisma/schema.prisma`](./prisma/schema.prisma)

## 5. Delivery and Operations Baseline

- `npm run dev` and `npm run start` run `prisma migrate deploy` before app startup.
- Runtime config is validated at server startup via `validateServerRuntimeConfig()`.
- CI quality gates:
  - `Quality Core`
  - `E2E Smoke`
  - `Container Image`
- CD workflow supports:
  - staged production deploy
  - manual preview deploy
  - promote
  - rollback

## 6. Known Gaps (Intentionally Pending)

- Agent v1 intentionally excludes calendar access, binary attachment upload/download parity, and MCP-based tool transport.
- App-managed invite email delivery is not implemented yet.
- Broader security hardening and verification phases remain pending.

## 7. Active Priorities

From `tasks/current.md` + `tasks/backlog.md`:

1. TASK-123: notification center - unified in-app inbox for invitations, mentions, and future activity
2. TASK-124: comment mentions - project-member @tagging with notification-center delivery
3. TASK-126: comment reactions - lightweight emoji response system on task threads
4. TASK-127: API capability audit - confirm every shipped feature remains fully manageable through the API

## 8. Source-of-Truth Docs

- Product/runtime overview: `README.md`
- Agent workflow rules: `agent.md`
- Current execution scope: `tasks/current.md`
- Queue and sequencing: `tasks/backlog.md`
- Execution log: `journal.md`
- Architecture decisions: `adr/decisions.md` + task-specific ADRs in `adr/`
