# NexusDash Project Blueprint (Current State)

Last verified: 2026-07-05

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
  - Meeting notes with searchable project-scoped history, task-style labels,
    label filters, structured participants, preparation inputs, meeting outputs,
    todo tracking, overdue highlights, state, and archived done notes
  - Roadmap event-first milestone lanes with grouped child events, drag-and-drop regrouping, and target-date planning
  - Kanban board (`Backlog`, `In Progress`, `Blocked`, `Done`) with reorder, deadline/comment visibility, task epic links, and task detail modal
  - Project epics registry with dedicated epic CRUD, automatic status/progress, and linked-task rollups
  - Google Calendar panel (read/create/update/delete events when connected)
  - Server-sent-events-backed live project refresh with typed activity events
    for task, task-comment, and context-card mutations; dashboards apply safe
    remote updates directly, keep adaptive polling and broad refresh as
    fallbacks, and acknowledge local mutations to avoid self-refresh prompts
- Notification center:
  - durable per-user in-app inbox at `/account/notifications`
  - unread/read state and resolved lifecycle
  - project invitation delivery, accept/decline actions, and notification-aware account menu counts
  - account-scoped live notification snapshots over SSE with polling fallback
    so unread counts, awareness banners, and notification-center rows update
    without navigation
  - foundation for future mention and activity producers
  - DB-backed notification email orchestration for project activity digests,
    invitation reminders, and three-day task due-date reminders, with
    recipient/project grouping, debounce timing, and outbound delivery records
- Task comments:
  - project-scoped, append-only task discussion threads
  - chronological author-attributed comment history in the task detail modal
  - lazy-loaded thread reads with lightweight board-level comment counts
  - agent-authored comments keep project credential attribution by displaying
    the credential label with an `(agent)` suffix and a shared agent avatar
- Project-scoped agent access:
  - owner-managed API credentials in project settings
  - one-time raw API key reveal with rotate/revoke lifecycle
  - short-lived bearer token exchange for supported project/roadmap/task/context APIs
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
- Notification email scheduling: GitHub Actions currently invokes the protected
  dispatcher every 30 minutes as an early-production bridge while Vercel remains
  on Hobby and no managed scheduler is in use. This keeps grouped email
  delivery active with app-owned idempotency, while still depending on GitHub
  scheduled workflow reliability rather than a hard real-time worker.

## 4. Data Model Snapshot

Current schema includes:

- Auth/session: `User`, `Account`, `Session`, `VerificationToken`
- Authorization boundaries: `Project.ownerId`, `ProjectMembership` (`owner|editor|viewer`)
- Agent auth: `ApiCredential`, `ApiCredentialScopeGrant`, `AuthAuditEvent`
- Domain: `Project`, `ProjectActivityEvent`, `RoadmapPhase`, `RoadmapEvent`,
  `Epic`, `Task`, `Resource` (context cards), `ProjectMeetingNote`,
  `ProjectMeetingNoteAction`, `TaskBlockedFollowUp`. Meeting notes store
  task-style `labelsJson` and a simple state (`prepared`,
  `actions_in_progress`, `done`) so done notes can be shown in an archived
  list; open todos are considered overdue seven days after the meeting date for
  project-page highlighting.
- Collaboration on tasks: `TaskComment` with optional agent credential
  attribution metadata for agent-authored comments
- Attachments: `TaskAttachment`, `ResourceAttachment` with `uploadedByUserId`
- Calendar: `GoogleCalendarCredential` (one row per user)
- Notification email orchestration: `ProjectNotificationEmail` and
  `ProjectNotificationEmailItem`

Source of truth: [`prisma/schema.prisma`](./prisma/schema.prisma)

## 5. Delivery and Operations Baseline

- `npm run dev` and `npm run start` run `prisma migrate deploy` before app startup.
- Runtime config is validated at server startup via `validateServerRuntimeConfig()`.
- CI quality gates:
  - `Quality Core`
  - `E2E Smoke`
  - `Container Image`
- GitHub Actions workflow inventory is tracked in
  `docs/runbooks/github-actions-workflows.md`.
- CD workflow supports:
  - staged production deploy
  - manual preview deploy
  - promote
  - rollback

## 6. Known Gaps (Intentionally Pending)

- Agent v1 intentionally excludes calendar access and MCP-based tool transport.
- App-managed invite email delivery is not implemented yet.
- Broader security hardening and verification phases remain pending.

## 7. Active Priorities

From `tasks/current.md` + `tasks/backlog.md`:

1. The prioritized UI/UX remediation sequence is TASK-321, TASK-322, TASK-100,
   TASK-133, TASK-129, TASK-108, then the TASK-323 verification gate.

## 8. Source-of-Truth Docs

- Product/runtime overview: `README.md`
- Agent workflow rules: `agent.md`
- Current execution scope: `tasks/current.md`
- Queue and sequencing: `tasks/backlog.md`
- Execution log: `journal.md`
- Architecture decisions: `adr/decisions.md` + task-specific ADRs in `adr/`
