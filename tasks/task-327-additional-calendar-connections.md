# TASK-327: Additional Calendar Connections

## Status

Pending after TASK-326.

## Objective

Support multiple Google accounts and selectable calendars through a provider-
ready, strictly user-owned model while continuing to fetch event data live.

## Implementation Contract

- Migrate the singular credential without data loss into `CalendarConnection`,
  `CalendarSource`, and `CalendarPreference` models with direct user ownership,
  composite ownership foreign keys, forced RLS, and inventory coverage.
- Use provider strings plus a TypeScript adapter contract; Google is the only
  live provider in this task.
- Request `openid`, `email`, Calendar events, and read-only CalendarList scopes;
  use Google `sub` as stable account identity.
- Support add and reconnect OAuth intents. A reconnect must return the same
  non-legacy provider account.
- Discover/persist calendar metadata and access role. Calendar selection and the
  one write target are account-wide, not project-owned.
- Preserve existing users through a selected legacy source and upgrade the
  placeholder connection identity on reauthorization.
- Aggregate live events across selected sources with bounded concurrency,
  pagination, deterministic sorting, truncation signals, and partial-source
  warnings. Retry reads once for transient failures; never retry mutations.
- Keep the singular Google settings API as a compatibility facade and add
  connection, sync, disconnect, and preference APIs.
- Build accessible responsive connection cards, selection controls, write-target
  choice, and recovery states. Project Calendar events identify their source and
  creation can choose a selected writable calendar.

## Acceptance Criteria

1. A user can connect two Google accounts without one overwriting the other.
2. A user can select readable calendars across connections and choose exactly
   one selected writable target for new events.
3. Another NexusDash user cannot see or mutate any connection, source,
   preference, token, or event from the first user.
4. Existing single-connection users retain their active calendar and can adopt
   the legacy row during reauthorization.
5. Disconnecting one account leaves other accounts intact and clears an affected
   write target rather than choosing one silently.
6. Event responses and UI expose safe source metadata, never credentials.
7. Partial provider failures remain recoverable and do not hide successful
   sources.
8. Automated coverage and a two-Google-account live smoke validate the complete
   connection lifecycle.

## Definition Of Done

- Migration, RLS, adapters, APIs, Settings, project UI, tests, ADR, runbook,
  changelog, version, and tracking documents are complete.
- Full validation and explicit-ref preview deployment pass.
- Two authorized Google test accounts complete connect, select, event CRUD,
  reconnect, and single-account disconnect smoke coverage.
- A ready-for-review PR is open and automated feedback is resolved.
