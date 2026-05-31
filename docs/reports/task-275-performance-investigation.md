# TASK-275 Performance Investigation

Date: 2026-05-31
Branch: `feature/task-275-performance-investigation`

## Executive Summary

The dominant cause of the slow-feeling UX is not one obviously multi-second
business service. It is the mutation UX architecture: many common actions wait
for a network mutation and then trigger a broad `router.refresh()` before the
user sees the final state.

Local service timing against Docker Postgres showed task/comment/context
mutations in the 15-30 ms range, with full-board reorder at 113.9 ms for a
41-task board. That does not model Vercel network, RSC render, browser work, or
remote database latency, but it strongly suggests the several-second perceived
delay is mostly caused by server-confirmed UI, oversized refresh boundaries, and
route refresh churn rather than a single slow CRUD query.

Preview API timing could not be completed with the current
`tmp/project-access-cred.env` credential because `/api/auth/agent/token`
returned `401 {"error":"invalid-api-key"}`. This report therefore treats local
service timings as backend separation evidence and code-path review as the
primary UX evidence.

## Evidence

### Local Service Probe

Environment: local Docker Postgres, migrations applied with
`npm run db:local:up` and `npm run db:migrate`. Probe seeded one project with
40 tasks and measured service calls directly.

| Flow | Local service timing |
| --- | ---: |
| `project.summary` | 26.6 ms |
| `kanban.list.40_tasks` | 18.9 ms |
| `task.create` | 22.1 ms |
| `task.update.patch` | 30.2 ms |
| `task.comment.create` | 29.4 ms |
| `task.reorder.full_board_41_updates` | 113.9 ms |
| `context.list.empty` | 7.4 ms |
| `context.create` | 29.0 ms |
| `context.update.patch` | 15.4 ms |

Raw sample was written to `.tmp/task-275-service-benchmark.json` during the
investigation; `.tmp` is intentionally not committed.

### Client Mutation Paths

- Task drag/drop is locally optimistic: `components/kanban-board.tsx` updates
  `columns` before persisting. However, persistence posts every column/task ID
  via `buildPersistPayload()` and calls `router.refresh()` after success.
- Task create closes the modal immediately, but the new card does not enter
  local board state. It appears only after `router.refresh()`.
- Task edit, quick assignment/epic updates, and comments wait for `PATCH` or
  `POST`, then apply local state, then call `router.refresh()`.
- Context card create closes the modal immediately but only inserts the returned
  card after the server responds, then refreshes the full project route.
- Project create/update use Server Actions with `revalidatePath()` and redirect,
  so the project list waits on the server action/navigation path.
- Live project refresh polls every 5 seconds and also calls `router.refresh()`
  when a newer activity version is seen, adding more full-route refresh pressure.

### Server/Query Paths

- `getProjectSummaryById()` performs the project lookup plus multiple counts for
  dashboard stats on route render.
- `KanbanBoardSection` loads tasks, collaborators, and epics together for every
  board render.
- `listProjectKanbanTasks()` calls `archiveStaleDoneTasks()` on reads and loads
  task counts, attachments, blocked follow-ups, related tasks, creator/updater,
  assignee, and epic metadata.
- `reorderProjectTasks()` updates every task ID supplied by the client. Because
  the client sends all columns, a single drag can become N task updates.
- Every mutation touches project activity, which is correct for collaboration
  but also means every action becomes visible to the live-refresh poller.

## Root Causes

1. Missing optimistic or immediate local state for create/update/comment flows.
   The user-visible state often changes only after server confirmation.
2. Broad route refresh after narrow mutations. Small actions refresh the project
   dashboard instead of updating the relevant client cache and reconciling in
   the background.
3. Full-board reorder payload and persistence. Dragging one task sends the whole
   board shape and updates all supplied rows, which grows with board size.
4. Dashboard reads are relatively wide. A refresh reloads summary counts,
   context, epics, kanban metadata, and other Suspense sections.
5. Live refresh is route-refresh based. TASK-118 fixed stale multi-user state,
   but the current transport invalidates by full dashboard refresh rather than
   applying scoped patches.

## Recommendations For TASK-276

1. Make high-traffic mutations locally responsive first:
   task create, task update, task assignment/epic update, comments, context card
   create/update/delete, and project list create/update.
2. Replace mutation-completion `router.refresh()` calls with local cache updates
   plus debounced background reconciliation. Keep refresh as a fallback, not the
   primary success path.
3. Return complete mutation payloads where needed. Task create should return a
   board-ready task payload, not only `taskId`.
4. Change reorder persistence to send only the moved task and affected ordering
   window, or at least update only rows whose status/position changed.
5. Move stale done-task archival out of the kanban read path into a scheduled or
   explicit maintenance path.
6. Add lightweight observability before and after remediation: client
   performance marks for click-to-visible-update and server timing for the
   mutation and refresh endpoints.

## Validation Targets

TASK-276 should measure these before and after on preview or production-like
data:

- Create task: click submit to card visible.
- Add comment: click add to comment visible and count incremented.
- Quick assignee/epic update: menu click to visible metadata update.
- Drag task between columns: mouse up to card visible in target column, plus
  background persistence completion.
- Create context card: submit to card visible.
- Create/update project: submit to project visible/updated in list.

The target product behavior is immediate visible feedback under 100 ms for safe
local mutations, with server reconciliation completing in the background and
clear rollback/error states when persistence fails.

## Open Risk

The invalid preview agent credential blocked production-like API timings. Before
TASK-276 final validation, refresh the preview credential or validate with a
signed-in browser session on the branch preview so before/after numbers cover
real Vercel network, server rendering, and database behavior.
