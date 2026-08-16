# TASK-325 Google Calendar Integration Audit

- Audit date: 2026-08-06
- Baseline: `a632a19` (`origin/main`)
- Scope: Google Calendar OAuth, credentials, settings, project surfaces, event
  operations, tests, RLS, and deployment configuration

## Executive assessment

The current integration has a sound **user-ownership boundary** but an
incomplete **connection lifecycle and product model**.

Every stored Google credential belongs to one NexusDash user. OAuth initiation
requires a signed-in session, the callback binds the random state and initiating
user to that same session, service reads use the authenticated user ID, and
PostgreSQL RLS independently restricts the credential row to that user. Project
members therefore cannot select or use another member's token through the
implemented routes.

The weaknesses begin after that boundary. NexusDash cannot genuinely disconnect
Google, does not enforce its stored revocation state, never identifies the
connected Google account, and represents only one connection plus one manually
entered calendar ID per user. The project Calendar looks collaborative while it
is a private overlay, and its summary request currently omits the project ID
required by the service. Automated coverage is broad at the mocked unit/API
layer but does not prove a live OAuth round trip or the calendar credential RLS
policy with two real database principals.

TASK-326 should close the ownership-lifecycle gaps without redesigning the
connection model. TASK-327 should then migrate to user-owned connections and
selectable calendar sources. TASK-348 remains responsible for separating the
private "My calendar" overlay from a future shared project schedule.

## Effective architecture and data flow

1. `GET /api/auth/google` resolves the session user, normalizes `returnTo`,
   generates random state, and stores state, return path, and actor ID in
   HttpOnly, secure-in-production, SameSite=Lax cookies.
2. The callback distinguishes Calendar authorization from Google social sign-in,
   compares state, requires the current session user to equal the initiating
   actor, exchanges the code server-side, and upserts only that user's row.
3. `GoogleCalendarCredential.userId` is unique and cascades from `User`; its RLS
   select/insert/update/delete policies require `userId = app.current_user_id()`
   and the table is forced through RLS.
4. Access and refresh tokens are encrypted with AES-256-GCM when
   `GOOGLE_TOKEN_ENCRYPTION_KEY` is configured. Production validation requires
   that key when Calendar OAuth is enabled; development currently permits
   plaintext storage.
5. Calendar service operations require a signed-in user and project access.
   Reads require viewer access; mutations require editor access. Google tokens
   and the stored calendar target are always resolved using the signed-in user.
6. Event data is fetched live from Google. NexusDash stores no event copies,
   sync cursor, or background event synchronization state.

## Verified strengths

| Area | Current safeguard | Evidence |
| --- | --- | --- |
| OAuth ownership | Callback state is random and bound to both the initiating actor cookie and current session | Calendar auth start/callback routes and route tests |
| Credential ownership | One credential row is keyed by `userId`; callers cannot submit a subject user through Calendar event routes | Prisma schema, credential service, API guards |
| Database isolation | Forced direct-user RLS covers select, insert, update, and delete | TASK-085 migrations and RLS inventory |
| Layering | Prisma access remains in services; routes parse, authenticate, call services, and map responses | Credential, account-settings, project, and calendar services |
| Token confidentiality | Tokens are never returned to clients and are encrypted in production | Token crypto service and runtime env validation |
| Refresh handling | Expired access tokens refresh server-side and retain the previous refresh token when Google omits a new one | Calendar access and credential services |
| Project isolation | Event operations prove project membership/role before contacting Google | Calendar service and API tests |
| Upstream errors | Known authentication, scope, not-found, and generic provider failures are mapped to bounded app errors; provider payloads are not returned | Calendar service |

## Findings

### P0 — disconnect is not implemented

`DELETE /api/account/settings/google-calendar` resets `calendarId` to `primary`;
it does not revoke Google consent, mark the credential revoked, or remove local
tokens. Settings exposes no disconnect control. This contradicts the route's
destructive verb and leaves users without an app-owned way to terminate access.

**Owner:** TASK-326. Mark the connection unusable first, attempt provider
revocation, then permanently delete local tokens even if upstream revocation
cannot be confirmed. Return a safe warning with a Google Account recovery path.

### P0 — stored revocation state is not enforced

The model has `revokedAt`, and project summary treats a revoked row as
disconnected, but credential lookup, refresh, token update, and target update do
not filter it. A revoked row could therefore still authorize event operations.

**Owner:** TASK-326. Make every operational read/update active-only and keep a
revoked row fail-closed if cleanup fails.

### P1 — the dashboard summary request is structurally invalid

The Calendar service requires `projectId` for viewer authorization.
`ProjectCalendarPanel` supplies it, but `CalendarSummaryStatCard` requests
`/api/calendar/events?range=current-week` without it. Connected users therefore
receive `project-id-required` and the summary cannot produce a count.

**Owner:** TASK-326. Pass the containing project ID through the summary card.

### P1 — development can persist real tokens as plaintext

Encryption is mandatory in production-like runtime validation, but the crypto
helper intentionally returns plaintext when no key is configured and local
Calendar OAuth is allowed in that state. A developer using a real Google account
can therefore leave bearer and refresh tokens readable in local PostgreSQL.

**Owner:** TASK-326. Require the key whenever Calendar OAuth is configured
outside tests and lazily encrypt legacy plaintext rows after authenticated
access.

### P1 — connection identity and cardinality are insufficient

`providerAccountId` exists but the OAuth flow never obtains or writes it. The
unique `userId` constraint permits only one connection, and a single
`calendarId` mixes connection identity, calendar discovery, read selection, and
write target into one row.

**Owner:** TASK-327. Introduce user-owned provider connections, discovered
calendar sources, and account-level preferences with a data-preserving legacy
migration.

### P1 — calendar selection is unverified manual input

Settings accepts any string up to 255 characters. It does not confirm that the
calendar exists, belongs to the connected account, is readable, or is writable.
Invalid IDs fail later in the project panel, and read-only calendars are not
distinguished before mutation.

The OAuth request currently asks only for `calendar.events`; Google's
CalendarList endpoint requires a CalendarList or broader Calendar scope, so the
current grant cannot power discovery.

**Owner:** TASK-327. Request the narrow read-only CalendarList scope, discover
the account's list, persist safe metadata/access roles, and validate selection
and write-target ownership in services.

### P1 — private data is presented as a project module

Members in the same project see different events because each request uses the
current member's Google token. Project role controls whether a member may mutate
their own calendar: editors can, viewers cannot. This does not leak another
member's calendar, but it can be mistaken for a shared project schedule.

**Owner:** TASK-348. Preserve the current role rule through TASK-326/327, then
label the personal overlay explicitly and design shared scheduling as a separate
NexusDash-owned domain.

### P2 — event reads are capped without pagination or partial-source semantics

The current list request asks for 250 events once. There is no page traversal,
retry/backoff contract, truncation signal, or concept of one source succeeding
while another fails. These become material as soon as multiple calendars are
selected.

**Owner:** TASK-327. Add bounded pagination/concurrency, one safe retry for
read-only throttling/transient failures, deterministic aggregation, and
per-source warnings. Never automatically retry event mutations.

### P2 — validation does not exercise provider or credential RLS end to end

Focused unit/API coverage is substantial and passes 76 tests on the audit
baseline. The Playwright smoke accepts either disconnected or connected state
but does not complete OAuth or CRUD against Google. The RLS inventory includes
the credential model, but the real isolation script does not seed two calendar
credentials and prove cross-user CRUD denial.

**Owners:** TASK-326 adds the two-user RLS matrix; TASK-327 adds provider-contract
coverage and a two-account live smoke.

### P2 — operational recovery is coarse

Refresh failure maps to `reauthorization-required`, but connection health is not
stored and Settings cannot identify which account needs attention. Encryption
key rotation requires blanket reauthorization. Ephemeral preview OAuth also
depends on a callback URI registered with Google, while the deployment workflow
injects only one configured redirect URI.

**Owner:** TASK-327 for per-connection health/reconnect UX and runbook updates.
Versioned key rotation and broader provider operations remain future hardening.

## Coverage baseline

- Focused Calendar suite: 9 files, 76 tests passed with the documented local
  validation environment.
- RLS inventory: covers every Prisma model and matches committed migrations.
- Existing E2E: verifies the panel can render a disconnected or already
  connected state and refresh; it does not authorize Google.
- Deployment: Vercel workflow forwards Calendar client ID, secret, redirect URI,
  and token-encryption key to preview/production jobs; the env/runbook contract
  treats the secret and encryption key as sensitive.

## Remediation sequence

1. **TASK-326 — ownership lifecycle hardening.** Active-only reads, true
   disconnect, upstream revocation, mandatory encryption for configured OAuth,
   summary request repair, and real RLS isolation.
2. **TASK-327 — connection expansion.** Provider-ready user-owned connection
   model, multiple Google accounts, discovered/selectable calendars, explicit
   write target, aggregated live events, and connection management UX.
3. **TASK-348 — personal versus shared scheduling.** Make private-overlay
   semantics explicit and design a NexusDash-owned collaborative schedule.

## Explicit non-findings

- No route or service path reviewed returns stored tokens to the browser.
- No implemented Calendar path selects credentials by project owner/member ID.
- No agent credential grants Calendar access.
- No evidence was found that one project member can read another member's
  Google connection through the current service contracts.

This was a repository and automated-contract audit, not a penetration test or a
completed live-provider certification.
