# TASK-327: Multi-account and Multi-calendar Connections

## Status

Implementation complete on `feature/task-327-calendar-connections-r4`, stacked
after `feature/task-326-calendar-ownership-r4` and refreshed onto current
`main`. Interactive two-account Google acceptance requires authorized
test-account access.

## Objective

Replace the singular Google credential with a user-owned, provider-ready
connection/source/preference domain; expose safe connection management; and
aggregate live events from every selected Calendar source while Google remains
the only live provider.

## Scope

- Data-preserving migration to `CalendarConnection`, `CalendarSource`, and
  `CalendarPreference`, including direct-user RLS and composite ownership keys.
- Provider adapter for authorization, identity, refresh, revocation, discovery,
  and event CRUD; Google OAuth gains identity and CalendarList scopes.
- Add/reconnect/sync/disconnect/preference APIs plus a compatibility facade for
  the singular Google settings endpoint.
- Server-rendered Settings management with focused accessible client controls.
- Bounded, paginated, partial-failure event aggregation and source-aware writes.
- Project Calendar source identification, target selection, and origin-locked
  mutations without durable event copies.

## Acceptance Criteria

1. Existing Google credentials migrate without token loss, receive a legacy
   identity/source/preference, and adopt the real Google `sub` on OAuth.
2. Users can add multiple Google accounts, discover/select calendars, retain a
   single writable target, reconnect safely, and disconnect one account without
   affecting another.
3. Selected sources aggregate deterministically with bounded concurrency,
   pagination, truncation metadata, one read-only retry, and per-source warnings.
4. Event responses identify connection/source/calendar/write capability;
   creation chooses an explicit or default writable source and mutations remain
   locked to the originating source.
5. Direct-user RLS and composite ownership constraints fail closed across
   connections, sources, preferences, and refresh-token access.
6. Settings and project Calendar flows meet keyboard, 44px touch, 375px,
   responsive, loading/error/empty/reauthorization, and light/dark requirements.

## Definition Of Done

- Migration, services, adapters, APIs, UI, compatibility path, ADR/runbook,
  tracking, changelog, and feature version are complete.
- Focused migration/provider/API/UI tests plus lint, RLS inventory, full tests,
  coverage, build, real PostgreSQL RLS, and Playwright pass.
- An explicit-ref preview and two-account interactive Google smoke are recorded.
- The branch is pushed and a ready-for-review stacked PR is open with actionable
  automated review feedback resolved.
