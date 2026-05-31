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
41-task board. Protected preview API timing through `vercel curl` showed the
same backend flows taking roughly 1.0-2.4 seconds once deployed. Local
Playwright browser timing against `next start` showed task create taking 4.7
seconds from submit to card visible even though direct service creation took
22.1 ms.

The performance problem is therefore layered:

- local service logic is not inherently multi-second;
- deployed preview API calls are already seconds-level;
- browser UX adds more delay by waiting on server confirmation and broad route
  refreshes before the user sees state changes.

Direct unauthenticated `curl`/`fetch` calls to the preview initially returned
`401 Authentication Required` from Vercel deployment protection, before the app
route was reached. The credential itself exchanged successfully when the same
request was made through Vercel-authenticated access.

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

### Local Browser Probe

Environment: Playwright Chromium against local `next start` and Docker Postgres
after `npm run build`. This measures click/submit to visible UI completion.

| Flow | Local browser timing |
| --- | ---: |
| `project.create.submit_to_visible` | 519.9 ms |
| `dashboard.open.project_to_kanban_visible` | 414.7 ms |
| `task.create.submit_to_card_visible` | 4696.2 ms |
| `task.comment.submit_to_visible` | 226.8 ms |
| `context.create.submit_to_card_visible` | 376.0 ms |

Raw sample was written to `.tmp/task-275-browser-benchmark.json` during the
investigation; `.tmp` is intentionally not committed.

The standout is task creation: the browser waits almost 4.7 seconds to see the
new card even though the local create-task service path measured 22.1 ms. The
task create client closes the modal, posts the form, receives only `taskId`, and
then depends on `router.refresh()` to fetch/render the card. This is direct
measured evidence that perceived latency is dominated by refresh/render
orchestration for at least one high-traffic flow.

### Protected Preview API Probe

Environment: branch/main preview protected by Vercel authentication. Direct
HTTP calls returned Vercel's `Authentication Required` page, so the probe used
`vercel curl` and curl `time_total` to measure the protected preview request
after Vercel-authenticated access. The probe exchanged the new agent credential,
then exercised project read, activity read, task list/create/comment/update,
context list/create/update, and full-board reorder.

Warm repeat sample:

| Flow | Preview API timing | Status |
| --- | ---: | ---: |
| `agent.token.exchange` | 1021.0 ms | 200 |
| `project.get` | 1535.1 ms | 200 |
| `activity.get` | 1079.5 ms | 200 |
| `tasks.list.before` | 1898.1 ms | 200 |
| `task.create` | 2442.1 ms | 201 |
| `task.comment.create` | 1533.7 ms | 201 |
| `task.update.patch` | 2152.4 ms | 200 |
| `context.list.before` | 1012.8 ms | 200 |
| `context.create` | 1279.7 ms | 201 |
| `context.update.patch` | 1223.8 ms | 200 |
| `tasks.list.after` | 1776.0 ms | 200 |
| `task.reorder.full_board` | 1551.3 ms | 200 |

The first successful protected-preview run was similar: task create 2622.0 ms,
task update 2409.5 ms, task list 2213.8 ms, and token exchange 1439.1 ms.

This materially changes remediation priority: TASK-276 should not only make UI
updates optimistic; it should also instrument and reduce deployed API latency,
especially task create/update/list paths.

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
4. Deployed preview API calls are seconds-level even for small payloads. Task
   create/update/list timings are much higher on preview than local service
   timings, so network/runtime/database/RLS/serverless overhead needs direct
   instrumentation.
5. Dashboard reads are relatively wide. A refresh reloads summary counts,
   context, epics, kanban metadata, and other Suspense sections.
6. Live refresh is route-refresh based. TASK-118 fixed stale multi-user state,
   but the current transport invalidates by full dashboard refresh rather than
   applying scoped patches.

## Ranked Recommendations For TASK-276

| Rank | Recommendation | Class | Impact | Complexity | Risk | Production durability | Evidence |
| ---: | --- | --- | --- | --- | --- | --- | --- |
| 1 | Make task creation insert a board-ready local card immediately, with pending/error reconciliation. Return a full task payload from `POST /tasks` instead of only `taskId`. | Quick win with durable API shape | Very high | Medium | Medium | High | Browser task create was 4696.2 ms while local service create was 22.1 ms and preview API create was 2442.1 ms. |
| 2 | Add production-safe server timing and request instrumentation around deployed API routes, DB/RLS work, and route refreshes. | Quick win / observability foundation | Very high | Low-medium | Low | High | Preview API timings are already 1.0-2.4 seconds; TASK-276 needs to distinguish network, serverless, query, RLS, and render costs. |
| 3 | Replace mutation-completion `router.refresh()` calls in task update, quick assignment/epic update, comments, and context-card mutations with local state updates plus debounced background reconciliation. | Architectural cleanup, can ship flow-by-flow | Very high | Medium-high | Medium | High | Code paths call `router.refresh()` after narrow mutations; comments/context are already able to render returned payloads locally. |
| 4 | Investigate and reduce deployed task API latency, starting with task create/update/list query paths and project activity touch/RLS overhead. | Backend performance cleanup | High | Medium-high | Medium | High | Preview task create was 2442.1 ms, update 2152.4 ms, and list 1776-1898 ms versus local service timings below 31 ms for create/update and 18.9 ms for list. |
| 5 | Reduce kanban reorder payload/persistence to changed rows or the affected ordering window. | Architectural cleanup | Medium-high | Medium | Medium | High | Full-board reorder updated 41 rows locally in 113.9 ms and took 1551.3 ms on preview; cost grows with board size and remote latency. |
| 6 | Bound dashboard refresh work by splitting or caching server-rendered data so a task/comment/context mutation does not reload unrelated sections. | Architectural cleanup | Medium-high | High | Medium-high | High | Current route refresh can re-run summary counts, context, epics, kanban metadata, roadmap/calendar sections, and live refresh. |
| 7 | Move stale done-task archival out of `listProjectKanbanTasks()` and into scheduled or explicit maintenance. | Durability cleanup | Medium | Medium | Low-medium | High | Read paths currently perform maintenance writes before returning kanban data. |

Recommended implementation order: ship ranks 1-2 first so users see immediate
feedback and the team has real timing visibility. Then reduce refreshes and
deployed task API latency in parallel, because both contribute materially to the
observed delay.

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

The preview is protected by Vercel authentication. Direct unauthenticated agent
API calls fail before reaching the app, so preview automation must use
`vercel curl`, a Vercel protection bypass secret, or an authenticated browser
session. TASK-276 should include one of those access paths in its validation
plan so before/after timings cover real Vercel network, server rendering, and
database behavior.
