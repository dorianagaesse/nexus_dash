# Current Task: TASK-127 API Capability Audit And Parity

## Task ID
TASK-127

## Status
Implementation and local validation complete on
`feature/task-127-api-capability-audit`; PR #241 is open with Copilot review
threads resolved and GitHub checks green on the implementation head.

## Objective
Audit the shipped NexusDash product surface against the current API surface and
close concrete gaps so features available in the app are also manageable through
API routes with the same service-layer authorization and validation boundaries.

## Current Scope
- Inventory implemented app features from `project.md`, `README.md`, app routes,
  server actions, API routes, services, and route tests.
- Identify UI-only server-action workflows that lack equivalent API coverage.
- Implement missing API routes by reusing existing service-layer functions and
  keeping API routes as thin transport adapters.
- Preserve the existing agent-access boundary: agent bearer tokens are currently
  scoped to project/task/context-card APIs; account-level settings, human auth,
  and notification inbox actions remain session-user APIs unless explicitly
  widened by an architecture decision.
- Update API/OpenAPI documentation where agent-facing project capabilities are
  added or corrected.
- Add focused route tests and E2E/API validation for newly exposed capabilities.

## Initial Findings
- Project update/delete is exposed at `/api/projects/:projectId`, but project
  list/create is still server-action-only from `/projects`.
- Account profile/security actions, notification inbox state changes, invitation
  responses, and Google Calendar target settings are app features currently
  implemented through server actions rather than API routes.
- Roadmap, epics, task comments, comment reactions, task/context attachments,
  sharing owner controls, member search, calendar events, and agent credential
  management already have route coverage and need verification rather than a
  duplicate implementation.
- Local validation is now expected to use the repo-owned baseline from
  `docs/runbooks/local-validation.md`; Docker is available for the local
  PostgreSQL-backed test path.
- If deployed-preview validation becomes necessary, follow the preview
  Playwright flow in `agent.md`/`README.md` with `PLAYWRIGHT_BASE_URL`.

## Audit Result
- Closed project collection parity with `GET /api/projects` and
  `POST /api/projects`.
- Closed account-management parity with profile read/update, avatar
  regeneration, password update, and Google Calendar target setting routes.
- Closed notification and invitation recipient parity with notification list,
  read/unread, mark-all-read, pending invitation list, and invitation response
  routes.
- Verified that project dashboard features already had API coverage for project
  detail/update/delete, task lifecycle, comments, reactions, context cards,
  attachments, roadmap phases/events, epics, sharing, member search, calendar
  event CRUD, agent credential management, and health probes.
- Left agent v1 OpenAPI unchanged because this task did not expand
  project-scoped agent bearer-token capabilities; the new routes are
  authenticated session-user APIs.

## Acceptance Criteria
1. `tasks/current.md` records the TASK-127 scope, findings, acceptance
   criteria, and validation evidence.
2. The audit maps shipped app features to their current API route coverage and
   records any intentional exclusions or remaining follow-ups.
3. Missing project list/create capability is available through
   `/api/projects` with authenticated session-user access and service-layer
   validation.
4. Missing account settings/profile/security APIs are available for authenticated
   session users where equivalent app server actions already exist.
5. Missing notification inbox and invitation-response APIs are available for
   authenticated session users where equivalent app server actions already
   exist.
6. New routes use existing services, return consistent JSON error/status shapes,
   and do not import Prisma outside `lib/services/**`.
7. Focused API route tests cover success and authorization/error behavior for
   newly added routes.
8. At least one E2E or API-backed integration path proves a newly exposed
   capability works against the local app/database baseline.
9. `journal.md` records the audit findings, implementation decisions, and local
   validation evidence.
10. `tasks/backlog.md` marks TASK-127 complete only after implementation and
    validation are done.

## Definition Of Done
- TASK-127 has a dedicated branch and PR.
- API parity gaps identified in the audit are either implemented or explicitly
  documented as intentional exclusions with rationale.
- Focused route tests, full local validation, production build, and relevant
  Playwright/API validation pass.
- PR is opened, pushed, monitored for checks and Copilot review, and review
  feedback is addressed or explicitly resolved per `agent.md`.

## Validation Evidence
- `npm test -- --run tests/api/projects.route.test.ts tests/api/account-profile.route.test.ts tests/api/account-settings.route.test.ts tests/api/account-notifications.route.test.ts` passed on 2026-05-07 with 26 tests passing after Copilot review fixes.
- `npm run lint` passed on 2026-05-07.
- `npm test` passed on 2026-05-07 with local DB env: 97 files passed, 1 skipped; 742 tests passed, 1 skipped.
- `npm run test:coverage` passed on 2026-05-07 with 91.23% statements, 81.2% branches, 93.42% functions, and 91.75% lines.
- `npm run build` passed on 2026-05-07 after regenerating Prisma Client and setting local production guard env including `GOOGLE_TOKEN_ENCRYPTION_KEY`.
- `npm run build` passed again on 2026-05-07 after Copilot review fixes.
- `npm run test:e2e` passed on 2026-05-07 with 8 Playwright tests passing, including `tests/e2e/api-projects.spec.ts`.
- Local database note: `npm run db:local:up` found port `5432` already allocated, but the PostgreSQL service at `127.0.0.1:5432` was reachable and `npm run db:migrate` reported all 31 migrations applied.

## Out Of Scope
- Adding app-managed outbound email delivery; that remains TASK-125.
- Adding calendar access to project-scoped agent bearer tokens without a new
  architecture decision.
- Adding binary attachment upload/download parity to the agent v1 contract
  beyond existing human-session API routes.
- Reworking auth provider onboarding or password recovery UX beyond exposing
  existing account-management server-action capabilities as JSON APIs.
