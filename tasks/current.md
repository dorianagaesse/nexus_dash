# Current Task: TASK-117 Deadline Feature - Due Dates, Urgency Visibility, And Reminder-Ready Planning Hooks

## Task ID
TASK-117

## Status
Implemented locally on `feature/task-117-deadlines` on 2026-04-17; ready for PR and remote review workflow

## Objective
Introduce explicit task deadline tracking so NexusDash can show due dates,
overdue state, and near-term urgency directly in the project workspace, while
laying clean foundations for future reminder/reporting features without
committing this task to a full notification system.

## Why This Task Matters
- The current `Task` model tracks status, archive/completion state, labels,
  attachments, and related-task links, but it has no first-class deadline
  field.
- The dashboard already gives project-level execution signals (`open`,
  `completed`, `context`, `attachments`, calendar connectivity), so deadline
  visibility is the next natural planning layer for day-to-day prioritization.
- `TASK-076`, `TASK-079`, and `TASK-096` already established the core
  multi-user/service-boundary model, safer editing UX, and stronger dashboard
  scanability. This task should extend those patterns rather than invent a new
  interaction model.
- Agent task APIs are already part of the supported product surface, so any
  task-field expansion needs to stay coherent across UI, services, routes, and
  hosted agent documentation.

## Current Understanding
- Task persistence lives in `prisma/schema.prisma`, with project/task authz
  enforced in `lib/services/**` and RLS actor propagation handled through
  `lib/services/rls-context.ts`.
- Task create/update/delete logic is concentrated in
  `lib/services/project-task-service.ts`, with transport adapters under
  `app/api/projects/[projectId]/tasks/**`.
- Project dashboard summary stats are computed in
  `lib/services/project-service.ts` and rendered from
  `app/projects/[projectId]/page.tsx`.
- Task authoring and editing UX currently flows through
  `components/create-task-dialog.tsx`,
  `components/kanban/task-detail-modal.tsx`,
  `components/kanban-board-types.ts`, and the surrounding Kanban/dashboard
  modules.
- The external-service surface relevant to this task is indirect rather than
  deadline-native:
  - PostgreSQL/Supabase for persistence and RLS-backed isolation
  - Cloudflare R2 for attachments
  - Google Calendar for calendar context
  - Vercel/GitHub Actions for CI/CD and preview/release workflow
  - agent onboarding/OpenAPI docs in `lib/agent-onboarding.ts` and
    `/api/docs/agent/v1/openapi.json`

## Working Product Assumptions
- V1 deadline tracking should attach to tasks, not introduce a separate
  canonical `Project.deadline` field unless implementation evidence shows that
  a project-level persisted deadline is required immediately.
- The stored deadline contract should be date-only in v1 (`YYYY-MM-DD` in the
  API/UI, PostgreSQL `DATE` in persistence) so users can express due dates
  without accidental timezone drift.
- "Urgency visibility" should be derived primarily from deadline proximity and
  overdue state, not from a separate manual priority taxonomy in this task.
- "Due soon" should be product-fixed in v1 instead of user-configurable; this
  implementation uses a `3` day threshold for the orange warning state.
- "Reminder-ready" means schema, service contracts, and UI semantics should be
  future-safe for reminders, but this task does not send emails, push
  notifications, calendar reminders, or background jobs.
- Deadline visibility should improve scan-time comprehension in existing
  surfaces first, rather than introducing a brand-new planning page.
- Project-level urgency summaries should focus on active board work rather than
  archived history so the signal stays operationally useful.

## Scope
- Add first-class deadline storage for tasks through the Prisma schema and
  migration layer.
- Extend task service contracts and route adapters so deadlines can be created,
  edited, cleared, validated, and returned consistently.
- Add deadline authoring/editing controls to existing task create and task edit
  flows.
- Surface deadline state in task read surfaces with clear scan-time treatment
  for at least:
  - overdue
  - due today / immediate
  - upcoming
- Add at least one project-level summary signal so the dashboard shows near-term
  commitments more clearly than the current open/completed counts alone.
- Preserve existing project-role/service-layer enforcement and RLS behavior for
  all new reads and writes.
- Keep agent-facing task contracts and hosted OpenAPI/onboarding docs aligned if
  task payloads gain deadline fields.
- Add or update the relevant regression coverage and tracking docs in the same
  task PR.

## Out Of Scope
- Scheduled reminders, queues, cron jobs, emails, push notifications, or
  in-app notification delivery.
- Full roadmap/timeline/milestone planning UX.
- A separate manual priority framework unrelated to deadline timing.
- Realtime collaboration updates.
- Calendar synchronization of task deadlines into Google Calendar events.
- A broad redesign of the dashboard beyond the deadline/urgency additions needed
  for this task.

## Expected Implementation Touchpoints
- `prisma/schema.prisma`
- `prisma/migrations/**`
- `lib/services/project-task-service.ts`
- `lib/services/project-service.ts`
- `app/api/projects/[projectId]/tasks/route.ts`
- `app/api/projects/[projectId]/tasks/[taskId]/route.ts`
- `app/projects/[projectId]/page.tsx`
- `components/create-task-dialog.tsx`
- `components/kanban/task-detail-modal.tsx`
- `components/kanban-board-types.ts`
- `components/kanban-board.tsx` and/or related Kanban subcomponents
- `lib/agent-onboarding.ts`
- relevant `tests/**` and, if needed, Playwright coverage for task create/edit
  visibility

## Resolved Implementation Decisions
1. Deadlines ship as a date-only contract:
   - database field `Task.deadlineAt` stored as PostgreSQL `DATE`
   - API/UI contract `deadlineDate` formatted as `YYYY-MM-DD`
2. Urgency is derived with a fixed v1 threshold:
   - `overdue`: deadline before today
   - `soon`: deadline within the next `3` calendar days
   - `none`: all other states
3. Active project urgency summaries focus on current board tasks rather than
   archived history, while task-level read surfaces still display the explicit
   deadline when present.

## Expected Output
- an active `tasks/current.md` brief for `TASK-117`
- task deadline persistence and API/service support
- updated task create/edit/read UX with deadline visibility
- dashboard-level upcoming/overdue visibility
- aligned tests and documentation updates
- a dedicated task branch and PR that follows the repository shipping workflow,
  including initial Copilot review triage before handoff

## Acceptance Criteria
- Tasks support a persisted deadline value that can be created, updated, and
  cleared through the existing authenticated project task flows.
- Deadline writes and reads remain service-authorized and project-scoped under
  the current `TASK-076` / `TASK-085` boundary model.
- Task create and edit UX exposes the deadline field without degrading the
  existing attachment/related-task flows.
- Task read surfaces make overdue and near-term deadlines visibly scannable.
- The project dashboard gains a clear summary signal for upcoming and/or overdue
  commitments.
- Agent-facing task payload documentation is updated if the API response/request
  contract changes.
- Required tracking docs are updated consistently in the same PR.

## Definition Of Done
1. `TASK-117` is the active task in `tasks/current.md`.
2. Deadline behavior is implemented end to end across schema, services, routes,
   and the primary task/dashboard UI surfaces.
3. Validation is green for the relevant scope:
   - `npm run lint`
   - `npm test`
   - `npm run test:coverage`
   - `npm run build`
   - `npm run test:e2e` if the final UI changes warrant E2E coverage or touch a
     currently covered critical flow
4. Tracking docs are updated consistently (`tasks/current.md`, `journal.md`,
   `adr/decisions.md` if the final design introduces an architecture-level
   decision).
5. The task ships through a dedicated PR whose title includes `TASK-117`, with
   Copilot's initial review state monitored and any valid feedback handled
   before handoff.

## Dependencies
- `TASK-076`
- `TASK-079`
- `TASK-096`

## Evidence Plan
- Repo source of truth:
  - `agent.md`
  - `project.md`
  - `README.md`
  - `prisma/schema.prisma`
  - `lib/services/project-task-service.ts`
  - `lib/services/project-service.ts`
  - `app/projects/[projectId]/page.tsx`
  - `components/create-task-dialog.tsx`
  - `components/kanban/task-detail-modal.tsx`
  - `lib/agent-onboarding.ts`
- Validation source of truth:
  - local lint/unit/coverage/build runs
  - PR checks: `check-name`, `Quality Core`, `E2E Smoke`, and
    `Container Image`

## Validation
- Completed local validation:
  - `npm run lint`
  - `npx -y -p node@20.19.0 node .\node_modules\vitest\vitest.mjs run`
  - `npx -y -p node@20.19.0 node .\node_modules\vitest\vitest.mjs run --coverage`
  - `npx -y -p node@20.19.0 node .\node_modules\next\dist\bin\next build`
- Targeted regression slice also passed under the workstation runtime using
  `npx vitest run` for the deadline-related test set.
- `npm run test:e2e` remains environment-blocked in this session because the
  local PostgreSQL service expected at `127.0.0.1:5432` is unreachable and
  Docker Desktop is not running, so Playwright cannot boot the app against its
  required database fixture.

## Outcome Target
- NexusDash gains first-class task deadline tracking and project-level urgency
  visibility without overcommitting this task to a full reminder system.
- The resulting implementation should make future reminder/reporting work
  additive rather than forcing a deadline-model rewrite.

---

Last Updated: 2026-04-17
Assigned To: Agent
