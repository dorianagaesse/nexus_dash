# ND-372 Private Supabase Realtime Authorization and Channel Contracts

Date: 2026-10-03
Status: Accepted

## 1) Decision Summary

Replace the database-polled SSE transport as the primary realtime path with
Supabase Realtime **Broadcast** over two families of private channels:
`project:<projectId>:activity` and `user:<userId>:notifications`.

- All messages are published **from durable database triggers** using
  `realtime.send()`. Clients have **no publish permissions at all**: the
  design deliberately ships zero INSERT policies on `realtime.messages`, so a
  compromised or malicious client cannot forge activity or notification
  messages.
- Subscribe authorization reuses the existing membership model through
  SELECT-only RLS policies on `realtime.messages`, backed by `app` schema
  helpers that mirror today's `ownerId OR ProjectMembership` predicate.
  `app.current_user_id()` gains a JWT-claims fallback so the same predicate
  works in both the app-runtime GUC context and the Realtime policy
  evaluation context.
- Browsers authenticate with **short-lived (≤10 minute) HS256 Supabase JWTs**
  minted only from authenticated human sessions at `POST /api/realtime/token`.
  The token carries `sub` (NexusDash user id), `role: authenticated`, `iat`,
  and `exp` only — no PII claims. The TTL is the access-revocation SLA.
- Payload contracts remain **schema- and value-compatible with the current
  SSE payloads** (`ProjectActivityEventPayload`,
  `NotificationRealtimeSnapshot`): the parsed JSON is deeply equal, while
  `jsonb` serialization may reorder object keys, so compatibility is defined
  on parsed values rather than on bytes. The existing client handlers and
  version-guard/reconciliation logic are reused unchanged.
- Adaptive client polling remains the degraded-mode fallback, and the
  existing `REALTIME_TRANSPORT` kill switch extends to the new transport.

This ADR is the authorization and channel contract for ND-373 (implementation);
ND-374 retires the SSE routes, ND-375 measures cost.

## 2) Context

### 2.1 Why this decision is needed now

The realtime efficiency program (epic "Realtime Efficiency and Vercel Cost
Control") identified the SSE transport as the dominant Vercel Fluid compute
cost driver: each open tab holds a server function that polls PostgreSQL
every second. ND-369/ND-370 already bounded client polling cadence, and
ND-371 instrumented the current transport, but the primary path is still
"server loops over the database". The epic's recommended order puts this
design (ND-372) in front of ND-373 (implement Broadcast), ND-374 (retire SSE,
load test), and ND-375 (seven-day cost review).

### 2.2 Existing transport and contracts to preserve

- `app/api/projects/[projectId]/activity/stream/route.ts`: SSE, polls every
  `1_000 ms`, heartbeat every `15_000 ms`, connection lifetime capped at
  `280_000 ms`; emits event `project-activity` with
  `ProjectActivityEventPayload`, either a typed event payload
  (`createActivityEventPayload`) or a bare version signal
  (`createActivityPayload`, all event fields `null`) when only
  `Project.updatedAt` moved.
- `app/api/account/notifications/stream/route.ts`: SSE, event
  `notification-snapshot` with `NotificationRealtimeSnapshot`:
  `{ version, unreadCount, latestUnreadNotification, serverTime }`.
- Client components `components/project-live-refresh.tsx` and
  `components/notification-live-updates.tsx` already treat the transport as
  pluggable: both SSE and the polling fallback funnel into one
  transport-agnostic handler (`handleActivitySnapshot`, `handleSnapshot`)
  with version guards, tab-leader coordination, local-mutation deferral, and
  refresh locks. The Broadcast transport must feed these same handlers.
- Polling endpoints remain the authoritative fallback and reconciliation
  source: `/api/projects/[projectId]/activity` and
  `/api/account/notifications/summary`.
- `ProjectActivityEvent` rows are appended transactionally by
  `recordProjectActivityEvent` (`lib/services/project-activity-service.ts`),
  which first calls `touchProjectActivity` (bumps `Project.updatedAt`). The
  touch-only path `touchProjectMembershipActivity` (membership invitation
  flows, `lib/services/project-collaboration-service.ts`) bumps
  `Project.updatedAt` without inserting an event row — the SSE route's bare
  snapshot branch exists exactly for these flows, and Broadcast must cover
  both.

### 2.3 Authorization architecture this design must not weaken

- Persistence lives behind `lib/services/**`; every request runs through
  `withActorRlsContext()` which sets the transaction-local GUC `app.user_id`;
  `app.current_user_id()` reads it. 30 tables run ENABLE + FORCE RLS with the
  canonical read predicate `ownerId = current user OR membership exists`,
  write predicates add `role IN ('owner','editor')`.
- `app.is_project_owner(TEXT)` is the documented recursion breaker between
  `Project` and `ProjectMembership` policies; `app` schema helpers are
  SECURITY DEFINER, owned by the migration role (which bypasses RLS).
- Runtime connects as a least-privilege role (`app_runtime` via the Supabase
  pooler); **no service-role key exists anywhere in the repository or Vercel
  environments**, and this design adds none.
- Sessions are custom (cookie `nexusdash.session-token`, 30-day, hashed
  tokens in `Session`); mints for Realtime are issued only to authenticated
  human sessions. Agents use separate HS256 bearer tokens and are out of
  scope (no browser connection to authorize).
- Preview and Production use separate Supabase projects, and
  `EXPECTED_SUPABASE_PROJECT_REF` pins the runtime URL per environment, so a
  token minted in one environment is cryptographically useless in the other.

### 2.4 Supabase Realtime platform constraints (verified 2026-10-03)

- Private channels are authorized by RLS on `realtime.messages`: SELECT
  policies authorize receiving/joining, INSERT policies authorize sending.
  Joining requires at least one read or write permission on the topic.
  `realtime.topic()` returns the topic being joined; policies can inspect
  `realtime.messages.extension` (`'broadcast'` / `'presence'`).
- Client access policies are **cached for the duration of a connection** and
  re-evaluated on connect/subscribe and whenever a new JWT arrives via the
  `access_token` message. A revoked user keeps receiving until the JWT
  expires unless a new token is pushed — so token TTL is the revocation SLA.
  If no refreshed JWT arrives, the client is disconnected at expiry.
- "Allow public access" must be turned off in the project's Realtime settings
  or private-channel enforcement does not apply.
- Database broadcasts: `realtime.send(jsonb_payload, event_name, topic,
  is_private)` is the documented helper for trigger-based publishing; all
  database broadcasts default to private. Ordering caveat: daily partitions
  of `realtime.messages` are created by WebSocket clients, so a database
  broadcast attempted before any client connects can fail to insert (logs
  `WarnSendingBroadcastMessage`).
- The `realtime` schema is locked down: do not `ALTER TABLE ... ENABLE ROW
  LEVEL SECURITY` on `realtime.messages` (RLS is already on; the ALTER errors
  and aborts the migration transaction). Only policies are created there.
- Quotas (Free / Pro): concurrent connections 200 / 500, messages per second
  100 / 500, channel joins per second 100 / 500 (higher tiers 10,000 /
  2,500). Broadcast payload limit 256 KB / 3 MB. Database-broadcast messages
  are retained in `realtime.messages` for replay (72 h retention, private
  channels only).
- `realtime.messages` is not usable in plain PostgreSQL, so the RLS matrix
  needs a stub (section 8).

### 2.5 Scope boundaries

In scope: authorization model, topic and payload contracts, token contract,
client lifecycle contract, rollout/rollback, validation plan, and the
ND-373 implementation brief. Out of scope: Presence, Postgres Changes,
server-side publishing via the REST broadcast API, agent/API principals,
live cursors, and any change to business tables or to `adr-057` environment
strategy.

## 3) Threat Model

| Threat | Control | Residual risk / validation |
| --- | --- | --- |
| Member of project A subscribes to project B's activity topic | SELECT policy evaluates membership for the topic's `projectId`; no membership means join denied | RLS matrix case + Preview two-account e2e |
| Forged or malformed topics (`project:<uuid>:activity` for arbitrary uuid, extra segments, unknown topic families) | Strict topic-shape helpers (exact segment count, allowlisted family/suffix) plus `EXISTS` on `Project` with the membership predicate | Matrix cases for foreign project, nonexistent project, malformed topic |
| Forged messages published by a client | No INSERT policies exist for `anon`/`authenticated` on `realtime.messages`; database broadcasts are private; client `send()` is rejected | Matrix/Preview test attempts a client publish and expects rejection |
| Expired or signed-out session with a live socket | Token TTL ≤ 10 min bounds residual access; re-mint requires a live session cookie (401 otherwise); policy cache invalidated on reconnect | Preview test: expire/rotate token, observe disconnect; sign-out closes channels client-side |
| Leaked Realtime token | Read-only (no publish), PII-free claims, per-user topic scope, ≤10 min TTL; strictly less powerful than the 30-day session cookie | Token claims unit tests; manual inspection |
| Service-role key exposure | None used: publishing happens inside the database via `realtime.send()`; browsers hold only the publishable key + user JWT | Secret scan; env contract keeps `SUPABASE_JWT_SECRET` server-only and sensitive |
| Notification leakage to the wrong user | `user:<userId>:notifications` predicate requires `topic userId = current user`; messages carry only the same snapshot the summary endpoint already returns to that user | Matrix cross-user case |
| Activity payload leakage | Topic membership mirrors the activity API predicate 1:1; payloads are the same JSON the API returns | Matrix case: viewer allowed, non-member denied |
| Broadcast failure breaks business writes | Trigger functions wrap `realtime.send()` in an exception block (RAISE WARNING, never abort the transaction); partition-missing caveat covered; reconciliation on connect and polling fallback | Trigger tests with forced failure; e2e degrade test |
| Realtime outage / quota exhaustion | Client falls back to the existing adaptive polling path; `REALTIME_TRANSPORT` kill switch reverts environments without a redeploy of code | Degrade e2e; kill-switch Preview run |
| Data-at-rest copies in `realtime.messages` | Accepted: payloads are the same data already persisted in NexusDash tables; Realtime retention is 72 h and private-channel only | Documented here; no PII added to payloads |

## 4) Options Considered

### Option A - Postgres Changes (CDC) subscriptions

- Pros: no triggers or publishing code; row-level RLS on the source tables is
  enforced by Realtime; changes stream straight from the WAL.
- Cons: requires adding tables to the `supabase_realtime` publication (a
  database-level operation outside Prisma's schema ownership and dependent on
  migration-role privileges); payload shape is a change envelope
  (`new`/`old`/`type`) rather than the typed contracts, forcing a mapping
  layer in the client; RLS is evaluated per subscriber per row as the
  `authenticated` role against our tables, which requires grants on app
  tables to `authenticated` (widening the privilege surface); CDC under
  heavy RLS is documented as slower to join; notification "snapshot" semantics
  (counts and latest title) are not expressible as a row change.
- Verdict: Rejected. It widens privileges, breaks the typed contract reuse,
  and is not what ND-373 was scoped to build.

### Option B - Client-published Broadcast (clients send after each mutation)

- Pros: no database triggers; publish happens in the same code path as the
  mutation.
- Cons: requires INSERT policies on `realtime.messages` for `authenticated`,
  which lets any member forge events attributed to any actor, exactly the
  integrity property we must keep; every mutation route needs publish
  plumbing plus retry/outbox semantics; multi-tab duplicates; publish
  failures are silent data-loss for liveness.
- Verdict: Rejected. Forgeable messages are unacceptable for activity and
  notification feeds.

### Option C - Database-trigger-published private Broadcast (selected)

- Pros: single durable emitter for every writer (API, agents, crons);
  transactional coupling with the data change; zero client publish
  permissions; reuses the existing membership predicate and typed payload
  contracts; no new grants to `authenticated` on business tables; the same
  migration-role/SECURITY DEFINER pattern already proven by
  `app.is_project_owner`.
- Cons: new DB triggers to operate (must never fail business transactions);
  Realtime-specific knowledge in SQL; publish requires the project JWT secret
  in Vercel env for minting.
- Verdict: Selected.

### Sub-decision: notification payload shape

- Signal-only (`{version, serverTime}` + client refetch) — fewer trigger
  queries, always-consistent counts, but adds one Vercel invocation per
  notification event and does not reuse the snapshot contract directly.
- Full snapshot in-message (selected) — the trigger computes the same
  snapshot `getNotificationRealtimeSnapshotForUser` returns (three small
  indexed queries per notification-mutating statement, coalesced per
  statement), the client handler stays unchanged, and no extra Vercel
  invocation is needed. Notification mutation volume is low.

### Sub-decision: token minting location

- Client-side signing is impossible without shipping the project secret
  (rejected outright).
- Server mint from the session (selected): `POST /api/realtime/token`,
  guarded by `requireAuthenticatedApiUser`, HS256 hand-rolled in a service
  module following the existing `lib/auth/agent-token-service.ts` pattern
  (no new dependency for signing).

## 5) Decision

### 5.1 Channel contract - project activity

- Topic: `project:<projectId>:activity` (`private: true` on join).
- Event name: `project-activity` (mirrors the SSE event name).
- Payload: `ProjectActivityEventPayload` exactly as defined in
  `lib/project-activity-event-types.ts`:
  - Typed event message (from a `ProjectActivityEvent` INSERT):
    `{ eventId: <row id>, projectId, version: <event.version ISO-8601 UTC>,
    serverTime, actorUserId, domain, action, entityId, payload }`.
  - Bare signal message (from a `Project.updatedAt` change): all event
    fields `null`, `version: <project.updatedAt ISO-8601 UTC>`, matching the
    SSE `createActivityPayload` branch.
- Client consumption: the parsed payload feeds the existing
  `handleActivitySnapshot` logic unchanged (version guard, local-mutation
  deferral, in-place `dispatchProjectActivityRemoteEvent` patch when
  `eventId` is present, `router.refresh()` otherwise).
- Emission:
  - Row trigger `AFTER INSERT ON "ProjectActivityEvent"` builds the typed
    payload and calls `realtime.send(payload, 'project-activity', topic,
    true)`.
  - Constraint trigger `AFTER UPDATE ON "Project" DEFERRABLE INITIALLY
    DEFERRED` with `WHEN (NEW."updatedAt" IS DISTINCT FROM
    OLD."updatedAt")` emits the bare signal at commit time, but only when no
    `ProjectActivityEvent` exists for that project with
    `version = NEW."updatedAt"`. The production touch-and-record paths write
    both rows with the same timestamp, so typed mutations emit exactly one
    message - the typed event - and the bare signal is suppressed. This is
    load-bearing: if the bare signal were emitted first (the immediate
    `AFTER UPDATE` order), its equal `version` would advance the client's
    version guard and the typed event that arrives second would be discarded
    as "not newer", defeating the in-place patch and forcing a full refresh
    for every change. Deferring to commit lets the trigger see the event row
    written earlier in the same transaction. Touch-only flows (membership
    activity) have no matching event and still emit the bare signal.
    Ordering and suppression are pinned by tests (section 8), and total
    volume is one message per project mutation (section 5.7).
  - Both trigger functions are SECURITY DEFINER with `SET search_path = ''`
    and wrap the `PERFORM realtime.send(...)` in an exception handler that
    raises a warning and continues, so a broadcast failure can never abort
    the business transaction.
- No triggers on DELETE: parity with today's SSE semantics (deletion flows
  are surfaced by the initiating client; other members converge through
  polling/reconnect reconciliation). Revisit only if a real gap appears.

### 5.2 Channel contract - notifications

- Topic: `user:<userId>:notifications` (`private: true`).
- Event name: `notification-snapshot`.
- Payload: `NotificationRealtimeSnapshot` exactly as defined in
  `lib/notification-realtime-types.ts`, computed by an
  `app.build_notification_realtime_snapshot(recipient_user_id TEXT)` helper
  with semantics identical to `getNotificationRealtimeSnapshotForUser`
  (minus the invitation sync): `version` = latest `Notification.updatedAt`
  ISO string or the epoch fallback; `unreadCount` = unresolved unread count;
  `latestUnreadNotification` = newest unread title or `null`; `serverTime` =
  emit time.
- Emission: **statement-level** triggers with transition tables
  (`AFTER INSERT` and `AFTER UPDATE ON "Notification"`) send one message per
  distinct `recipientUserId` affected by the statement, so bulk operations
  (`mark-all-read`, invitation sync) coalesce instead of fanning out per
  row. Same SECURITY DEFINER + exception-swallow pattern as 5.1.
- Client consumption: the parsed snapshot feeds the existing `handleSnapshot`
  logic unchanged (change detection, `publishNotificationRealtimeSnapshot`).

### 5.3 Authorization contract

New/changed database objects (one migration, guarded so it is a no-op on
databases without a `realtime` schema, e.g. local test databases):

1. `app.current_user_id()` gains a Realtime fallback:

   ```sql
   select coalesce(
     nullif(current_setting('app.user_id', true), ''),
     nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'
   );
   ```

   App-runtime behavior is unchanged (the GUC is always set there; both
   settings unset still yields `NULL` and fails closed).

2. Strict topic-shape helpers, reusing the canonical predicate:

   ```sql
   -- project:<projectId>:activity
   array_length(string_to_array(topic, ':'), 1) = 3
   and split_part(topic, ':', 1) = 'project'
   and split_part(topic, ':', 3) = 'activity'
   and exists (
     select 1 from "Project" p
     where p.id = split_part(topic, ':', 2)
       and (
         p."ownerId" = app.current_user_id()
         or exists (
           select 1 from "ProjectMembership" pm
           where pm."projectId" = p.id
             and pm."userId" = app.current_user_id()
         )
       )
   );

   -- user:<userId>:notifications
   array_length(string_to_array(topic, ':'), 1) = 3
   and split_part(topic, ':', 1) = 'user'
   and split_part(topic, ':', 3) = 'notifications'
   and split_part(topic, ':', 2) = app.current_user_id();
   ```

   The cardinality check is required: `split_part(topic, ':', 4)` alone
   returns `''` both when the fourth segment is absent and when it is
   explicitly empty, so it would accept `project:<id>:activity:` despite the
   strict-shape contract (`string_to_array` keeps the trailing empty element,
   so the length check rejects it). Empty segments that survive the
   cardinality check cannot pass the `EXISTS`/identity comparisons, and a
   `NULL` topic fails the length check (deny).

   The project helper is SECURITY DEFINER (same ownership pattern as
   `app.is_project_owner`, whose owner reads bypass RLS), STABLE. No LIKE
   matching, no dynamic SQL, exact segment allowlisting.

3. SELECT-only policies on `realtime.messages`, created inside a
   `DO` block guarded by the existence of `realtime.messages` (the
   `realtime` schema is locked down and RLS is already enabled - do not
   `ALTER TABLE`, only `CREATE POLICY`):

   ```sql
   create policy nd_realtime_project_activity_receive
   on realtime.messages for select to authenticated
   using (
     extension = 'broadcast'
     and app.can_receive_project_activity_topic(realtime.topic())
   );

   create policy nd_realtime_user_notifications_receive
   on realtime.messages for select to authenticated
   using (
     extension = 'broadcast'
     and app.can_receive_user_notifications_topic(realtime.topic())
   );
   ```

   **No INSERT policies are created for `anon` or `authenticated`.** The
   absence is part of the contract and gets a regression test.

4. `GRANT USAGE ON SCHEMA app TO authenticated;` and
   `GRANT EXECUTE ON FUNCTION ... TO authenticated;` for the helpers (the
   policy runs as `authenticated` during the Realtime join check).

5. Project/global Realtime setting "Allow public access" stays **off** in
   both Supabase projects (Preview and Production), so unauthenticated
   clients cannot join anything.

### 5.4 Token contract

- Endpoint: `POST /api/realtime/token`, guarded by
  `requireAuthenticatedApiUser` (human sessions only; agents receive `401`).
  `Cache-Control: no-store`.
- Response `200`:
  `{ token, expiresAt, supabaseUrl, supabasePublishableKey }` — the URL and
  publishable key come from `getSupabaseClientRuntimeConfig()` (already
  validated against `EXPECTED_SUPABASE_PROJECT_REF`), so each environment
  only ever hands out its own project's coordinates.
- Claims: `sub` = NexusDash user id, `role: 'authenticated'`,
  `aud: 'authenticated'`, `iat`, `exp`. Nothing else (no email, no name, no
  project ids).
- Signing: HS256 with `SUPABASE_JWT_SECRET` (the Supabase project's legacy
  JWT secret), implemented in a new
  `lib/services/realtime-token-service.ts` mirroring the existing hand-rolled
  HS256 pattern in `lib/auth/agent-token-service.ts` (no new dependency).
  When `REALTIME_TRANSPORT=broadcast` and the secret is missing, startup
  validation in `lib/env.server.ts` fails - the deployment must not come up
  with a half-configured transport. Asymmetric Supabase signing keys are
  **out of scope** for ND-373: they need their own algorithm/private-key
  configuration and signing path, so no partial fallback is specified here.
  The rollout precondition (section 7) verifies that both projects still
  expose the legacy secret; if one has revoked it, stop and revise this ADR
  with a fully specified asymmetric path instead of improvising one.
- TTL: `SUPABASE_REALTIME_TOKEN_TTL_SECONDS`, default `600`, clamped to
  `60..600` so the configured maximum can never exceed the 10-minute
  guarantee stated throughout this ADR; startup validation follows the
  `lib/env.server.ts` pattern. The TTL is the revocation SLA: a user removed
  from a project keeps receiving until their token expires or their
  connection re-authenticates.
- Re-mint: the client fetches a fresh token before expiry through the cached
  supabase-js `accessToken` callback (5.5); a signed-out or expired session
  gets `401` and the client drops one tier in the transport precedence (5.5),
  ultimately reaching polling.

### 5.5 Client contract

- New `lib/realtime/supabase-realtime-client.ts` wraps a lazily created
  supabase-js client (`@supabase/supabase-js`, dynamic import so it stays out
  of the initial bundle; `accessToken` callback wired to
  `POST /api/realtime/token` through a client-side token cache).
- Token cache: supabase-js invokes `accessToken` on connect and on every
  heartbeat (default 25 s), so the callback returns the cached token while it
  is more than ~60 s from expiry and re-mints only inside that margin, with
  single-flight deduplication so concurrent invocations share one request.
  Without the cache, a direct wiring would hit the token route every
  heartbeat, far more often than the <=10-minute TTL requires.
- `REALTIME_TRANSPORT` gains a `broadcast` value. Client precedence:
  broadcast -> stream -> adaptive polling. Each tier is entered only when the
  one above it is unavailable or has failed: a Broadcast failure (token
  fetch, `CHANNEL_ERROR`, `TIMED_OUT`, or `CLOSED` after bounded reconnect
  attempts by supabase-js) demotes to **stream** for as long as the
  deployment serves streams (ND-373's migration window), and a stream
  failure demotes to polling (`isPollingFallbackActive`). Each step down is
  silent, and a demoted tab retries the higher tier on the next
  visibility/online event. ND-374 removes the middle tier and the precedence
  collapses to broadcast -> polling.
- The stream tier must actually be reachable under
  `REALTIME_TRANSPORT=broadcast`: today both stream routes 404 unless
  `isRealtimeStreamEnabled()` is true, and that helper is exactly
  `transport === "stream"` (`lib/env.server.ts`). ND-373 widens the helper
  (or the route guards) to serve streams whenever the transport is `stream`
  or `broadcast` (equivalently, `!== "polling"`), so a Broadcast failure
  truly reaches SSE instead of skipping straight to polling; `polling` still
  disables the routes. ND-374 deletes the routes and the widened helper
  together.
- On subscribe success (`SUBSCRIBED`), run one reconciliation fetch through
  the existing polling endpoints before trusting the channel; version guards
  make late/replayed messages harmless. This is the missed-event
  reconciliation path.
- Connection model and tab leadership: one lazily created RealtimeClient per
  tab (a single WebSocket multiplexing the channels that tab holds); reuse
  `createTabLeaderCoordinator`, whose elections are per scope
  (`project:<id>` and `notifications`), so only the leading tab for a scope
  opens that channel and re-publishes payloads to follower tabs through the
  existing coordinator bus. A profile therefore holds one socket when the
  same tab leads both scopes (the common case) and at most two when
  leadership splits across tabs; per-scope elections do not guarantee a
  single profile-wide socket, and section 5.7 quotes the resulting bound.
  Visibility follows the coordinator's existing contract: when a leader tab
  hides, `setVisible(false)` resigns leadership for its scopes and the
  transport layer unsubscribes those channels (closing the underlying client
  once it holds none). Background tabs therefore never lead - their
  throttled heartbeat timers would make a hidden leader's lease racy against
  lease takeover - and ND-373 needs no coordinator change. When the tab
  becomes visible it re-probes; if re-elected it resubscribes through the
  shared client and runs the subscribe-time reconciliation fetch, and until
  then it is a follower fed by the coordinator bus. Follower tabs never open
  sockets.
- Sign-out: close channels, drop the token cache; the fallback polling path
  then hits `401` and the existing app-shell behavior applies.
- Observability: reuse `recordRealtimeCounter` with new counters (e.g.
  `broadcast.connections`, `broadcast.fallbacks`, `broadcast.tokenIssued`,
  `broadcast.tokenDenied`) so ND-375 can review the transport mix.

### 5.6 Configuration contract

- `SUPABASE_JWT_SECRET` — new, server-only, sensitive (Vercel Preview +
  Production; never `NEXT_PUBLIC_`).
- `SUPABASE_REALTIME_TOKEN_TTL_SECONDS` — new, optional, default 600.
- `REALTIME_TRANSPORT` — extended value set `broadcast | stream | polling`;
  invalid values still fail startup validation. Preview keeps its `polling`
  default until the rollout flips it explicitly.
- No service-role key is added anywhere, and the implementation must not
  introduce one.

### 5.7 Message and connection volume estimate

Inputs are illustrative; ND-374's load test and ND-375's review confirm at
real scale.

- Today (SSE): 1-2 PostgreSQL queries per second per open tab, plus 280 s
  reconnect churn per tab.
- After (Broadcast), steady state idle: **zero** messages and zero database
  queries for liveness.
- Project activity: 1 delivered message per project mutation per connected
  leader tab, because the deferred trigger suppresses the bare signal when
  the typed event is present (5.1). Example: 30 mutations/min in a project
  with 10 connected members -> 300 delivered messages/min (~5/s) — versus
  the documented ceiling of 100 msg/s (Free) / 500 msg/s (Pro).
- Notifications: 1 message per affected recipient per notification-mutating
  statement (coalesced), negligible beside activity volume.
- Connections: per-scope tab leadership with one multiplexed RealtimeClient
  per tab yields one WebSocket per browser profile when the same tab leads
  both scopes and at most two when leadership splits across tabs; elections
  only run among visible tabs (5.5), so hidden tabs hold no sockets. This
  compares to one SSE function connection per tab today (hidden tabs
  included) and stays well inside the 200/500 concurrent connection ceilings
  at our expected team scale.
- Payloads are small (well under 1 KB typical) against the 256 KB / 3 MB
  Broadcast payload limits.

## 6) Consequences

### Technical impact

- New transport module, token endpoint + service, one migration
  (functions, policies, triggers, grants); no business table or column
  changes, no Prisma schema change.
- `REALTIME_TRANSPORT` grows a third value and the transport-selection code
  is extended in ND-373; ND-374 later removes `stream` entirely.
- One new client dependency (`@supabase/supabase-js`), dynamically imported;
  the leaner `@supabase/realtime-js` is a viable substitute if the bundle
  profile matters.
- Realtime messages are retained in `realtime.messages` for up to 72 h
  (private channels only) — the same data already at rest in NexusDash
  tables.

### Operational impact

- Publishing moves from Vercel functions into the database; per-tab Fluid
  compute from streams disappears once ND-374 lands.
- Access revocation for live sockets is bounded by the 10-minute token TTL
  (documented trade-off; HTTP authorization is unchanged).
- Trigger failures are loud in Postgres logs (`WarnSendingBroadcastMessage`,
  warning records) but never fail business writes; liveness reconverges via
  reconnect reconciliation or polling.
- Supabase dashboard prerequisites (Realtime enabled, "Allow public access"
  off, JWT secret available) become part of environment setup and are
  recorded in the env runbook.

### Risks and mitigations

- Partition-missing caveat on first database broadcast (2.4): bounded by the
  exception-swallowing trigger, and the connecting client performs a
  reconciliation fetch anyway.
- Policy cache on long-lived connections: TTL bounds it; reconnect forces
  re-evaluation.
- Trigger drift (someone adds a new activity write path that bypasses
  `Project.updatedAt`/`ProjectActivityEvent`): the fallback polling path
  still converges; ND-374's load test should assert parity between
  transports.

## 7) Rollout / Migration Plan

1. **Supabase prerequisites (Preview, then Production).** Confirm Realtime
   is enabled, turn "Allow public access" off, and confirm the project JWT
   secret is available for minting (precondition per 5.4). Add
   `SUPABASE_JWT_SECRET` (sensitive) and optionally
   `SUPABASE_REALTIME_TOKEN_TTL_SECONDS` to the Vercel environments; update
   the env contract runbook and `.env.example` in the same PR as ND-373.
2. **Ship ND-373 on Preview.** Migration (helpers, policies, triggers,
   grants), token route/service, client transport selection with fallback,
   metrics counters. Triggers are additive and exception-swallowing, so
   deploying before any subscribers changes no existing behavior. The
   `DO` block guard keeps local/test databases (no `realtime` schema) clean.
3. **Preview validation** (section 8) with `REALTIME_TRANSPORT=broadcast`,
   including kill-switch runs (`stream`, `polling`) and a two-account
   authorization test.
4. **Production flip** via `REALTIME_TRANSPORT=broadcast` on the Production
   environment (same env-change + redeploy/promote mechanics as the existing
   runbook). Keep `stream` available until ND-374 removes it.
5. **Rollback.** Immediate: set `REALTIME_TRANSPORT=stream` (or `polling`)
   and redeploy/promote — clients fall back without a code change. Complete:
   disable the four triggers (below) so no further messages are emitted; no
   data migration or backfill exists, and policies are inert without
   subscribers.

   ```sql
   alter table "ProjectActivityEvent"
     disable trigger project_activity_event_realtime_broadcast;
   alter table "Project"
     disable trigger project_realtime_activity_signal;
   alter table "Notification"
     disable trigger notification_realtime_snapshot_broadcast_insert;
   alter table "Notification"
     disable trigger notification_realtime_snapshot_broadcast_update;
   ```

6. **ND-375** reviews the seven-day post-remediation window with the new
   Broadcast counters plus Supabase usage; the message/connection estimate
   in 5.7 is re-checked against real numbers there.

## 8) Validation Requirements

Automated (ND-373 PR):

- Unit: realtime token service (claims, base64url encoding, TTL clamping
  capped at 600, missing-secret startup failure) and token route (401 for
  agents/anonymous, 200 shape, no-store).
- RLS matrix (`npm run test:rls:setup && npm run test:rls`): extend the
  harness with a minimal `realtime` stub (schema, `messages` table with
  `extension`/`topic` columns, `realtime.topic()` reading a test GUC,
  `authenticated` role) created **before** the guarded policy migration is
  replayed, plus cases: owner allowed, member allowed, non-member denied,
  cross-user notification topic denied, malformed and trailing-colon topics
  denied (cardinality check), no INSERT policy (client publish denied), and
  the `request.jwt.claims` fallback of `app.current_user_id()` exercised
  without the `app.user_id` GUC.
- Trigger behavior: with a stub `realtime.send` writing into the stub
  `realtime.messages`, assert typed payload shape/ISO versions and
  deep-equality (key-order-insensitive) with the SSE payload shape, bare
  signal on touch-only flows, statement-level coalescing for bulk
  notification writes, and that a failing send never aborts the business
  transaction. Ordering/suppression test: a touch-and-record transaction
  emits exactly one message (the typed event, no bare signal), a touch-only
  transaction emits exactly one bare signal, and the deferred trigger's
  suppression check sees the event row written earlier in the transaction.
- Component tests mirroring the existing live-refresh suites: transport
  precedence with tiered demotion (broadcast failure -> stream -> polling),
  fallback activation on token/channel failure, leader-only subscription,
  hidden-leader resignation closing its channels, re-subscribe and
  reconciliation fetch after the tab becomes visible again, single
  multiplexed client per tab, and the token cache (the `accessToken` callback
  reuses the cached token across heartbeat invocations and re-mints with
  single-flight only inside the expiry margin).
- Env unit test: with `REALTIME_TRANSPORT=broadcast`, the stream guard
  serves the routes (no 404), and with `=polling` it still 404s.
- E2E (`npm run test:e2e`, UI touch): two-browser collaboration — activity
  and notification updates flow without SSE requests when broadcast is
  enabled; with `REALTIME_TRANSPORT=broadcast`, blocking WebSocket/token
  requests degrades to SSE stream requests (the stream routes stay served
  under the broadcast transport), then blocking streams degrades to polling,
  and freshness still converges.

Manual / environment:

- Preview two-account test: non-member join refused; member receives typed
  events within seconds; forged `channel.send()` rejected.
- Token lifecycle: token expiry disconnects and re-mints transparently;
  signed-out session cannot mint.
- Kill-switch run: `REALTIME_TRANSPORT=stream` and `=polling` on Preview
  return the system to the legacy paths with no dashboard breakage.
- ND-374 owns the load test (concurrent tabs/collaborators/reconnects) that
  proves bounded growth per active user.

## 9) Implementation Brief (ND-373)

Work items, in dependency order:

1. Migration `prisma/migrations/<timestamp>_nd372_realtime_broadcast/`:
   `app.current_user_id()` replacement, topic helpers (cardinality-checked)
   + grants, guarded `realtime.messages` policies, trigger functions
   (exception-swallowing, SECURITY DEFINER, empty search_path), the
   `ProjectActivityEvent` row trigger, the deferred constraint trigger on
   `Project`, the two statement-level `Notification` triggers, and
   `GRANT USAGE ON SCHEMA app TO authenticated`. Idempotent guards so the
   file is replayable in the matrix harness.
2. `lib/env.server.ts`: `getSupabaseRealtimeRuntimeConfig()` (URL +
   publishable key + JWT secret + TTL clamped to 60..600), extend
   `RealtimeTransport` to `broadcast | stream | polling`, keep
   invalid-value startup failure, fail startup when the transport is
   `broadcast` without a JWT secret, and widen `isRealtimeStreamEnabled()`
   to `transport !== "polling"` so the stream routes keep serving during the
   broadcast migration window (ND-374 deletes routes and helper together).
3. `lib/services/realtime-token-service.ts` + tests (HS256 mint, no
   dependency).
4. `app/api/realtime/token/route.ts` + tests (`requireAuthenticatedApiUser`,
   no-store, response shape).
5. Client: `lib/realtime/supabase-realtime-client.ts` (one multiplexed
   RealtimeClient per tab, cached `accessToken` callback); update
   `components/project-live-refresh.tsx` and
   `components/notification-live-updates.tsx` to select transport
   broadcast -> stream -> polling with tiered demotion, wire leader-only
   subscription (including the coordinator's visibility resignation),
   subscribe-time reconciliation fetch, and feed the unchanged handlers;
   add `broadcast.*` counters via `recordRealtimeCounter`.
6. Dependency: add `@supabase/supabase-js` (dynamic import); note
   `@supabase/realtime-js` as the leaner alternative if bundle size is a
   concern.
7. Docs in the same PR: `docs/runbooks/vercel-env-contract-and-secrets.md`
   (new vars, Realtime settings, rollback), `docs/runbooks/
   vercel-usage-and-spend-guardrails.md` (Broadcast counters and their
   caveats), `.env.example`, `journal.md`, and the ND-373 card.

## 10) Links

- Board: ND-372 (this design), ND-373 (implement Broadcast), ND-374 (retire
  SSE + load test), ND-375 (seven-day cost review).
- ADRs: `adr/decisions.md`, `adr/task-057-supabase-environment-strategy.md`
  (environment isolation this design relies on).
- Runbooks: `docs/runbooks/vercel-env-contract-and-secrets.md`,
  `docs/runbooks/vercel-usage-and-spend-guardrails.md`,
  `docs/runbooks/rls-tenant-isolation.md`.
- Code contracts: `lib/project-activity-event-types.ts`,
  `lib/notification-realtime-types.ts`,
  `lib/services/project-activity-service.ts`,
  `lib/services/notification-service.ts`,
  `lib/services/rls-context.ts`, `lib/auth/agent-token-service.ts`.
- Supabase documentation (verified 2026-10-03):
  - <https://supabase.com/docs/guides/realtime/authorization>
  - <https://supabase.com/docs/guides/realtime/broadcast>
  - <https://supabase.com/docs/guides/realtime/quotas>
