# Architecture Decisions (Working Log)

Use this file for concise architecture-impacting decisions only.
Keep UI-only or task-only notes in `journal.md`.

## Entry Template

```md
## YYYY-MM-DD - <short decision title>
- Status: Accepted | Superseded | Deprecated | Proposed
- Context: <why this decision was needed>
- Decision: <what we chose>
- Consequences: <tradeoffs, constraints, follow-ups>
- Links: <ADR/tasks/PRs if relevant>
```

## Active Decisions

## 2026-09-01 - Replace database-polled SSE and keep Vercel Pro as a bounded safety net
- Status: Accepted; supersedes the transport portions of the 2026-06-03
  project-activity SSE decision and the 2026-06-04 notification SSE decision.
- Context: The Vercel Hobby team reached 4h 15m of Fluid Active CPU against a
  4h limit and 314.2 GB-hours of Fluid Provisioned Memory against a 360
  GB-hour limit. The latest seven days accounted for 2h 3m CPU and 153.6
  GB-hours, with Production and Preview both contributing materially. The
  notification and project-activity streams each live for 280 seconds,
  reconnect automatically, and wake every second to run authenticated Prisma
  and PostgreSQL RLS work even when no application change occurred. Hidden and
  duplicate tabs keep those streams active. The email scheduler, ordinary
  request volume, and builds were not material CPU drivers. The team upgraded
  to Vercel Pro to remove the immediate pause risk; at an assumed 20 monthly
  CPU hours and the observed seven-day memory run rate, expected metered
  infrastructure remains within Pro's monthly usage credit in the dominant
  `iad1` region.
- Decision: Keep Vercel Pro during remediation and treat it as an uptime and
  spend-management safety net, not as the architectural fix. Add a runtime
  transport kill switch, disable persistent DB-polled SSE in Preview by
  default, and replace the one-second server loops with bounded adaptive
  client polling that suspends in hidden tabs and coordinates duplicate tabs.
  Preserve the existing typed activity, notification snapshot, mutation
  acknowledgement, edit-lock, and missed-update reconciliation contracts.
  Instrument CPU, provisioned memory, invocations, transport mode, reconnects,
  fallback behavior, and database-query volume by environment. For true push,
  design and adopt private Supabase Realtime Broadcast channels secured by
  short-lived tokens derived from existing Nexus Dash sessions and
  project/user authorization; keep adaptive polling as the degraded-mode
  fallback. Do not migrate hosting or introduce AWS Lambda for this incident:
  both would move or mask the per-tab database workload without fixing it, and
  Lambda response streaming has an unfavorable full-duration billing model.
- Consequences: The immediate baseline temporarily accepts 10-30 second remote
  freshness in exchange for eliminating continuous idle database and function
  work. Preview behavior becomes intentionally cheaper than Production unless
  realtime is under explicit test. Supabase Realtime adds token issuance,
  private-channel RLS, provider quotas, and reconnect/reconciliation concerns,
  but it changes only the transport rather than replacing Prisma, PostgreSQL,
  application sessions, or service authorization. Vercel remains the hosting
  platform while a clean seven-day window is measured; the program targets
  less than 30 CPU minutes and 40 GB-hours of provisioned memory per
  representative seven days unless documented workload growth explains the
  difference. That review will decide whether to retain Pro, downgrade when
  Hobby policy and pause risk permit, or open a separately justified hosting
  migration.
- Links: Nexus Dash epic `Realtime Efficiency and Vercel Cost Control`;
  `ND-366` through `ND-375`;
  `app/api/account/notifications/stream/route.ts`;
  `app/api/projects/[projectId]/activity/stream/route.ts`;
  `components/notification-live-updates.tsx`;
  `components/project-live-refresh.tsx`

## 2026-08-27 - Keep shared Preview schema forward-only
- Status: Accepted
- Context: Deploying stacked TASK-327 renamed and removed columns from the
  Calendar credential table, which made the still-testable TASK-326 branch fail
  against shared staging. An emergency workflow reset made the database follow
  a branch rather than migration history.
- Decision: Shared Preview applies checked-in migrations forward only and never
  resets or rolls back to a branch. A pre-publication gate verifies that every
  Prisma model has a physical runtime table; incompatible branches fail with an
  expand/contract diagnostic before the stable alias moves.
- Consequences: Preview retains production-like migration semantics and ordinary
  deploys remain routine when migrations are backward-compatible. A single
  shared database still cannot support mutually incompatible destructive
  schemas; those changes must be phased or tested in an isolated database.
- Links: `docs/runbooks/vercel-env-contract-and-secrets.md`,
  `.github/workflows/deploy-vercel.yml`, PRs `#449` and `#450`

## 2026-08-06 - Model Calendar accounts, sources, and preferences separately
- Status: Accepted
- Context: A singular Google credential and free-form target ID cannot safely
  support multiple accounts, discovered calendars, read-only sources, or a
  stable write target.
- Decision: Use directly user-owned `CalendarConnection`, `CalendarSource`, and
  `CalendarPreference` records with composite ownership keys and forced RLS;
  place provider behavior behind an adapter and keep events live rather than
  storing copies.
- Consequences: Google is the sole live provider but the domain is provider-
  ready; partial reads are explicit, mutations are source-bound, and adding or
  removing one account never silently retargets another.
- Links: `adr/task-327-calendar-connections.md`,
  `tasks/task-327-additional-calendar-connections.md`

## 2026-08-06 - Make Google Calendar disconnect fail-closed and user-owned
- Status: Accepted
- Context: The existing Calendar credential is user-scoped, but its revocation
  marker was not enforced and the settings DELETE route only reset the target
  calendar instead of terminating access.
- Decision: Treat revoked credentials as unusable, require encrypted token
  storage whenever Calendar OAuth is configured outside tests, and disconnect
  by marking the signed-in user's row revoked before attempting Google token
  revocation and permanently deleting the local credential.
- Consequences: A failed provider call cannot reactivate local Calendar access;
  users receive a safe Google Account recovery path when upstream revocation is
  unconfirmed. PATCH remains the target-reset contract, while DELETE now means
  disconnect.
- Links: `tasks/task-326-google-calendar-connection-ownership.md`,
  `docs/audits/task-325-google-calendar-integration-audit.md`

## 2026-07-30 - Keep meeting todos within current-project navigation
- Status: Accepted; supersedes the cross-project portion of the 2026-07-27
  TASK-332 decision.
- Context: Product review confirmed that meeting follow-ups should remain
  bounded by the project the user intentionally opened. A workspace aggregate
  weakens that context, while mobile still needs a discoverable replacement
  for the obstructive floating panel and room for future project destinations.
- Decision: Route Todos at `/projects/[projectId]/todos`, enforce project
  access and isolation in the service, and remove Todos from workspace-level
  navigation. Desktop places Overview and Todos in the Current project sidebar
  group. Mobile uses one contained horizontal dock with separately labeled
  Workspace and Project groups; only that dock may scroll horizontally, with
  44 px targets, active states, keyboard access, and safe-area clearance.
- Consequences: Users never mix meeting todos from unrelated projects, project
  context is inherent in the URL and navigation hierarchy, and future
  project-specific destinations can extend the Project group without
  overloading workspace navigation.
- Links: `tasks/task-332-mobile-todo-navigation.md`,
  `app/projects/[projectId]/todos/`,
  `lib/services/project-meeting-todo-service.ts`,
  `components/authenticated-app-shell-client.tsx`

## 2026-07-27 - Promote meeting todos to an adaptive workspace destination
- Status: Superseded in part by the 2026-07-30 project-scoped decision.
- Context: The project-scoped floating todo panel covered meeting and project
  context on phone-sized screens, created a nested scroll region, and could not
  accommodate planned project and assignee filtering. A floating action button
  would conventionally suggest creation and add another safe-area collision.
- Decision: Make `/todos` a stable authenticated destination in both the
  desktop sidebar and mobile bottom navigation. Aggregate only projects
  available to the actor under RLS, preserve project and source-meeting
  context, store Open/Completed and project filters in the URL, hide the quick
  panel below the desktop breakpoint, and retain the existing authorized
  mutation endpoint.
- Consequences: Mobile users get an unobstructed, deep-linkable todo workflow
  that can grow with assignees and richer filters. The app shell performs one
  lightweight open-todo summary read for its badge, while desktop users retain
  the project-scoped quick panel.
- Links: `tasks/task-332-mobile-todo-navigation.md`, `app/todos/`,
  `lib/services/workspace-meeting-todo-service.ts`,
  `components/authenticated-app-shell-client.tsx`

## 2026-07-26 - Normalize meeting participants as optional user identities
- Status: Accepted
- Context: TASK-329 needs meeting participants to distinguish current
  NexusDash collaborators from external guests, reuse live user avatar/account
  identity, preserve prior guest names for future suggestions, and retain
  participant order and history if a linked user is later deleted.
- Decision: Replace the meeting note string array with ordered
  `ProjectMeetingNoteParticipant` child rows. Each row stores a display-name
  snapshot and may link to `User`; linked rows resolve current user presentation
  at read time, while null-linked rows remain project-scoped external guests.
  Enforce read/write isolation through parent-meeting RLS and validate linked
  user IDs against current project collaboration membership in the meeting
  note service.
- Consequences: Existing strings require a lossless backfill and API responses
  now carry participant identities instead of bare names. User deletion keeps
  the snapshot as an external identity, membership removal stops future
  suggestion/linking without rewriting historical notes, and future meeting
  ownership features can reference normalized identities.
- Links: `tasks/task-329-meeting-participant-identities.md`,
  `prisma/schema.prisma`,
  `lib/services/project-meeting-note-service.ts`,
  `components/meeting-participants/meeting-participant-picker.tsx`

## 2026-06-08 - Store meeting notes as first-class project records
- Status: Accepted
- Context: TASK-098 needs meeting preparation inputs, after-meeting outputs,
  participants, task-style labels, personal follow-up actions, simple lifecycle
  state, archived done-note browsing, and search. Reusing generic context cards
  would bury meeting-specific fields and make action tracking/search semantics
  ambiguous.
- Decision: Add `ProjectMeetingNote` and `ProjectMeetingNoteAction` as
  project-scoped RLS-protected records, expose session-user project APIs, and
  render a dedicated Meeting Notes dashboard panel. Store meeting labels in the
  same normalized JSON style as task labels, and store a small string state
  (`prepared`, `actions_in_progress`, `done`) where `done` drives the archived
  list. Owner/editor users can mutate notes and actions; viewers can read them
  through the existing project membership boundary. Agent v1 access is not
  expanded because meeting notes are outside the current agent scope contract.
- Consequences: Meeting notes become searchable and structured without
  overloading context cards. Future task linkage can attach to the dedicated
  meeting/action records instead of reverse-engineering note content.
- Links: `tasks/current.md`, `prisma/schema.prisma`,
  `lib/services/project-meeting-note-service.ts`,
  `components/project-meeting-notes-panel.tsx`

## 2026-06-04 - Use account-scoped SSE snapshots for in-app notification freshness
- Status: Accepted
- Context: TASK-263 needs invitation, assignment, mention, and future
  notification rows to appear in active sessions without navigation or manual
  refresh, while email notification delivery must remain grouped and debounced.
- Decision: Keep `Notification` as the source of truth and add an
  authenticated account-scoped realtime snapshot contract containing version,
  unread count, and latest unread title. A single client-side chrome component
  prefers an SSE stream and falls back to adaptive polling; account menu counts,
  account notification links, awareness banners, and the notification center
  subscribe to that browser state. The notification center refetches full rows
  through the existing account notifications API when the snapshot version
  changes.
- Consequences: The app gains live in-app notification freshness without adding
  a second realtime provider or changing email digest behavior. Persistent SSE
  connections mean E2E tests must wait for UI readiness rather than
  `networkidle`. The stream reconciles project invitations on the initial
  snapshot, then uses read-only snapshot polling for steady-state updates.
- Links: `tasks/current.md`, `lib/services/notification-service.ts`,
  `components/notification-live-updates.tsx`,
  `app/api/account/notifications/stream/route.ts`

## 2026-06-04 - Use typed project activity events for targeted dashboard reconciliation
- Status: Accepted
- Context: TASK-310 showed that local mutation APIs were fast while observers
  still waited about 4.5 seconds because the dashboard treated remote project
  activity as a coarse invalidation and reconciled through broad route refresh.
- Decision: Persist typed `ProjectActivityEvent` rows for supported project
  mutations and stream those events through the existing project activity SSE
  route. Dashboard clients first try targeted in-memory reconciliation for safe
  task, task-comment, and context-card events, then fall back to the coarse
  project version refresh path for unknown or unsafe changes.
- Consequences: Remote collaborators see common dashboard updates without
  waiting for a full RSC refresh, while older clients and unsupported events
  remain protected by the durable `Project.updatedAt` marker. The event
  contract is transport-independent so a managed realtime provider can replace
  the current DB-polled SSE source later.
- Links: `tasks/current.md`, `docs/reports/task-310-performance-investigation.md`,
  `prisma/schema.prisma`, `components/project-live-refresh.tsx`,
  `components/kanban-board.tsx`, `components/project-context-panel.tsx`

## 2026-06-03 - Prefer SSE as the first realtime transport for project activity
- Status: Accepted
- Context: TASK-308 made live collaboration safer but still relied on browser
  polling. NexusDash needs state-of-the-art collaboration freshness, but the
  current product requirement is server-to-client invalidation for project
  dashboards rather than bidirectional presence, cursors, or collaborative text
  editing.
- Decision: Add an authenticated server-sent events route for project activity
  updates and make dashboards prefer it when `EventSource` is available. Keep
  the existing activity endpoint and adaptive polling as the fallback for
  unsupported browsers, stream establishment failures, and project-scoped agent
  clients. Defer managed realtime providers until product requirements include
  larger fanout, presence, or stronger provider-backed delivery guarantees.
- Consequences: Open dashboards receive project activity versions through a
  standard HTTP streaming transport while mutation services continue to use the
  same durable `Project.updatedAt` version contract. The stream backend still
  reads from PostgreSQL, so a future Supabase Realtime, Ably, Pusher, or
  Liveblocks integration can replace the stream source without changing
  dashboard mutation acknowledgements.
- Links: `tasks/current.md`, `components/project-live-refresh.tsx`,
  `app/api/projects/[projectId]/activity/stream/route.ts`

## 2026-06-01 - Use client-side activity acknowledgements for live project refresh
- Status: Accepted
- Context: TASK-276 made dashboard mutations local-first, but the existing
  project activity poller still only knew that `Project.updatedAt` changed. That
  meant the active tab could show the bottom-right refresh prompt for a mutation
  it had just saved itself.
- Decision: Keep the lightweight `/api/projects/:projectId/activity` polling
  contract and add a client acknowledgement event backed by an app-owned
  `x-nexusdash-project-version` mutation response header. The live refresh
  controller advances its known version for local writes, auto-refreshes remote
  changes when no edit lock is active, checks visible project dashboards on a
  low-latency active cadence with immediate focus/visibility checks, backs off
  hidden tabs, and keeps the manual prompt only as an interruption-safety
  fallback while forms, dialogs, or contenteditable surfaces are active.
- Consequences: The current polling transport remains simple and compatible
  with agents while reducing routine remote-collaborator wait time. Active
  dashboards perform more lightweight reads than the original fixed poll, so
  future realtime transports can emit the same version snapshots and reuse the
  acknowledgement semantics without redesigning dashboard mutation flows.
- Links: `components/project-live-refresh.tsx`,
  `lib/project-activity-client.ts`, `lib/project-activity-version.ts`

## 2026-05-30 - Use project activity polling for near-term live collaboration refresh
- Status: Accepted
- Context: TASK-118 needs shared project dashboards to pick up task, context,
  epic, and roadmap changes made by another collaborator without manual page
  refresh. Prior TASK-105 architecture work kept PostgreSQL/Prisma as the
  system of record and deferred any platform migration. The current Vercel
  deployment shape does not provide a durable in-process WebSocket runtime, and
  the app does not currently expose a Supabase Realtime client contract.
- Decision: Use `Project.updatedAt` as the durable project activity version,
  touch it after successful project-scoped dashboard mutations through a
  narrow security-definer database function that validates owner/editor
  membership, and let
  authenticated project dashboards poll a membership-authorized activity
  endpoint. Clients call `router.refresh()` when the activity version advances
  and defer refresh behind an updates-available affordance while local edits,
  submissions, or drag interactions are active.
- Consequences: This delivers low-risk live freshness on the existing stack and
  gives TASK-263 a reusable transport pattern for notification freshness, while
  accepting short polling latency and extra lightweight reads instead of true
  push semantics. The security-definer touch function must keep a hardened
  search path and explicit membership checks because it deliberately bypasses
  the owner-only project-row update policy for editor content mutations. If
  NexusDash later needs presence, sub-second collaboration, or server-originated
  fan-out at larger scale, the activity endpoint can be swapped behind the
  client boundary for SSE, Supabase Realtime, or a managed realtime provider
  without rewriting dashboard mutation services.
- Links: `tasks/current.md`, `tasks/backlog.md`, `lib/services/project-service.ts`

## 2026-05-22 - Keep notification email dispatch app-owned while improving scheduler cadence cost-consciously
- Status: Accepted
- Context: TASK-268 intentionally used a no-new-cost GitHub Actions scheduler
  bridge every 3 hours after QStash setup created operational friction and
  Vercel Hobby could not provide the desired high-frequency cron behavior.
  Production smoke for TASK-226/TASK-265 showed the durable email pipeline can
  reconcile and send, but the coarse scheduler cadence makes notification
  emails arrive in predictable batches rather than near each group's intended
  `sendAfterAt`.
- Decision: Keep NexusDash's durable app-owned notification email queue,
  idempotency, protected dispatcher, and Resend delivery foundation. Reduce the
  GitHub Actions production bridge to a 30-minute cadence as the first
  no-new-cost improvement, and treat QStash, Vercel Pro Cron, or a cloud queue
  as future trigger options rather than replacements for the app-owned queue.
- Consequences: Near-term work can improve user-visible latency without
  prematurely buying a platform upgrade or weakening delivery semantics. The
  app now reports scheduler-lag metrics for claimed groups, but GitHub
  scheduled workflows remain best-effort rather than hard real-time. Future
  scheduler/provider changes should alter only when the dispatcher is invoked,
  while the application continues owning grouping, duplicate suppression,
  delivery records, and smoke validation.
- Links: `tasks/task-273-cost-aware-notification-email-scheduling.md`,
  `tasks/task-268-github-actions-notification-email-scheduler.md`,
  `lib/services/project-notification-email-service.ts`,
  `.github/workflows/notification-email-dispatch.yml`

## 2026-05-20 - Use app runtime role for Supabase transaction-pooled app traffic
- Status: Accepted
- Context: Production and preview validation showed that runtime database
  traffic must not use the admin `postgres` role, while Supabase direct
  database hosts may be IPv6-only and therefore unreachable from some GitHub,
  Vercel, or local execution environments.
- Decision: Configure `DATABASE_URL` with the least-privilege
  `app_runtime.<project-ref>` role through the Supabase transaction pooler on
  port `6543`. Keep `DIRECT_URL` and `MIGRATION_DATABASE_URL` admin-capable and
  separate from runtime traffic. Prefer Supabase's direct host for admin and
  migration connections when reachable; use the admin
  `postgres.<project-ref>` session-pooler URL on port `5432` as the operational
  fallback when direct IPv6 connectivity is unavailable.
- Consequences: Runtime traffic preserves forced-RLS defense in depth and avoids
  serverless session-pool exhaustion. Migration/admin flows remain possible in
  IPv4-only environments, but operators must treat admin session-pooler usage as
  a fallback for `DIRECT_URL` / `MIGRATION_DATABASE_URL`, never as a valid
  runtime `DATABASE_URL` shape.
- Links: `docs/runbooks/database-connection-hardening.md`,
  `docs/runbooks/vercel-env-contract-and-secrets.md`, `lib/env.server.ts`

## 2026-05-07 - Centralize outbound email delivery through durable provider records
- Status: Accepted
- Context: TASK-125 needed app-owned transactional email delivery for current
  auth emails and future project-invite/notification sends instead of adding
  provider calls piecemeal.
- Decision: Keep Resend as the outbound provider, resolve provider/sender/live
  delivery mode through `lib/env.server.ts`, route sends through
  `sendOutboundEmail`, and create an `OutboundEmailDelivery` record before
  each provider attempt with sent, skipped, and failed terminal states.
- Consequences: Verification and password-reset sends now share one observable
  foundation and future invite email delivery can attach a template key without
  redefining provider behavior. The task intentionally keeps retries, bounce
  webhooks, suppression lists, and notification preferences out of process
  until a background-job/policy task designs them.
- Links: `tasks/current.md`, `lib/services/outbound-email-service.ts`,
  `prisma/migrations/20260507153000_task125_outbound_email_foundation/migration.sql`

## 2026-04-29 - Centralize in-app activity through durable per-user notifications
- Status: Accepted
- Context: `TASK-123` needed project invitations to move out of invitation-specific popups/account cards while providing a reusable delivery target for future task-comment mentions and other product activity.
- Decision: Added a `Notification` persistence model addressed to one recipient user, with type/source identity, JSON metadata for producer-specific snapshots, unread/read state, resolved lifecycle, recipient-scoped RLS, and service APIs for listing, counting, read-state mutation, and idempotent invitation delivery/resolution.
- Consequences: Invitations now use the notification center as the durable in-app inbox while retaining collaboration-service ownership of invitation authorization and accept/decline semantics; future producers can add notification delivery without creating separate badge/banner systems, but realtime push, preferences, and history/archive filtering remain deferred.
- Links: `tasks/current.md`, `lib/services/notification-service.ts`, `prisma/migrations/20260429110000_task123_notification_center/migration.sql`

## 2026-04-15 - Keep PostgreSQL/Prisma baseline; do not pursue Convex migration now
- Status: Accepted
- Context: `TASK-105` re-evaluated Convex against the current NexusDash architecture after the repo had already adopted Prisma-owned PostgreSQL migrations, production RLS, DB-backed human sessions, project-scoped agent access, and a service-layer authorization model, while future backlog work made realtime collaboration worth reassessing explicitly.
- Decision: Keep `Prisma + PostgreSQL` as the system of record and do not migrate NexusDash to Convex at this stage; revisit only if the product becomes strongly realtime-first and the team is willing to replace Prisma migrations, PostgreSQL RLS, and the current auth/session architecture as part of a broader backend rewrite.
- Consequences: The repo preserves its existing relational and security guarantees while avoiding a broad platform rewrite whose main payoff would currently be limited mostly to future realtime collaboration work; near-term live-update needs should be explored on the current stack before reopening the migration question.
- Links: `adr/task-105-convex-migration-assessment.md`, `tasks/current.md`, `tasks/backlog.md`

## 2026-04-10 - Close TASK-050 security gaps with DB-backed abuse controls, hashed sessions, and request-time agent credential liveness
- Status: Accepted
- Context: `TASK-049` ranked perimeter abuse control, plaintext human sessions at rest, and agent bearer revocation lag as the top remaining security findings, and the repo already operates as a stateless Next.js/PostgreSQL system.
- Decision: Added PostgreSQL-backed auth abuse buckets for public auth/token-entry paths, moved human sessions to hashed token storage with explicit legacy-session invalidation during migration, and made agent bearer-token use contingent on current credential liveness during request usage logging.
- Consequences: Public auth/token exchange now has an authoritative cross-instance abuse-control baseline, legacy human sessions are signed out once during rollout, and credential rotate/revoke now takes effect immediately for already-issued bearer tokens.
- Links: `adr/task-050-security-remediation-adr.md`, `tasks/current.md`, `prisma/migrations/20260410110000_task050_security_remediation/migration.sql`

## 2026-03-31 - Ship agent access v1 as project-scoped API credentials exchanged into short-lived bearer tokens
- Status: Accepted
- Context: TASK-059 needs safe non-human access without reusing browser sessions, while preserving the current human session model, RLS visibility boundary, and project-scoped authorization guarantees.
- Decision: Store owner-managed API credentials per project with explicit scope grants, show the raw key only once, hash secrets at rest, exchange raw keys at a dedicated auth endpoint for short-lived signed bearer tokens, and enforce agent scope/project checks explicitly in project/roadmap/task/context services and routes while resolving DB visibility through the credential owner's RLS subject.
- Consequences: Agent automation now has a safe first-class path with rotation, revocation, and auditability, but v1 intentionally excludes calendar delegation and binary attachment parity until ownership semantics for those assets are designed explicitly.
- Links: `tasks/task-059-agent-access-implementation.md`, `lib/auth/api-guard.ts`, `lib/auth/agent-token-service.ts`, `lib/services/project-agent-access-service.ts`, `prisma/migrations/20260331153000_task059_agent_access_v1/migration.sql`

## 2026-03-24 - Bind collaboration invites to verified email identity and use copyable links as delivery only
- Status: Accepted
- Context: TASK-103 extends project sharing beyond existing verified users, but the v1 verified-account authorization model should remain intact and invite links must not become anonymous claim tokens.
- Decision: Store invitations against normalized recipient email, require acceptance by an authenticated verified account whose verified email matches that invited email, and treat invite links purely as a resumable delivery mechanism that routes the recipient through sign-in, sign-up, verification, or wrong-account correction before acceptance.
- Consequences: Owners can invite collaborators before an account exists and recipients can resume safely after account creation or verification, while invite acceptance stays identity-bound rather than link-bound; invitation RLS/listing must resolve by verified email and auth flows must preserve `returnTo` state.
- Links: `tasks/current.md`, `lib/services/project-collaboration-service.ts`, `lib/navigation/return-to.ts`, `app/invite/project/[invitationId]/page.tsx`, `prisma/migrations/20260324110000_task103_email_bound_project_invites/migration.sql`

## 2026-03-21 - Auto-verify email/password signups on preview deployments only
- Status: Accepted
- Context: TASK-058 collaboration testing on preview requires invite search to work for email/password accounts, but preview intentionally avoids a full email verification workflow to keep manual validation lightweight.
- Decision: Automatically mark email/password signups as verified when `VERCEL_ENV=preview`, while preserving normal verification requirements for production and other non-preview environments.
- Consequences: Preview collaboration testing is faster and less brittle, but preview account semantics differ intentionally from production; future testing/debugging should assume preview-created credential accounts are already verified.
- Links: `lib/env.server.ts`, `lib/services/credential-auth-service.ts`, `tests/lib/credential-auth-service.test.ts`

## 2026-03-20 - Ship project sharing v1 as verified existing-user invites with owner-managed collaboration controls
- Status: Accepted
- Context: TASK-058 needed a practical first release of collaboration that fits the current authenticated app and RLS architecture without overcommitting to email/link-based invitation complexity yet.
- Decision: Implement project sharing v1 around owner-managed invites for existing verified users only, with `editor`/`viewer` invite roles, single-owner projects, recipient-side invitation visibility in the authenticated app, and service-enforced invite acceptance/membership mutation flows.
- Consequences: Collaboration is now usable without introducing tokenized public invites; a later follow-up can add arbitrary email/link invitations and ownership transfer without redefining the core permission model.
- Links: `tasks/current.md`, `lib/services/project-collaboration-service.ts`, `prisma/migrations/20260320110000_task058_project_invitations/migration.sql`

## 2026-03-20 - Gate project calendar mutations by project role while keeping Google Calendar credentials user-scoped
- Status: Accepted
- Context: TASK-058 makes project roles user-visible across the workspace, but the existing Google Calendar integration remains tied to each individual user's credentials rather than a shared project calendar.
- Decision: Keep calendar ownership user-scoped for now, but require project membership and at least `editor` role for create/update/delete operations triggered from a project surface, with `viewer` limited to read-only access.
- Consequences: Project permissions stay coherent across the workspace while shared calendar ownership remains explicitly deferred; a future calendar-sharing task can evolve storage/credential semantics without reopening TASK-058 role expectations.
- Links: `tasks/current.md`, `lib/services/calendar-service.ts`, `app/api/calendar/events/route.ts`, `app/api/calendar/events/[eventId]/route.ts`

## 2026-03-05 - Propagate app principal via transaction-scoped Postgres settings for RLS
- Status: Accepted
- Context: TASK-085 requires DB-level isolation on project/user scoped tables while runtime uses pooled connections, which makes session-level `SET` unsafe.
- Decision: Added `withActorRlsContext()` service helper to run protected operations in a transaction, set `app.user_id` via `set_config(..., true)`, and evaluate RLS policies through `app.current_user_id()` in PostgreSQL.
- Consequences: RLS policy evaluation is actor-aware and pooler-safe; service paths touching protected tables must run through actor-context transactions.
- Links: `tasks/task-085-postgresql-rls-staged-rollout.md`, `prisma/migrations/20260305173000_task085_rls_phase1_enable_policies/migration.sql`, `lib/services/rls-context.ts`

## 2026-03-04 - Narrow username discriminator contract to 4-digit numeric format
- Status: Accepted
- Context: Username identity tags previously used 6-character base36 discriminators, but product direction now requires a shorter numeric-only suffix.
- Decision: Updated generation to `0000-9999`, added discriminator format validation in account identity/profile services, and applied schema/migration hardening (`VARCHAR(4)` + numeric regex check constraint).
- Consequences: New tags are more predictable and easier to communicate; legacy invalid discriminator values are sanitized and regenerated during username updates.
- Links: `tasks/current.md`, `prisma/migrations/20260304221000_task092_username_discriminator_numeric4/migration.sql`

## 2026-02-26 - Introduce username + discriminator identity contract for credentials signup
- Status: Accepted
- Context: Account onboarding needed a user-chosen identity without username-availability prechecks, while preserving `user.id` as the authorization key.
- Decision: Added `User.username` and `User.usernameDiscriminator` fields with composite uniqueness, validated username policy (`3-20`, lowercase alnum + `.` + `_`), enforced confirm-password matching, and generated collision-safe 6-char base36 discriminator suffixes during signup.
- Consequences: Signup identity is now deterministic and human-readable (`username#suffix`) for account-context surfaces; future account profile flows must preserve discriminator uniqueness semantics when introducing username edits.
- Links: `tasks/current.md`, `prisma/migrations/20260226113000_task081_username_identity/migration.sql`

## 2026-02-23 - Enforce principal-scoped boundaries for DB/storage/calendar
- Status: Accepted
- Context: Multi-user readiness required removing remaining singleton and ID-only access paths.
- Decision: Enforced actor-aware service contracts, ownership/membership checks, user-scoped Google credentials, and ownership-safe storage keys (`v1/{userId}/{projectId}/...`).
- Consequences: Cross-user leakage risks are significantly reduced; strict ownership assumptions are now part of all project-scoped service contracts.
- Links: `adr/task-076-supabase-r2-google-calendar-boundaries.md`

## 2026-02-20 - Define modern auth/authz contract before auth rollout
- Status: Accepted
- Context: Upcoming auth tasks needed a locked boundary model to prevent iterative rework.
- Decision: Adopted hybrid contract: DB-backed user sessions + scoped non-human token model, role-based project authorization, service-layer enforcement.
- Consequences: Auth implementation became phased and explicit, with clear sequencing constraints.
- Links: `adr/task-020-modern-auth-authorization-adr.md`

## 2026-02-20 - Execute dedicated boundary transition before route protection
- Status: Accepted
- Context: Schema bootstrap alone was insufficient to guarantee data isolation.
- Decision: Introduced TASK-076 as required implementation step before TASK-046 route/API protection.
- Consequences: Added short-term implementation scope, reduced long-term authorization drift risk.
- Links: `adr/task-020-modern-auth-authorization-adr.md`, `adr/task-076-supabase-r2-google-calendar-boundaries.md`

## 2026-02-18 - Keep hybrid auth/session direction
- Status: Accepted
- Context: Product needs durable user sessions plus future agent/API access.
- Decision: Keep DB-backed user sessions for interactive auth; reserve scoped JWT-style tokens for non-human actors.
- Consequences: Better revocation/control for user auth; agent access remains a separate implementation phase.
- Links: `adr/task-020-modern-auth-authorization-adr.md`

## 2026-02-17 - Use staged Vercel deploy workflow with manual promote/rollback
- Status: Accepted
- Context: Needed low-risk release control with quick rollback path.
- Decision: Added Vercel CLI workflow supporting staged production deploy, preview deploy, promote, and rollback.
- Consequences: Clear operational release path; requires disciplined secret/env management.
- Links: `.github/workflows/deploy-vercel.yml`

## 2026-02-17 - Enforce startup fail-fast runtime config validation
- Status: Accepted
- Context: Production misconfiguration risk was too high without strict env checks.
- Decision: Centralized runtime validation and enforced production `DIRECT_URL` + DB hardening invariants.
- Consequences: Misconfigured environments fail early; CI/deploy environments must provide minimum DB contract.
- Links: `lib/env.server.ts`, `docs/runbooks/database-connection-hardening.md`

## 2026-02-17 - Keep provider-based attachment storage (`local` + `r2`)
- Status: Accepted
- Context: Serverless deployments cannot rely on local filesystem durability.
- Decision: Added `StorageProvider` abstraction with local fallback and Cloudflare R2 implementation.
- Consequences: Flexible storage backend with minimal service churn; direct upload support depends on provider capability.
- Links: `lib/storage/`, `tasks/task-065-storage-provider-r2.md`

## 2026-02-16 - Enforce service-layer ownership for persistence access
- Status: Accepted
- Context: Direct DB access from transport/UI layers created auth and maintenance risk.
- Decision: Restricted Prisma usage to `lib/services/**` and enforced via lint restrictions.
- Consequences: Stronger layering and cleaner authz insertion points; new features must honor service boundaries.
- Links: `tasks/task-060-boundary-enforcement.md`

## 2026-02-16 - CI gates include deploy artifact verification
- Status: Accepted
- Context: Source-only checks were insufficient for deployment safety.
- Decision: Added container image build + metadata artifact gate after quality + E2E checks.
- Consequences: Better deploy confidence at the cost of longer CI runtime.
- Links: `.github/workflows/quality-gates.yml`, `tasks/task-041-ci-pipeline-build-image.md`

## 2026-02-16 - Centralize server env access contract
- Status: Accepted
- Context: Scattered `process.env` usage caused drift and inconsistent validation.
- Decision: Introduced `lib/env.server.ts` as the single env access/validation layer.
- Consequences: Easier testing and policy evolution; all server code should use this module.
- Links: `tasks/task-040-secrets-config-management.md`

## 2026-02-15 - Adopt PostgreSQL baseline, Supabase as default hosted target
- Status: Accepted
- Context: SQLite constraints blocked multi-user and production readiness.
- Decision: Switched canonical runtime to PostgreSQL; use Supabase-hosted Postgres by default, while keeping app/provider contracts Prisma-owned.
- Consequences: Production-ready data path with managed ops tradeoffs.
- Links: `adr/task-056-data-platform-adr.md`

## 2026-02-15 - Reset migrations for PostgreSQL baseline and archive SQLite history
- Status: Accepted
- Context: Existing migration chain was SQLite lineage and not deploy-safe for Postgres baseline.
- Decision: Started new Postgres migration history under `prisma/migrations`; moved old chain to `prisma/migrations-sqlite-legacy`.
- Consequences: Clean Postgres deploy path; old SQLite data migration is explicitly out-of-band.
- Links: `adr/task-057-supabase-environment-strategy.md`

## 2026-02-15 - Targeted medium refactor before full auth/security phases
- Status: Accepted
- Context: Architecture audit found boundary gaps and high change risk.
- Decision: Chose phased medium refactor (service extraction, schema/boundary hardening, UI decomposition) over big-bang rewrite.
- Consequences: Lower rework risk and better delivery continuity.
- Links: `tasks/task-035-architecture-audit.md`

## Historical (Still Useful Context)

## 2026-02-12 - Use `node:18-bullseye` Docker base for Prisma compatibility
- Status: Accepted
- Context: Alpine/Bookworm OpenSSL mismatches broke Prisma runtime/build.
- Decision: Standardized Docker base on Debian Bullseye image.
- Consequences: Stable Prisma behavior with larger image footprint.

## 2026-02-11 - Compose host port is configurable (`APP_PORT`)
- Status: Accepted
- Context: Local port conflicts blocked developer startup.
- Decision: Keep container port `3000`, map host port with `${APP_PORT:-3000}`.
- Consequences: Safer local onboarding in mixed environments.
