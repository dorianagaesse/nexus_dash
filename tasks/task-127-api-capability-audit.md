# TASK-127 API Capability Audit

Date: 2026-05-07
Branch: `feature/task-127-api-capability-audit`

## Summary

The audit compared implemented app features in `project.md`, `README.md`, App
Router pages/actions, service modules, and existing API routes. The shipped
project dashboard features already had broad API coverage. The concrete parity
gaps were around collection-level project management and account-level
workflows that were still exposed only through server actions.

## Implemented Gaps

App capability | Previous API state | TASK-127 action
--- | --- | ---
Project list and project create from `/projects` | `/api/projects/:projectId` supported read/update/delete, but collection list/create was server-action-only | Added `GET /api/projects` and `POST /api/projects` for authenticated session users
Account profile read/update from `/account` | Server-action-only | Added `GET /api/account/profile` and single-field `PATCH /api/account/profile`
Generated avatar regeneration | Server-action-only | Added `POST /api/account/profile/avatar`
Password update | Server-action-only | Added `PATCH /api/account/password` with current-session token preservation
Google Calendar target setting from `/account/settings` | Server-action-only | Added `GET`, `PATCH`, and `DELETE /api/account/settings/google-calendar`
Notification inbox list/read state | Server-action-only from `/account/notifications` | Added `GET` and `PATCH /api/account/notifications`, plus `POST /api/account/notifications/mark-all-read`
Pending project invitations and response actions | Server-action-only on account/invite flows | Added `GET /api/account/invitations` and `POST /api/account/invitations/:invitationId/respond`

## Verified Existing Coverage

App capability | Existing API coverage
--- | ---
Project detail, update, delete | `GET`, `PATCH`, `DELETE /api/projects/:projectId`
Kanban task create/update/archive/reorder | `/api/projects/:projectId/tasks/**`
Task comments and emoji reactions | `/api/projects/:projectId/tasks/:taskId/comments/**`
Context cards | `/api/projects/:projectId/context-cards/**`
Task and context-card attachments | `/api/projects/:projectId/**/attachments/**`, including local/R2 upload paths
Roadmap phases/events and drag operations | `/api/projects/:projectId/roadmap/**`
Project epics | `/api/projects/:projectId/epics/**`
Project sharing owner workflows | `/api/projects/:projectId/sharing/**`
Project member search and mention support | `/api/projects/:projectId/members/search` and sharing search route
Google Calendar event CRUD | `/api/calendar/events/**`
Agent credential management | `/api/projects/:projectId/agent-access/**`
Health and operational probes | `/api/health/live`, `/api/health/ready`

## Intentional Boundaries

- The new account, notification, invitation, settings, and project collection
  APIs are session-user APIs. They use `requireAuthenticatedApiUser`, not agent
  bearer-token access.
- Agent v1 OpenAPI was left unchanged because TASK-127 did not expand the
  project-scoped agent contract. Calendar access, account settings, human
  notification inboxes, and credential/account security workflows remain outside
  agent-token scope.
- Binary attachment upload/download parity for agent tokens remains excluded by
  the existing agent v1 boundary. Human session APIs already cover those flows.
- App-owned outbound email sending remains TASK-125/TASK-104 scope. TASK-127
  only exposes the existing email-verification issuance path used by account
  email changes.

## Validation Plan

- Focused Vitest route coverage for new APIs:
  - `tests/api/projects.route.test.ts`
  - `tests/api/account-profile.route.test.ts`
  - `tests/api/account-settings.route.test.ts`
  - `tests/api/account-notifications.route.test.ts`
- Playwright API-backed E2E proof:
  - `tests/e2e/api-projects.spec.ts`
  - Signs in with the local DB helper, creates a project through
    `POST /api/projects`, verifies it through `GET /api/projects`, then checks
    the created project appears in the app.
- Full local validation uses the TASK-131 baseline documented in
  `docs/runbooks/local-validation.md`: Docker-backed PostgreSQL, migrations,
  lint, unit/API tests, coverage, production build, and Playwright.
