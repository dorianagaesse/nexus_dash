# Current Task: TASK-123 Notification Center

## Task ID
TASK-123

## Status
Done.

## Objective
Introduce a durable in-app notification center that gives each signed-in user a
single inbox for actionable product activity, starting with project
invitations and leaving a clean delivery path for future task-comment mentions
and additional activity categories.

This task should replace the current invitation-only alert/count behavior with a
general notification foundation: unread state, chronological triage, direct
navigation to the relevant product surface, and safe lifecycle handling when an
underlying invitation is accepted, declined, revoked, expired, or replaced.

## Why This Task Matters
- Project collaboration already creates user-visible activity, but invitation
  awareness is split across the account menu, a transient projects banner, and
  an account-page card.
- TASK-124 depends on a reusable delivery target for task-comment mentions; the
  notification center should be ready for mentions without implementing mention
  parsing in this task.
- A durable inbox gives NexusDash a product-level pattern for future activity
  such as assignments, deadline reminders, reactions, roadmap updates, and
  system notices without adding one-off badges and banners per feature.

## Current Baseline Confirmed In Repo
- `ProjectInvitation` stores email-bound project invites with accepted,
  revoked, replaced, and expiry lifecycle columns.
- Invitation access is identity-bound to the recipient's verified email through
  `lib/services/project-collaboration-service.ts` and supporting PostgreSQL RLS
  helper functions.
- Before TASK-123, pending invitations surfaced in three places:
  - `components/pending-project-invitations-banner.tsx`
  - `components/account-menu.tsx`
  - the `Invitations` card in `app/account/page.tsx`
- Human auth uses DB-backed sessions, and protected app routes resolve the
  actor through `lib/auth/server-guard.ts` / `lib/auth/session-user.ts`.
- Persistence access must stay in `lib/services/**`, and project-scoped
  authorization must stay service-enforced.
- Protected persistence paths run through `withActorRlsContext(...)`; new
  notification persistence needs matching RLS coverage.
- Task comments are already project-scoped and append-only in
  `lib/services/project-task-comment-service.ts`, but no mention parsing or
  notification delivery exists yet.

## Product Direction
- The notification center is an in-app inbox, not an outbound email system.
- The first notification category is project invitations.
- Invitations should remain actionable through the existing collaboration
  acceptance/decline service paths; notification rows should point to or wrap
  that existing domain object rather than redefine invitation semantics.
- The account menu should evolve from an invitation-specific indicator into a
  notification indicator with unread count.
- The account menu should replace the current `Invitations` entry with a
  `Notifications` entry that links to `/account/notifications`.
- The account notification page should replace the current invitation-specific
  card as the primary place to review, triage, accept, decline, and later handle
  other notification categories.
- Lightweight popup/dropdown behavior can remain useful for quick awareness, but
  the durable account notification page is the source-of-truth UI for full
  notification review.
- Notification copy should be concise and product-specific:
  project name, actor/inviter identity, activity type, timestamp, and clear
  action affordances where the notification is actionable.
- Future categories should be possible without schema churn for every new
  activity type, but this task should not overbuild a full event bus.

## Working Assumptions For This Task
- Notifications are user-owned records addressed to one recipient user.
- Unread state is per recipient and independent from the underlying domain
  object's lifecycle.
- Invitation notifications should be derived from active email-bound
  invitations for the verified account and should be idempotent if invite
  creation, replacement, page render, or a future repair job sees the same
  invitation more than once.
- Accepting or declining an invitation should resolve the notification from the
  actionable queue, either by marking it read/resolved or by excluding terminal
  invitation notifications from the active inbox view.
- Expired, revoked, replaced, and already accepted invitations must not remain
  as misleading actionable notifications.
- Mentions are a future producer. TASK-123 should define a notification type
  and/or creation API that TASK-124 can reuse, but should not implement
  `@mention` parsing, autocomplete, or highlighted rendering.
- Realtime push, background jobs, and email delivery are intentionally out of
  scope unless a minimal synchronous repair path is necessary to keep invitation
  notification state correct.

## Scope
- Add notification persistence to Prisma/PostgreSQL for durable per-user inbox
  entries, including recipient, type/category, title/body or summary fields,
  target URL, timestamps, read/resolved state, source object identity, and
  structured metadata that can support future producers without adding
  invitation-specific columns to every notification.
- Add a migration with indexes and RLS policies that restrict notification rows
  to the recipient user and any explicitly service-owned write paths needed for
  domain producers.
- Add a notification service under `lib/services/**` for:
  - listing the current user's notifications in reverse chronological order
  - counting unread notifications
  - marking one notification read/unread
  - marking all current-user notifications read
  - creating or upserting invitation notifications idempotently
  - resolving or suppressing stale invitation notifications when invitation
    lifecycle changes
- Integrate project invitation creation/replacement/accept/decline/revoke paths
  with notification creation and resolution while preserving the collaboration
  service as the source of truth for invitation authorization and mutation.
- Add a signed-in notification center UI reachable from the top-right
  controls/account menu area, with a full `/account/notifications` page that
  supports:
  - unread count visibility
  - empty state
  - chronological notification list
  - read/unread visual distinction
  - direct navigation to invitation/project/account target surfaces
  - invitation accept/decline actions for active invitation notifications
- Improve the existing quick-awareness popup/banner behavior so it points users
  into the notification center instead of acting as a separate invitation-only
  workflow.
- Replace the invitation-specific account-menu item and account-page invitation
  card with notification-centered navigation and content.
- Keep existing invitation deep-link behavior at
  `/invite/project/[invitationId]` working.
- Add targeted automated coverage for service behavior, API/server-action
  adapters, migration-relevant lifecycle expectations, and core UI rendering.
- Update tracking and architecture docs after implementation lands.

## Out Of Scope
- Task-comment mention parsing, autocomplete, and highlighted mention rendering
  from TASK-124.
- Email, SMS, web push, desktop push, or digest delivery.
- Realtime subscriptions/live notification delivery.
- Background worker infrastructure or scheduled notification jobs beyond a
  minimal synchronous cleanup/upsert path if needed.
- Notification preferences, muting, per-project settings, or digest frequency.
- Cross-project activity feeds or admin/audit-reporting dashboards.
- Agent/OpenAPI notification management unless it falls out naturally from
  existing authenticated app routes.
- Calendar reminders or deadline reminder scheduling.

## Acceptance Criteria
- A signed-in user has a notification center reachable from the persistent app
  chrome/top-right account controls.
- The account menu exposes `Notifications` instead of the current
  invitation-specific entry.
- `/account/notifications` exists as the durable place to review all
  notification categories.
- The notification control shows an unread count for the current user.
- Project invitations addressed to the user's verified email appear as durable
  notification-center items.
- Invitation notification creation is idempotent and does not create duplicate
  active rows for the same source invitation.
- Active invitation notifications allow the recipient to accept or decline the
  invitation through the existing invitation response service.
- Accepted, declined, revoked, replaced, and expired invitations no longer show
  as misleading actionable notification items.
- Users can mark individual notifications read/unread.
- Users can mark all visible notifications read.
- Notification reads and counts are scoped to the authenticated recipient user;
  one user cannot read or mutate another user's notifications.
- The account menu/invitation indicator and existing invitation popup/banner are
  updated to use the notification unread-count model rather than
  invitation-specific counting.
- The existing invitation link flow still works for signed-out, wrong-account,
  unverified, and verified-recipient states.
- The implementation preserves architecture boundaries:
  - Prisma access stays under `lib/services/**`
  - API routes/server actions remain thin adapters
  - project/invitation authorization remains service-enforced
  - protected DB paths run with the actor RLS context
- Relevant automated tests cover service lifecycle, route/action behavior, and
  notification UI rendering.
- Tracking docs are updated consistently in the same PR.

## Definition Of Done
1. `TASK-123` is the active brief in `tasks/current.md`.
2. Notification persistence, migration, RLS policies, service API, route/action
   adapters, and UI are implemented around a durable per-user inbox.
3. Project invitation notifications are delivered, counted, displayed, and
   resolved without weakening existing email-bound invitation semantics.
4. The notification model leaves a clear implementation seam for TASK-124
   comment-mention delivery without shipping mention UX in this task.
5. Existing collaboration invitation flows and account/project navigation keep
   working.
6. Relevant validation is green:
   - `npm run lint`
   - targeted notification/collaboration service tests
   - targeted notification/account-menu UI tests
   - `npm test`
   - `npm run test:coverage`
   - `npm run build`
   - `npm run test:e2e` or a focused Playwright smoke if invitation UX changes
     materially and a local/preview E2E environment is available
7. Tracking docs are updated consistently:
   - `tasks/current.md`
   - `tasks/backlog.md`
   - `journal.md`
   - `project.md`
   - `README.md` only if runtime/test/workflow guidance changes
   - `adr/decisions.md` only if a new architecture-level decision appears
8. The task ships through its own dedicated branch and PR with automated review
   feedback triaged before handoff.

## Review Follow-up Evidence
- PR #210 Copilot review generated six inline comments and all were treated as
  actionable before handoff.
- Backend follow-up tightened `notification-service` write error handling so
  read/unread and mark-all-read operations preserve the `ServiceResult`
  contract on unexpected DB/RLS failures.
- Invitation notification sync now batches read-path repair work: stale rows
  are resolved in one update, existing active notification sources are fetched
  once, and only missing rows are bulk-created during list/count sync.
- Explicit invitation lifecycle delivery still refreshes existing notification
  content, but skips no-op updates when the existing row already matches the
  current invitation payload.
- Notification timestamps render with an explicit `Intl.DateTimeFormat`
  locale/timezone contract.
- The notification RLS update policy now mirrors the insert policy recipient
  email binding for invitation-producer updates.
- Local follow-up validation passed: focused notification tests, `npm run
  lint`, full `npm test`, full `npm run test:coverage`, and `npm run build`
  with valid local test env values.

## Dependencies
- `TASK-058`
- `TASK-103`
- Enables `TASK-124`

## Evidence Plan
- Repo source of truth:
  - `agent.md`
  - `project.md`
  - `README.md`
  - `tasks/backlog.md`
  - `adr/decisions.md`
  - `prisma/schema.prisma`
- Notification and invitation surfaces:
  - `components/notification-awareness-banner.tsx`
  - `components/account/notification-center-list.tsx`
  - `components/account-menu.tsx`
  - `components/top-right-controls.tsx`
  - `app/account/notifications/page.tsx`
  - `app/account/notifications/actions.ts`
  - `app/account/page.tsx`
  - `app/account/actions.ts`
  - `app/invite/project/[invitationId]/page.tsx`
  - `app/invite/project/[invitationId]/actions.ts`
- Current invitation/domain service:
  - `lib/services/project-collaboration-service.ts`
  - `tests/lib/project-collaboration-service.test.ts`
  - `tests/app/account-actions.test.ts`
  - `tests/app/invite-project-actions.test.ts`
- Future producer context:
  - `lib/services/project-task-comment-service.ts`
  - `components/kanban/task-detail-modal.tsx`
  - `components/kanban-board.tsx`

## Initial Implementation Plan
1. Design the `Notification` Prisma model and migration, including source
   identity uniqueness for invitation notifications and recipient-scoped RLS.
2. Build `lib/services/notification-service.ts` with list/count/mark APIs and
   idempotent invitation notification helpers.
3. Wire project invitation create/replace/respond/revoke lifecycle paths into
   the notification service without moving invitation authorization out of the
   collaboration service.
4. Add thin app/API adapters or server actions for notification reads and
   mark-read operations.
5. Replace the account-menu invitation entry/count with notification navigation
   and unread count.
6. Add the `/account/notifications` page with list, read-state, and
   invitation-action handling.
7. Update the existing popup/banner behavior so it routes through the
   notification center instead of duplicating invitation-specific UX.
8. Add targeted unit/API/component/E2E coverage, then run the repository
   validation baseline.

## Locked Direction
- Build the backend notification system as the durable product foundation first,
  not as invitation UI polish only.
- Replace the account-menu `Invitations` entry with `Notifications`.
- Add `/account/notifications` as the primary full-review surface.
- Keep quick popup/banner awareness secondary and route it into the notification
  center.
- Start with active/unresolved notification review and read/unread state; defer
  richer archive/filter/preferences behavior until additional producers exist.

## Implementation Summary
- Added `Notification` persistence with recipient, type/source identity,
  metadata, target path, unread/read state, and resolved lifecycle.
- Added PostgreSQL migration coverage for indexes, foreign key, and
  recipient-scoped RLS policies with invitation-producer write support.
- Added `lib/services/notification-service.ts` for listing, unread counting,
  read-state mutation, mark-all-read, idempotent invitation notification
  creation, stale invitation resolution, and pending-invitation sync for
  existing/new verified users.
- Wired project invitation create, replacement, revoke, accept, and decline
  paths into notification delivery/resolution while preserving the existing
  collaboration service as the invitation authority.
- Replaced the account-menu `Invitations` entry/count with notification
  navigation and unread count.
- Added `/account/notifications` as the durable notification review surface with
  project invitation accept/decline and read/unread controls.
- Replaced the invitation-only account card with a notification-center entry
  point and replaced the projects/account invitation banner with a
  notification-awareness banner.

## Validation Evidence
- `npm run lint`
- `npm test` failed without `DATABASE_URL`; reran with placeholder
  `DATABASE_URL`/`DIRECT_URL` and passed: 88 files passed, 1 skipped; 626 tests
  passed, 1 skipped.
- `npm run test:coverage` with placeholder `DATABASE_URL`/`DIRECT_URL`: passed
  coverage thresholds.
- `npm run build` with placeholder DB/env secrets: passed and confirmed
  `/account/notifications` route generation.
- Focused notification suite passed:
  `tests/lib/notification-service.test.ts`,
  `tests/components/notification-center-list.test.ts`,
  `tests/components/account-menu.test.ts`,
  `tests/app/account-notifications-actions.test.ts`, and
  `tests/lib/project-collaboration-service.test.ts`.
- Focused `npm run test:e2e -- --grep "task lifecycle and attachment
  interaction flow"` built successfully, initially failed because Playwright
  Chromium was not installed, then after `npx playwright install chromium`
  failed during seeded-user creation via Prisma in
  `tests/e2e/helpers/auth-helpers.ts` before reaching the browser flow. This is
  consistent with the local E2E database fixture fragility tracked by
  `TASK-131`; deployed preview validation remains the expected browser-level
  follow-up before merge.

---

Last Updated: 2026-04-29
Assigned To: Codex
