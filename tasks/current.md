# Current Task: TASK-118 Real-Time Collaboration Updates

## Task ID
TASK-118

## Status
Implemented locally - PR/preview validation pending

## Source
- `tasks/backlog.md` execution queue, promoted on 2026-05-26 after TASK-274
  and TASK-133.
- User report: when two users work on the same project, task movement or task
  content changes made by one user are invisible to the other user until a
  manual page refresh.

## Objective
Reduce stale-state and manual-refresh friction during shared project work by
propagating project activity changes to other open project dashboards
automatically, while preserving the current Prisma/PostgreSQL architecture,
service-layer authorization, and Vercel deployment constraints.

## Investigation Summary
- Project dashboard data is server-loaded in `app/projects/[projectId]/page.tsx`
  and section components, then handed to client components such as
  `KanbanBoard`, `ProjectContextPanel`, `ProjectEpicPanel`, and
  `ProjectRoadmapPanel`.
- Client panels keep local state for responsive editing and optimistic updates.
  They already resync from fresh props when their own tab calls
  `router.refresh()`.
- Mutation paths are request/response route handlers. The initiating browser
  calls `router.refresh()` after successful writes, but other browsers have no
  subscription, polling, or invalidation signal.
- Existing ADRs reject a Convex migration for now and require near-term
  realtime needs to be solved on the current PostgreSQL/Prisma stack first.
- Vercel/serverless constraints make durable in-process WebSockets a poor fit,
  and the repo does not currently depend on Supabase Realtime client env.

## Selected Approach
- Use `Project.updatedAt` as the durable project activity version.
- Because project RLS only allows owners to update the `Project` row directly,
  editor/content mutations advance this version through a narrow
  `app.touch_project_activity(project_id, activity_at)` security-definer
  function that explicitly validates owner/editor membership before updating
  `Project.updatedAt`.
- Touch the project row after successful project-scoped mutations that affect
  the shared dashboard: tasks, task comments, task attachments, context cards,
  context attachments, epics, and roadmap phases/events/reorders.
- Add an authorized project activity endpoint that returns the current activity
  version for collaborators who can read the project.
- Add a project dashboard live-refresh client boundary that polls the activity
  endpoint at a short interval, detects newer activity from other requests, and
  calls `router.refresh()` when the user is idle.
- If a local edit dialog/form/drag operation is active, defer the refresh and
  show a lightweight "updates available" control so remote changes are not
  allowed to stomp in-progress edits.
- Keep notification-specific realtime work in TASK-263 aligned with this
  transport decision instead of adding a parallel realtime stack.

## Scope
- Project dashboard live updates for shared project entities:
  - Kanban tasks: create, update, reorder, archive/unarchive, delete, comments,
    and attachments.
  - Context cards: create, update, delete, attachments, and direct upload
    finalization/cleanup where it changes visible card state.
  - Epics: create, update, delete, and task rollup refresh after task changes.
  - Roadmap phases/events: create, update, reorder, move, and delete.
- A small reusable polling/refresh client layer for project pages.
- Service-level activity version helpers and focused tests for activity writes
  and endpoint authorization.
- Documentation of the transport decision in `adr/decisions.md` because it
  constrains future notification realtime work.

## Out Of Scope
- WebSocket infrastructure or a new paid realtime provider.
- Full collaborative conflict resolution or CRDT-style concurrent editing.
- Presence indicators, live cursors, or per-user active-edit awareness.
- Google Calendar external event push; calendar panel can keep its existing
  explicit refresh behavior.
- Notification center live updates, which remain tracked by TASK-263.

## Implementation Summary
- Added `GET /api/projects/[projectId]/activity`, authorized through the
  existing API principal and project access services, returning `{ projectId,
  version, serverTime }` with `Cache-Control: no-store`.
- Added `ProjectLiveRefresh` to the project dashboard. It polls the activity
  endpoint every five seconds, calls `router.refresh()` when the activity
  version advances, and defers refresh behind a fixed "Project updates are
  ready" action while a dashboard panel reports local editing/submitting/drag
  activity.
- Added live-refresh locks to Kanban, context cards, epics, and roadmap panels
  so remote refreshes do not interrupt open task/card/epic/roadmap editing,
  delete confirmations, attachment submissions, or roadmap drag operations.
- Wired activity touching through task, task comment/reaction, task attachment,
  context card/attachment, epic, and roadmap mutation services.
- Added focused coverage for activity touch behavior, activity route
  serialization/authorization failure handling, live-refresh auto refresh, and
  deferred refresh.

## Validation Evidence
- `npm run lint` passed.
- `DATABASE_URL=postgresql://nexus:nexus@localhost:5432/nexusdash
  DIRECT_URL=postgresql://nexus:nexus@localhost:5433/nexusdash npm test`
  passed: 112 files passed, 2 skipped; 843 tests passed, 2 skipped.
- Same DB env `npm run test:coverage` passed: 91.23% statements, 81.2%
  branches, 93.42% functions, 91.75% lines.
- Preview-style build env with distinct `DATABASE_URL`/`DIRECT_URL`,
  `GOOGLE_TOKEN_ENCRYPTION_KEY`, and `AGENT_TOKEN_SIGNING_SECRET`
  `npm run build` passed and listed the new
  `/api/projects/[projectId]/activity` route.
- `npx prisma validate` passed.
- `npm run db:local:up` is blocked in this workspace because Docker Desktop is
  not available (`dockerDesktopLinuxEngine` pipe missing), so local Playwright
  E2E could not be run here. Preview two-session smoke remains pending after PR
  creation/deployment.

## Acceptance Criteria
1. A collaborator viewing an open project dashboard automatically sees task,
   context-card, epic, and roadmap changes made by another collaborator without
   manually refreshing the browser.
2. Live refresh is authorized by project membership and does not expose project
   activity state to non-members.
3. Local in-progress edits are protected: remote changes are deferred behind a
   visible refresh affordance while the user is editing, dragging, or submitting
   a local mutation.
4. The implementation preserves optimistic local updates for the actor who made
   the change.
5. Tests cover activity version touching, activity endpoint authorization, and
   live-refresh client behavior for auto-refresh and deferred-refresh cases.
6. Local validation passes: `npm run lint`, `npm test`, `npm run test:coverage`,
   `npm run build`, and an E2E or preview smoke for two-session dashboard
   freshness, or any environment blocker is recorded.

## Definition Of Done
- Implementation is committed on `feature/task-118-realtime-collaboration`.
- `tasks/current.md`, `tasks/backlog.md`, `journal.md`, and
  `adr/decisions.md` are updated with the selected transport and validation
  evidence.
- A ready-for-review PR is opened for TASK-118 and automated feedback is
  handled.
- Preview validation is run for the branch if the deploy workflow is available;
  otherwise the blocker and the local/CI substitute evidence are recorded.
