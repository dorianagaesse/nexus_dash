# TASK-327 ADR: User-owned Calendar Connections and Sources

- Status: Accepted
- Date: 2026-08-06
- Owners: NexusDash product and platform

## Context

The original `GoogleCalendarCredential` combined one user's OAuth tokens and
one unverified calendar ID. That shape could not distinguish provider accounts,
represent readable versus writable calendars, aggregate multiple sources, or
preserve a write target independently of project access.

## Decision

Use three user-owned records:

- `CalendarConnection` owns provider identity and encrypted OAuth material.
- `CalendarSource` owns discovered provider-calendar metadata and selection.
- `CalendarPreference` owns the account-wide default connection and single
  write target.

Composite `(id, userId)` references prevent a source or preference from
crossing owners even before RLS evaluation. All three tables also use forced
direct-user RLS. Provider names remain strings and runtime behavior is accessed
through an adapter; Google is the only adapter shipped here.

OAuth requests OpenID identity, email, event access, and read-only CalendarList
access. Google `sub` is the stable account identifier. Reconnect rejects a
different established identity, while a `legacy:*` identifier is adopted in
place. Existing rows are renamed and expanded rather than copied through
application memory; the migration creates a selected source and preference
before removing the old `calendarId` column.

Events remain live provider data. Reads use at most four concurrent sources,
follow pagination to 1,000 events per source, retry one transient read once,
return partial successes with source warnings, and sort deterministically.
Mutations are never retried and always resolve an owned writable source.

## Consequences

- Adding an account never silently replaces the existing write target.
- Disconnecting the write-target connection clears the preference and disables
  creation until another writable source is chosen.
- Read-only calendars can be selected but never become a write target.
- Provider downtime can produce partial results; callers must render warnings.
- Projects remain an authorization context for Calendar surfaces, but account
  ownership and selection remain personal pending TASK-348 shared scheduling.

## Alternatives Rejected

- A JSON list on the legacy credential: weak ownership constraints and poor
  query/RLS behavior.
- Project-owned connections: exposes private account state across membership
  boundaries and conflicts with account-wide OAuth consent.
- Durable event copies/background sync: adds retention and reconciliation scope
  without being required for the live overlay.
