# NexusDash Project Blueprint (Current State)

Last verified: 2026-04-01

## 1. Vision

NexusDash is a personal/team execution workspace that keeps project planning, delivery tracking, contextual notes, file attachments, and calendar execution in one place.

## 2. Current Product Scope (Implemented)

- Email/password sign-up and sign-in from `/`.
- Email verification and password recovery lifecycle for credentials accounts.
- DB-backed session authentication with protected app routes (`/projects/**`, `/account/**`).
- Multi-project workspace with project CRUD.
- Project sharing v2 with owner-managed invites, role-based membership, email-bound invitation flows, and resumable invite acceptance.
- Project dashboard with three core panels:
  - Context cards (create/edit/delete + attachments)
  - Kanban board (`Backlog`, `In Progress`, `Blocked`, `Done`) with reorder and task detail modal
  - Google Calendar panel (read/create/update/delete events when connected)
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

- Framework: Next.js 14 App Router + TypeScript strict
- UI: Tailwind CSS + Shadcn UI + Lucide + `@hello-pangea/dnd`
- Data: Prisma 5 + PostgreSQL
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
- Domain: `Project`, `Task`, `Resource` (context cards), `TaskBlockedFollowUp`
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

1. TASK-115: agent onboarding v1 - hosted docs, OpenAPI surface, and in-app setup UX
2. TASK-048: authentication hardening + auth regression coverage
3. TASK-061: dependency security baseline
4. TASK-049/TASK-050/TASK-051: OWASP-focused security assessment, remediation, and verification

## 8. Source-of-Truth Docs

- Product/runtime overview: `README.md`
- Agent workflow rules: `agent.md`
- Current execution scope: `tasks/current.md`
- Queue and sequencing: `tasks/backlog.md`
- Execution log: `journal.md`
- Architecture decisions: `adr/decisions.md` + task-specific ADRs in `adr/`
