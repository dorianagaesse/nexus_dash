# TASK-310 Full-Stack Product Performance Investigation

Date: 2026-06-04
Branch: `docs/task-310-performance-investigation`

## Executive Summary

NexusDash no longer has one generic "the app is slow" problem. After
TASK-276, the actor-side UI for common task creation can be fast: in a local
production-mode probe, creating a task from the dashboard became visible in
140 ms while the API route itself took 86.4 ms.

The remaining severe gap is collaboration freshness and broad reconciliation.
In the same local production-mode probe, a task created through the API while
an already-open dashboard observed the project took 72 ms server wall-clock,
but the observer did not see the card for 4513 ms. That reproduces the user's
reported 4-5 second remote update delay without deployed database latency in
the way.

The root cause is layered:

- The TASK-309 SSE route is a transport improvement, but it is backed by a
  server-side database poll every 1000 ms rather than mutation-published
  events.
- A remote activity event still calls `router.refresh()`, which reloads the
  project dashboard route instead of applying a targeted task/context/roadmap
  patch to client state.
- The dashboard refresh re-runs broad server data work: project summary counts,
  context cards, epics, kanban tasks/collaborators/epics, roadmap phases, and
  calendar client UI setup.
- Preview API timings from TASK-276 remain seconds-level for common routes, so
  deployed runtime/database latency compounds the observer refresh problem.

The highest-impact next task should not be "make polling faster". It should
make project updates event-driven and targeted: publish typed mutation events,
apply safe remote patches directly to the relevant client store, and keep broad
route refresh as a background reconciliation or safety fallback.

## User-Perceived Latency Model

Performance needs to be split by what the user is waiting for:

| Layer | Current state | User impact |
| --- | --- | --- |
| Local interaction feedback | Improved for several task/comment/context flows by TASK-276. | The actor often sees their own update quickly. |
| Server mutation time | Fast locally, seconds-level in prior preview evidence. | The actor still waits for some confirmations and deployed API calls can dominate. |
| Activity propagation | SSE route polls project activity from the database every 1000 ms per connection. | Remote users wait for the next poll, not an immediate mutation-published event. |
| Client reconciliation | Remote event calls full `router.refresh()`. | A narrow task change reloads the dashboard instead of updating one card. |
| Server-render refresh | Project dashboard fetches multiple sections. | Observer-visible update can take seconds even after a fast mutation. |
| Notification/invitation freshness | Still tracked by TASK-263. | Invites/notification counts can remain stale without reload. |

## Evidence

### Static Code Path

The project dashboard page mounts `ProjectLiveRefresh` with the project
`updatedAt` version, then renders the summary and five dashboard sections:
context, epics, kanban, roadmap, and calendar.

Relevant paths:

- `components/project-live-refresh.tsx`
- `app/api/projects/[projectId]/activity/stream/route.ts`
- `app/projects/[projectId]/page.tsx`
- `app/projects/[projectId]/kanban-board-section.tsx`
- `lib/services/project-activity-service.ts`

The stream route:

- authenticates the principal;
- checks project read scope;
- reads the current project activity snapshot;
- sends an initial `project-activity` event;
- loops until timeout, sleeping `PROJECT_ACTIVITY_STREAM_POLL_INTERVAL_MS`
  (`1000` ms), then calling `getProjectActivitySnapshot()` again;
- emits a new event only when `Project.updatedAt` is newer.

That means the current SSE route is not true mutation fanout. It is database
polling moved from the browser to the server.

The client handler keeps good edit-lock/local-acknowledgement behavior, but the
remote path still ends here:

```ts
startRefreshTransition(() => {
  router.refresh();
});
```

That refresh is broad. A remote task title change can cause the server to rebuild
summary counts, context data, epics, kanban tasks/collaborators/epics, roadmap
phases, and calendar panel state.

### Local Production-Mode API And Browser Probe

Environment:

- local Docker Postgres;
- migrations already applied;
- `npm run build`;
- `next start` on `127.0.0.1:3150`;
- seeded project with 24 tasks, 8 context cards, 3 epics, and 3 roadmap phases
  with 9 events.

Representative API timings:

| Flow | Wall time | App timing header |
| --- | ---: | ---: |
| `GET /api/projects/:projectId` | 56 ms | n/a |
| `GET /api/projects/:projectId/tasks` | 32 ms | `tasks-list;dur=25.4` |
| `GET /api/projects/:projectId/context-cards` | 14 ms | `context-list;dur=7.7` |
| `GET /api/projects/:projectId/activity` | 17 ms | n/a |
| UI task create, submit to card visible | 140 ms | `task-create;dur=86.4` |
| Remote/API task create while observer dashboard is open | 72 ms | `task-create;dur=63.0` |
| Observer card visible after remote/API task create | 4513 ms total | 4441 ms after mutation completed |

This is the most important measurement. Local database and API work were fast,
yet the observer still waited about 4.5 seconds. The remaining latency is
therefore in propagation/reconciliation/rendering, not simply in the mutation
service.

Dashboard navigation in the same probe reached the kanban heading in 786 ms.
The document response was 261 ms; many static chunks completed around 207-214
ms. This is acceptable locally, but it confirms that a full refresh is much
heavier than a local state patch.

### Instrumented SSE Check

A separate instrumented browser run wrapped `EventSource` to log stream events.
It confirmed:

- the stream opened shortly after page load;
- the initial `project-activity` event was delivered;
- after a remote/API task create with a 64 ms wall time and 38 ms app timing,
  the next `project-activity` event arrived about 836 ms after the mutation
  marker.

That result matches the server-side 1000 ms polling design. The same
instrumented run was not used as visible-update evidence because the monkey
patch interfered with normal refresh observation, but it is useful transport
evidence: even when the event arrives in under a second locally, the current
architecture still depends on a broad route refresh to make the update visible.

### Prior Deployed Preview Evidence

TASK-276 already captured direct preview API timing after Vercel protection was
disabled. Those timings remain relevant because TASK-309 changed the activity
transport, not the deployed service/database cost.

| Flow | Preview p50 |
| --- | ---: |
| `project.get` | 1412.5 ms |
| `activity.get` | 953.8 ms |
| `tasks.list` | 1603.6 ms |
| `task.create` | 2316.9 ms |
| `task.comment.create` | 1496.3 ms |
| `task.update.patch` | 2029.4 ms |
| `task.reorder.move` | 1109.2 ms |
| `context.list` | 888.9 ms |
| `context.create` | 1170.5 ms |
| `context.update.patch` | 1179.8 ms |

Those numbers explain why deployed observers can feel worse than the local
4513 ms result: remote propagation waits on mutation completion, stream polling,
and then route refresh work that may include deployed API/database/RSC latency.

### Runtime And Platform Constraints

Vercel Functions support streaming responses, but WebSocket-style realtime
fanout is not something to build as a native long-lived stateful function on
Vercel. Vercel's WebSocket guidance points applications toward managed realtime
providers such as Ably, Convex, Liveblocks, Pusher, PubNub, Firebase Realtime
Database, Supabase, and others:
https://vercel.com/kb/guide/do-vercel-serverless-functions-support-websocket-connections

Vercel also documents streaming Function responses as a way to improve
perceived speed when chunks can be sent as they become ready:
https://vercel.com/docs/functions/streaming

For NexusDash, this supports a practical conclusion:

- SSE is an acceptable near-term transport for server-to-client invalidation.
- The current SSE implementation is not sufficient as a state-of-the-art
  collaboration layer because it still polls the database and refreshes the
  whole route.
- If NexusDash wants production-grade collaboration freshness, a managed
  realtime/event bus is the durable path once targeted event payloads exist.

## Root Causes

### 1. Remote Updates Are Still Full-Route Refreshes

`ProjectLiveRefresh` receives a newer project activity version and calls
`router.refresh()`. That invalidates and re-renders the dashboard route instead
of applying a typed mutation to the relevant client state.

Impact: a task card move, task comment, or context update can reload unrelated
dashboard sections.

Confidence: high. The code path is direct, and local probe showed observer
latency of 4513 ms after a 72 ms mutation.

### 2. SSE Is Poll-Backed, Not Mutation-Published

The stream route sleeps for 1000 ms and queries
`getProjectActivitySnapshot()` in a loop. This reduces browser polling and gives
an SSE API surface, but it does not deliver immediately when a mutation commits.

Impact: remote users inherit up to about 1 second of transport delay before any
refresh work begins. Every open dashboard also creates repeated DB activity
snapshot reads.

Confidence: high. The interval is explicit in the route and the instrumented
event arrived around 836 ms after the mutation marker.

### 3. Deployed API/Database Runtime Is Still Seconds-Level

Local service/API timings are tens of milliseconds, while prior direct preview
timings were roughly 0.9-2.3 seconds for common routes.

Impact: even perfect local optimistic UI cannot make deployed collaboration
feel state-of-the-art if mutation confirmation and refresh reads cost seconds.

Confidence: medium-high. The preview timing data is from TASK-276, not rerun
with fresh credentials in TASK-310 because the stored agent keys now return
`invalid-api-key`. The prior data is still useful because no later task
addressed deployed service/query latency.

### 4. Dashboard Data Fetching Is Broad

On route render, summary counts and multiple sections fetch wide data. The
kanban section loads tasks, collaborators, and epics; task rows include comment
counts, attachments, blocked follow-ups, related tasks, creator/updater,
assignee, and epic metadata.

Impact: broad refreshes get more expensive as the project grows, and remote
updates pay that cost even when only one entity changed.

Confidence: high from static inspection.

### 5. Activity Version Is Too Coarse

The project activity version is a single project-level timestamp. It can tell a
dashboard that "something changed", but not what changed.

Impact: the client cannot safely patch only a task/comment/context card because
the event payload lacks domain, entity ID, operation, actor, and a post-mutation
payload or invalidation target.

Confidence: high from the `{ projectId, version, serverTime }` contract.

### 6. Notification Freshness Remains Separate

Project invitations and notification counts are tracked by TASK-263, not solved
by dashboard project activity. The user already observed needing a reload to see
an invite.

Impact: collaboration still feels stale outside the project dashboard.

Confidence: high from backlog scope and user observation.

## Recommended Implementation Path

### Rank 1 - Typed Project Event Contract And Client Reconciliation

Create a typed project event contract emitted by mutations:

- `eventId`
- `projectId`
- `version`
- `actorUserId` or actor kind
- `domain`: `task`, `task-comment`, `context-card`, `epic`, `roadmap`,
  `project`, `notification`
- `operation`: `created`, `updated`, `deleted`, `moved`, `reordered`
- `entityId`
- optional canonical payload for safe local patching
- fallback invalidation targets

Then update the dashboard client state directly for safe events:

- add/update/move a task card;
- increment comment counts or append a comment when the detail modal is open;
- add/update/delete context cards;
- update epic task rollups when available;
- trigger targeted background fetches for complex sections.

Keep full `router.refresh()` as a fallback for unknown event types, schema
version mismatch, edit-lock conflicts, or reconciliation failure.

Expected impact: very high. This attacks the measured 4.5 second observer
delay.

Effort: high.

Risk: medium-high, because board/context/epic/roadmap state boundaries need to
stay correct.

### Rank 2 - Mutation-Published Realtime Transport

Replace stream-side DB polling with mutation-published events.

Near-term options:

- in-process ephemeral event hub for local/dev and single-instance preview
  learning;
- Postgres `LISTEN/NOTIFY` only if connection/session constraints are proven
  acceptable;
- managed realtime provider as the production-aligned path.

Best production path for NexusDash:

- keep the app database as source of truth;
- persist an append-only `ProjectActivityEvent` table for audit/replay and
  missed-event recovery;
- publish to managed realtime on mutation commit;
- stream to clients through either the provider SDK or an app SSE adapter;
- let clients reconnect with `lastEventId` and recover from the event table.

Expected impact: high. It removes the 0-1000 ms polling floor and avoids
per-client DB polling load.

Effort: high.

Risk: medium, mostly provider/env/ops complexity.

### Rank 3 - Production Latency Instrumentation

Add real observability before optimizing database/runtime paths:

- mutation start/end timestamps;
- project event published timestamp;
- client event received timestamp;
- client patch applied timestamp;
- fallback refresh start/end timestamp;
- server timing around service, RLS/access checks, DB reads/writes, and
  notification side effects;
- sampled client custom metrics for actor and observer latency.

Expected impact: high for diagnosis and regression prevention.

Effort: medium.

Risk: low if sampling and PII hygiene are handled.

### Rank 4 - Reduce Deployed API/DB Cost

Investigate and optimize:

- query counts for task list/create/update/comment;
- RLS transaction overhead and repeated `requireProjectRole` checks;
- project summary count queries;
- route refresh RSC payload size;
- notification/email side effects that can be deferred;
- region/database locality and connection pooling behavior.

Expected impact: high in preview/production.

Effort: medium-high.

Risk: medium.

### Rank 5 - Split Dashboard Data Boundaries

Move toward section-level or entity-level data refresh:

- keep kanban board data in a client store;
- fetch comments lazily per task;
- fetch roadmap/context/epic modules independently;
- use background reconciliation rather than immediate full route refresh;
- avoid refreshing calendar/roadmap when task-only events arrive.

Expected impact: medium-high.

Effort: high.

Risk: medium.

## Proposed Follow-Up Implementation Task

Title:
Product latency remediation - typed realtime events and targeted dashboard
reconciliation

Objective:
Make collaboration updates feel production-grade by replacing project-level
"something changed" refresh behavior with typed project events that can update
the relevant dashboard client state immediately, while preserving broad refresh
as a safe fallback.

Acceptance criteria:

1. Mutations emit typed project activity events for task create/update/move,
   task comment create, and context card create/update/delete.
2. Remote task/context/comment events update the open dashboard without waiting
   for a full `router.refresh()` when the user is not editing the affected
   entity.
3. Unknown or unsafe events still fall back to the current safe refresh prompt
   or auto-refresh behavior.
4. Observer-visible task create/move/update latency is measured locally and
   reduced from ~4.5 seconds to under 1.5 seconds, with a stretch target under
   500 ms after mutation completion on local production mode.
5. The implementation records client-side timing marks for mutation completion,
   event receipt, patch application, and fallback refresh.
6. The design keeps a clear path to managed realtime by separating event
   creation, event persistence, event publication, and client reconciliation.

Definition of done:

- focused tests cover event creation and client reconciliation;
- local production-mode browser probe records before/after observer latency;
- preview validation records at least one actor-side flow and one observer-side
  flow;
- `tasks/backlog.md`, `tasks/current.md`, `journal.md`, and ADR docs are
  updated.

## Implementation Notes

Recommended first slice:

1. Introduce a project activity event type and service helper that mutations can
   call after successful writes.
2. Emit typed events for task create/update/reorder and context create/update.
3. Add a small client event dispatcher/store boundary for the kanban and context
   modules.
4. Keep the existing version-based live refresh as the fallback path.
5. Add timing marks and Playwright verification for an observer tab.

This gives NexusDash a state-of-the-art direction without requiring an external
provider on day one. Once the typed event contract exists, switching from
poll-backed SSE to managed realtime becomes an infrastructure decision rather
than a dashboard rewrite.
