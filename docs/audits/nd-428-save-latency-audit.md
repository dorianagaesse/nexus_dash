# ND-428 Save-Latency Audit

Date: 2026-09-20  
Status: Complete  
Follow-up: ND-429

## Outcome

The slow-save report is not caused by React input handling or by the local
database doing expensive computation. The dominant risk is the number of
serialized database round trips in task and meeting-note mutations. The
current meeting-output path reaches 62 SQL statements when a note has ten
existing todos. That is still 149.3 ms p95 against loopback PostgreSQL, but it
creates a multi-second latency floor when each statement pays remote database
round-trip time.

Roadmap mutations are materially cheaper: single saves measured 26.1-34.6 ms
p95 locally and use 9-11 SQL statements. Their main user-perceived cost is the
client's unconditional `router.refresh()` after it has already reconciled the
returned phase locally. That refresh rebuilds unrelated dashboard sections and
duplicates work on the actor's own mutation.

ND-429 should therefore reduce meeting/task query amplification first, then
remove the redundant actor-side roadmap refresh while preserving remote
freshness and notifications.

## Scope and method

The audit covered the acceptance-criteria surfaces plus the two materially
different meeting-output cases:

- task create and task description edit;
- meeting-note create and preparation edit;
- meeting-output edit with ten newly submitted todos;
- meeting-output edit with ten already-persisted todos;
- roadmap phase create/edit and event create/edit;
- the roadmap UI's two-request "new milestone + event" create path.

Latency measurements used a production Next.js build, Playwright Chromium's
authenticated request context, RLS-enabled application transactions, and a
local PostgreSQL 16 database on `127.0.0.1`. Each surface had three discarded
warm-ups followed by 20 sequential measured saves. Wall time starts immediately
before the browser request and ends when the complete canonical response is
available; this is the network/server critical path awaited by the current
save buttons before they close their dialog and show success.

SQL statement counts came from one instrumented service pass with RLS enabled.
Task and meeting counts include their post-mutation typed activity event work;
roadmap counts reflect their current coarse project-activity touch. Counts
include transaction/control statements but exclude the HTTP session lookup,
JSON parsing, and client work, so they are a conservative route-level lower
bound.

The fixture is intentionally local and deterministic. It isolates application
work from internet, cold-start, and hosted-database variance. Prior deployed
evidence in `docs/reports/task-275-performance-investigation.md` recorded
seconds-level task mutations, which is consistent with the round-trip
amplification found here, but those older preview numbers are not presented as
current ND-428 measurements.

## Baseline results

| Save path                               | p50 wall | p95 wall |         SQL statements |
| --------------------------------------- | -------: | -------: | ---------------------: |
| Task create                             |  56.4 ms |  86.1 ms |                     27 |
| Task edit                               |  48.0 ms |  62.2 ms |                     28 |
| Meeting create                          |  60.3 ms |  73.9 ms |                     36 |
| Meeting preparation edit                |  57.8 ms |  70.2 ms |                     42 |
| Meeting output edit, ten new todos      |  65.1 ms |  82.2 ms |                     43 |
| Meeting output edit, ten existing todos |  85.2 ms | 149.3 ms |                     62 |
| Roadmap phase create                    |  22.8 ms |  34.6 ms |                      9 |
| Roadmap phase edit                      |  25.1 ms |  32.8 ms |                      9 |
| Roadmap event create                    |  23.8 ms |  31.5 ms |                     11 |
| Roadmap event edit                      |  20.6 ms |  26.1 ms |                     10 |
| New milestone + event create            |  41.3 ms |  45.5 ms | 20 across two requests |

Task routes already expose `Server-Timing`. Their measured server p95 was
73.4 ms for create and 55.0 ms for edit, versus 86.1 ms and 62.2 ms wall time.
The 7-13 ms difference confirms that browser/request overhead is secondary in
the local fixture. Meeting and roadmap routes do not yet expose equivalent
timing headers.

### Remote round-trip sensitivity

SQL statements inside an RLS transaction are serialized on one PostgreSQL
client. The meeting service also starts a second RLS transaction in the route
to authorize and persist the typed activity event. As a simple sensitivity
check, 62 sequential statements at 10 ms database RTT imply about 620 ms of
transport time before query execution, serialization, the HTTP trip, or a cold
start. At 30 ms RTT, the same path implies about 1.86 seconds. This is not a
substitute for a deployed measurement; it explains why a locally acceptable
path can match the reported multi-second behavior in a remote runtime.

## Root-cause breakdown

### Meeting-note saves

Dominant contributor: serialized query amplification.

`updateProjectMeetingNote` treats every save as replacement of the complete
note aggregate. It:

1. authorizes inside an RLS transaction;
2. reads the note and every existing action;
3. resolves participants, the mutation actor, and the complete actor registry;
4. replaces participants and issues nested deletes, updates, and creates for
   actions even when the user changed only note content;
5. rereads the complete note and loads the actor registry again for the
   response;
6. touches project activity;
7. returns to the route, which opens another RLS transaction, authorizes again,
   touches activity again, and records the typed event.

Existing todos are the clearest multiplier. Updating ten persisted rows raises
the statement count from 43 to 62 even though an output-only edit does not need
to rewrite those todos. Rich-text coercion and response mapping happen locally
and did not dominate the timings.

The meeting UI already reconciles the returned note in local state and does
not wait for a dashboard refresh. Client rendering is therefore not the
dominant save latency.

### Task create and edit

Dominant contributor: serialized database work, especially the separate typed
activity transaction.

Task services validate relations/epics/assignees, write the task, load a full
board-ready representation, touch project activity, and then let the route
open another RLS transaction to authorize and record the typed event. This is
27-28 statements for the minimal benchmark payload. The UI uses the returned
task for local reconciliation, so broad client refresh is not on the critical
path for these measured saves.

Assignment and notification work is correctly conditional and was absent from
the minimal benchmark. It should remain synchronous only where the user-facing
contract requires it; ND-429 must verify assignment notifications separately
when changing the transaction boundary.

### Roadmap phase and event saves

Dominant contributor: redundant broad dashboard refresh after the mutation,
not the mutation itself.

Roadmap services use 9-11 statements and measured below 35 ms p95 per request.
Creating an event in a new milestone uses two sequential requests but still
measured 45.5 ms p95 locally. After receiving the canonical phase, the client
updates `roadmapPhases`, closes the dialog, shows success, and then calls
`router.refresh()`. The refresh reruns server work for the project dashboard,
including sections unrelated to the roadmap.

Roadmap writes currently advance only the coarse project activity marker. They
do not return a project-activity version header or use
`fetchProjectActivityMutation`, so the actor cannot acknowledge its own write
through the same path used by task and meeting mutations. The explicit refresh
is compensating for that incomplete mutation contract.

### Realtime polling and database load

The activity SSE route still polls every second. Each pass reads typed events;
when none are present it also reads the project snapshot. This background load
is independent of a single save's response time, but it competes for pooled
connections and grows with open dashboards. ND-429 should not increase that
poll rate or add per-keystroke events. Realtime work must stay at one durable
event per accepted explicit mutation, consistent with ND-432.

## ND-429 targets

ND-429 is accepted against the same production-build/local-PostgreSQL fixture
and a branch preview. Use at least 20 post-warm-up samples per surface and
report both p50 and p95.

| Surface                                     | Local p95 target | Branch-preview p95 target |       SQL budget |
| ------------------------------------------- | ---------------: | ------------------------: | ---------------: |
| Task create/edit                            |         <= 75 ms |               <= 1,000 ms | <= 20 statements |
| Meeting create/preparation edit             |         <= 80 ms |               <= 1,000 ms | <= 26 statements |
| Meeting output edit with ten existing todos |        <= 100 ms |               <= 1,000 ms | <= 32 statements |
| Roadmap phase/event single save             |         <= 50 ms |                 <= 750 ms | <= 11 statements |
| New milestone + event create                |        <= 100 ms |               <= 1,000 ms | <= 20 statements |

Additional behavioral targets:

- the actor sees button/loading feedback within 100 ms and a completed save
  state without a full dashboard refresh;
- remote collaborators still receive one canonical invalidation/event for the
  accepted mutation;
- task assignment and mention notifications remain correct and are not
  duplicated;
- an idle editor produces zero save writes;
- ND-432 live autosave stays disabled until the affected surface also has a
  revision precondition and meets its request-rate/coalescing gates.

The preview thresholds are user-perceived response targets rather than an
attempt to make remote infrastructure equal loopback PostgreSQL. A save that
exceeds 300 ms must retain visible progress feedback; the one-second p95 ceiling
keeps explicit saves responsive while leaving room for network variance.

## Prioritized fix list for ND-429

1. **Diff meeting-note aggregates.** Preserve omitted fields, skip participant
   replacement when preparation participants did not change, and do not issue
   action updates for unchanged persisted todos. Load the actor registry once
   per mutation and reuse it for response mapping.
2. **Remove duplicate activity work.** Record the typed task/meeting activity
   event in the mutation's existing RLS transaction, or otherwise avoid a
   second authorization and project touch. Return the committed activity
   version for the response header. Keep notification behavior unchanged.
3. **Complete the roadmap mutation contract.** Emit/return a roadmap activity
   version, use the shared activity-aware fetch helper, acknowledge the actor's
   write, and remove the unconditional actor-side `router.refresh()` after
   local reconciliation. Remote/unknown events may continue to use the safe
   refresh fallback.
4. **Add consistent timing evidence.** Add `Server-Timing` to meeting and
   roadmap mutation responses and keep focused regression coverage for the
   activity/version headers. Use the headers to separate app time from network
   time in preview verification.
5. **Re-run the exact fixture.** Record before/after p50/p95 and statement
   counts in the ND-429 card comment, including the ten-existing-todo case and
   the two-request new-milestone case.

## Autosave gate conclusion

ND-432's browser-local recovery drafts are unaffected and remain safe to
implement. Network live save is **not approved** by this audit alone:

- meeting/task mutations lack the revision preconditions required by ND-432;
- meeting output exceeds the query and local p95 budgets in its common
  existing-todo case;
- activity/notification coalescing for background saves is not implemented;
- the current SSE transport polls the database and should not receive
  per-keystroke traffic.

After ND-429 meets the performance targets, ND-433/ND-434 must still satisfy
the revision, conflict, request-cap, idle-write, and coalescing gates in the
autosave ADR before enabling network live save.

## Evidence paths

- `adr/task-432-autosave-contract.md`
- `components/project-meeting-notes-panel.tsx`
- `components/project-roadmap-panel.tsx`
- `components/kanban-board.tsx`
- `lib/services/project-meeting-note-service.ts`
- `lib/services/project-roadmap-service.ts`
- `lib/services/project-task-service.ts`
- `lib/project-activity-event-response.ts`
- `app/api/projects/[projectId]/activity/stream/route.ts`
- `docs/reports/task-275-performance-investigation.md`
- `docs/reports/task-310-performance-investigation.md`
