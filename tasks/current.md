# Current Task: TASK-309 Realtime Event-Stream Foundation

## Task ID
TASK-309

## Status
In progress on `feature/task-309-realtime-event-stream`.

## Source
- User request on 2026-06-03 after TASK-308 / PR #315:
  decide whether polling is the right long-term solution, merge the current PR,
  create the durable realtime task, choose the best solution for NexusDash, and
  implement it in a new PR.
- Backlog entry: `tasks/backlog.md` / TASK-309.

## Objective
Move project collaboration freshness toward a state-of-the-art realtime
architecture by adding an authenticated server-sent events transport for project
activity updates while preserving the TASK-308 activity-version contract and
adaptive polling fallback.

## Architecture Decision
Use SSE as the first durable realtime transport for NexusDash project activity.

Rationale:
- Current collaboration freshness is server-to-client invalidation: the app
  needs to tell open dashboards that project state changed.
- WebSockets are more operationally complex and are better justified by
  bidirectional features such as presence, live cursors, or collaborative text
  editing.
- Managed realtime providers such as Supabase Realtime, Ably, Pusher, or
  Liveblocks remain the likely next step when fanout, presence, or vendor-backed
  delivery guarantees become product requirements.
- SSE fits the existing Next.js/Vercel route-handler model, preserves cookie
  authentication, works with the current PostgreSQL source of truth, and can
  reuse the same project activity version snapshots already emitted by
  mutation acknowledgements.

## Scope
- Add a project activity SSE route under the existing project activity API
  surface.
- Stream structured `project-activity` events that contain the same
  `{ projectId, version, serverTime }` shape as the polling endpoint.
- Keep the current polling endpoint and adaptive client polling as a fallback
  for unsupported browsers, stream failures, and agent/API clients.
- Update `ProjectLiveRefresh` to prefer SSE when available, fall back to
  polling when the stream cannot be established, and preserve the existing
  local acknowledgement/edit-lock safety semantics.
- Document the SSE-vs-managed-realtime decision and future provider swap path.
- Add focused route and component tests for stream event formatting, fallback,
  and refresh behavior.

## Out Of Scope
- Presence, typing indicators, cursors, or collaborative document editing.
- External realtime vendor provisioning.
- Notification-center realtime implementation. TASK-263 remains the dedicated
  task for live notification rows/counts/banner behavior; this task should leave
  a compatible transport pattern for it.

## Acceptance Criteria
1. Project dashboards prefer an authenticated SSE activity stream when
   `EventSource` is available.
2. SSE emits project activity versions in the same logical contract as
   `/api/projects/:projectId/activity`.
3. Remote stream events trigger the same safe auto-refresh behavior as polling:
   idle dashboards refresh automatically, while edit/modal/contenteditable locks
   defer with the manual affordance.
4. Local mutation acknowledgements still suppress self-refresh prompts.
5. If SSE is unavailable or fails before opening, the dashboard falls back to
   adaptive polling.
6. Agent/API consumers can continue using the polling activity endpoint without
   behavioral change.
7. Tests cover the SSE route and client stream/fallback behavior.

## Definition Of Done
- [x] Implementation is committed on the dedicated feature branch.
- [x] Focused tests cover the realtime stream route and client stream/fallback
      behavior.
- [x] `npm run lint`, `npm test`, `npm run test:coverage`, and `npm run build`
      pass.
- [x] UI-impacting behavior is smoke-tested locally or against a branch preview.
- [x] `tasks/backlog.md`, `tasks/current.md`, `journal.md`, and
      `adr/decisions.md` are updated.
- [ ] A ready-for-review PR is opened, automated checks pass, Copilot review
      feedback is handled, and preview evidence is recorded if deployed.

## Notes
- PR #315 merged TASK-308 as `7ac91ad` before this branch started.
- SSE is intentionally a transport upgrade, not a full collaboration-provider
  migration. The client boundary should make a later managed provider swap
  possible without rewriting mutation services.
