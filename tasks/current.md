# Current Task: TASK-263 Real-Time Notification Updates

## Task ID
TASK-263

## Status
Implemented and locally validated on `feature/task-263-live-notification-updates`.
Ready PR #320 is open, checks are green, and the PR is intentionally left
unmerged for maintainer review.

## Source
- Execution queue task promoted on 2026-05-31.
- User feedback after multi-account testing: invitation recipients still needed
  a page reload to see new invitations/notifications.
- Existing realtime foundation: TASK-309 project activity SSE transport and
  TASK-311 typed project event reconciliation.

## Objective
Make in-app notifications feel live across authenticated sessions. Newly
created or updated `Notification` rows should update the account menu unread
indicator, notification awareness banner, and notification center list without
requiring navigation or manual refresh.

## Why This Matters
Invitations, assignments, mentions, and future notification producers are
collaboration signals. If recipients must reload to discover them, the product
does not meet the standard set by modern collaborative tools.

## Current Behavior
- `TopRightControls` server-renders the unread count once by calling
  `countUnreadNotificationsForUser`.
- `NotificationAwarenessBanner` server-renders the latest unread title once.
- `/account/notifications` server-renders the inbox by calling
  `listNotificationsForUser`.
- Notification read actions refresh through server actions or API writes, but
  other open tabs/sessions do not update until navigation or reload.
- Project invitation notification rows are reconciled lazily during notification
  service reads, so live checks must keep that reconciliation path.

## Architecture Direction
- Reuse the existing SSE-first realtime pattern from project activity rather
  than introducing WebSockets or a second realtime provider.
- Scope the stream to the authenticated account, not to a project.
- Keep `Notification` as the source of truth. The realtime stream publishes a
  compact recipient snapshot: version, unread count, and latest unread title.
- Mount a single authenticated client stream in the app chrome, then let account
  menu, awareness banner, and notification-center clients subscribe to that
  browser event/state.
- Let the notification center refetch its full list via
  `/api/account/notifications` when the snapshot version changes.
- Preserve email digest batching exactly as-is; realtime only changes in-app
  freshness.

## Scope
- Add notification snapshot service support with durable version semantics.
- Add authenticated account notification snapshot and SSE stream API routes.
- Add a client live-notification source that prefers `EventSource` and falls
  back to adaptive polling.
- Update the account menu unread indicator from live snapshots.
- Replace the server-only awareness banner with a live client banner that can
  appear/disappear as unread state changes.
- Update the notification center list so it can refresh rows in place when the
  live snapshot changes.
- Cover service, route, and component behavior with tests.

## Out Of Scope
- Managed realtime provider provisioning.
- Email digest timing/grouping changes.
- Push/browser notifications, presence, or mobile OS notification delivery.
- Changing notification producers beyond preserving their current row writes.

## Acceptance Criteria
1. A user with an open authenticated app session sees unread notification count
   changes without navigation when a notification row is created, read, unread,
   or resolved.
2. The in-app awareness banner appears for the latest unread notification and
   disappears when no unread unresolved notification remains.
3. `/account/notifications` updates its list in place when notification state
   changes in another tab/session.
4. Project invitation recipients can see newly received invitations through the
   live notification path without reloading.
5. The implementation reuses the app's SSE-first realtime pattern and keeps a
   polling fallback.
6. Email notification digest batching remains separate and unchanged.

## Definition Of Done
- [x] Notification snapshot service, API route, and SSE stream are implemented.
- [x] Account menu, awareness banner, and notification center consume live
      notification snapshots.
- [x] Tests cover service snapshots, stream formatting/auth failure, polling
      fallback, count/banner/list updates, and notification-center refetch.
- [x] `npm run lint`, `npm test`, `npm run test:coverage`, `npm run build`, and
      `npm run test:e2e` pass.
- [x] `tasks/backlog.md`, `tasks/current.md`, `journal.md`, `project.md`, and
      ADR docs are updated.
- [x] A ready PR is opened and Copilot feedback is handled.
- [x] The PR is left unmerged for maintainer review.

## Validation Evidence
- Focused `npm test -- --run tests/lib/notification-service.test.ts
  tests/api/account-notifications.route.test.ts
  tests/components/notification-live-updates.test.tsx
  tests/components/notification-center-list.test.ts
  tests/components/notification-awareness-banner.test.tsx
  tests/components/account-menu.test.ts
  tests/components/account-notifications-link.test.tsx` passed 7 files / 42
  tests.
- `npm run lint` passed.
- Local PostgreSQL env `npm test` passed: 118 files passed, 2 skipped; 880
  tests passed, 2 skipped.
- Local PostgreSQL env `npm run test:coverage` passed with 91.37% statements,
  81.33% branches, 92.2% functions, and 91.88% lines.
- Local-safe production env `npm run build` passed.
- Local-safe production env `npm run test:e2e` passed 8/8 Playwright specs
  after replacing the projects helper `networkidle` wait with UI-ready
  assertions because account-level SSE keeps a persistent connection open.
- PR #320 checks passed: `check-name`, `Quality Core (lint, test, coverage,
  build)`, `E2E Smoke (Playwright)`, and `Container Image (build + metadata
  artifact)`.
- Copilot review comments were addressed by adding no-store error headers to
  the summary route, request-scoped cached server snapshot reads, and `Link`
  navigation in the awareness banner.
