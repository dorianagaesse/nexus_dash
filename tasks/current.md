# Current Task: TASK-311 Product Latency Remediation

## Task ID
TASK-311

## Status
Implementation validated locally on `feature/task-311-product-latency-remediation`;
PR workflow in progress.

## Source
- Follow-up implementation task created from TASK-310 after PR #317 merged on
  2026-06-04.
- Report: `docs/reports/task-310-performance-investigation.md`.

## Objective
Make collaboration updates feel production-grade by replacing project-level
"something changed" refresh behavior with typed project events that can update
the relevant dashboard client state immediately, while preserving broad route
refresh as a safe fallback.

## Why This Matters
TASK-310 reproduced the core latency gap locally: a remote/API task create took
72 ms wall-clock and `task-create;dur=63.0`, but the already-open observer
dashboard took 4513 ms to show the new card. That isolates the most urgent
remaining issue to poll-backed activity propagation plus broad
`router.refresh()` reconciliation.

## Scope
- Introduce a typed project activity event contract for supported mutations.
- Emit typed events for:
  - task create
  - task update
  - task reorder/move
  - task comment create
  - context card create/update/delete
- Reconcile safe remote events directly in dashboard client state:
  - add/update/move task cards when no edit lock conflicts;
  - update comment counts and append detail-modal comments when possible;
  - add/update/remove context cards;
  - fall back to existing safe live refresh behavior for unknown or unsafe
    events.
- Add client timing marks for mutation completion, event receipt, local patch
  application, and fallback refresh.
- Add local production-mode measurement for observer-visible latency before and
  after the implementation.

## Out Of Scope
- Provisioning a managed realtime provider in this task.
- Replacing the app database as the source of truth.
- Notification-center live updates; TASK-263 remains the dedicated task.
- Presence, typing indicators, live cursors, or collaborative text editing.

## Architecture Direction
- Keep the existing project activity version as a coarse fallback.
- Add typed domain events as the primary reconciliation signal.
- Separate event creation, event publication/streaming, and client
  reconciliation so a future managed realtime provider can replace the current
  poll-backed SSE transport without rewriting dashboard state handling.
- Prefer canonical mutation payloads for safe local patching; use targeted
  background reads or full refresh only when the payload is incomplete or the
  local state is unsafe to patch.

## Acceptance Criteria
1. Mutations emit typed project activity events for task create/update/move,
   task comment create, and context card create/update/delete.
2. Remote task/context/comment events update an open dashboard without waiting
   for full `router.refresh()` when the user is not editing the affected
   entity.
3. Unknown, unsafe, or schema-incompatible events still fall back to the current
   safe refresh prompt/auto-refresh behavior.
4. Observer-visible task create/move/update latency is measured locally and
   reduced from the TASK-310 baseline of ~4.5 seconds to under 1.5 seconds,
   with a stretch target under 500 ms after mutation completion in local
   production mode.
5. Client timing marks record mutation completion, event receipt, patch
   application, and fallback refresh.
6. The implementation keeps a clear path to managed realtime by separating the
   event contract from the transport.

## Definition Of Done
- [x] Implementation is committed on `feature/task-311-product-latency-remediation`.
- [x] Focused tests cover event creation and client reconciliation.
- [x] Local production-mode browser/API probe records before/after observer
      latency.
- [x] `npm run lint`, `npm test`, `npm run test:coverage`, and `npm run build`
      pass.
- [ ] A branch preview is deployed and validates at least one actor-side flow
      and one observer-side flow.
- [x] `tasks/backlog.md`, `tasks/current.md`, `journal.md`, and ADR docs are
      updated.
- [ ] A ready PR is opened, checks pass, Copilot feedback is handled, and the
      PR is merged or ready for maintainer review depending on permissions.

## Local Validation Evidence
- `npm run lint` passed.
- Local PostgreSQL env `npm test` passed: 115 files passed, 2 skipped; 864
  tests passed, 2 skipped.
- Local PostgreSQL env `npm run test:coverage` passed with 91.37% statements,
  81.33% branches, 92.2% functions, and 91.88% lines.
- Local-safe production env `npm run build` passed after providing the
  required local `GOOGLE_TOKEN_ENCRYPTION_KEY` placeholder.
- Local-safe `npm run test:e2e` passed all 8 Playwright specs with
  `OUTBOUND_EMAIL_DELIVERY_MODE=disabled`; an earlier run with the placeholder
  Resend key in live mode failed only the password-reset email send path.
- Local production-mode two-user latency probe on `127.0.0.1:3150`: task
  create API 119 ms, observer card visible 825 ms after API completion and
  944 ms after mutation start. Observer marks showed
  `nexusdash.project-activity.received` followed by
  `nexusdash.project-activity.patched` 3 ms later, with no console errors.
- After hardening event writes through `app.record_project_activity_event(...)`,
  local production-mode probe on `127.0.0.1:3152` passed with task create API
  54 ms, observer card visible 849 ms after API completion and 904 ms after
  mutation start. The observer received a typed `task/created` remote event and
  marked `received` then `patched`.
