# TASK-348 Shared Project Schedule Contract

Date: 2026-08-09
Status: Proposed

## 1) Decision Summary

Adopt a NexusDash-owned shared project schedule as a first-class project
artifact, distinct from the user's personal Google Calendar overlay. The shared
schedule is persisted in NexusDash, scoped and isolated by project RLS, driven
by the TASK-337 project-actor identity and the TASK-331 capability vocabularies,
exposes a durable actor-attributed history, and optionally mirrors selected
events to/from external calendars (Google Calendar initially) via a
user-credentialed, per-connection sync channel. The existing personal Google
Calendar overlay stays user-scoped and continues to mutate the user's own
Google account; the shared schedule is the durable project-level source of
truth for project-bound time.

## 2) Context

### Background

TASK-336's multi-user collaboration audit named the project Calendar panel as
a P1 collaboration gap. The current integration is correctly user-owned (the
Google token belongs to the signed-in user and events come from their personal
calendar), but the panel is presented as if it were a shared project module:
a viewer cannot create an event in their own Google Calendar while looking at
a project, the panel header just says "Calendar", and editor role controls
mutation of the user's private calendar in a way that suggests shared
ownership.

### Why now

TASK-348 resolves the immediate UX and authorization confusion by relabeling
the overlay "My calendar" and decoupling create/update/delete from the
project editor role. The deeper issue — projects need a shared schedule that
all collaborators can see and edit together — remains, but cannot be
implemented immediately because it depends on two foundational pieces:

- **TASK-337 — First-class project actor identity.** A shared schedule needs
  to attribute every event to a human or agent actor and resolve that actor
  for current access, display, and history. Without TASK-337 the schedule
  cannot honor the "human or agent" distinction that auth/owner/assignee
  surfaces require.
- **TASK-331 — Granular project capabilities.** A shared schedule is a
  per-module capability surface (read, create, edit, delete, assign, export,
  sync). It must plug into the same vocabulary that tasks, meeting notes,
  context cards, epics, and roadmap already use, not invent a parallel
  permission model.

### Constraints

- The shared schedule must share its authorization surface with the rest of
  the project: ownership and last-owner protection remain authoritative;
  capability grants never grant ownership; capability is independent of
  assignment.
- The personal Google Calendar overlay must continue to work. It is the
  existing affordance, the audit logs already point to it, and many users
  lean on it for personal time blocking.
- The shared schedule must be realtime-coherent with the existing
  `ProjectActivityEvent` + SSE pipeline (TASK-310) so dashboard collaborators
  see new shared events without manual refresh.
- The storage boundary, RLS posture, and service-layer ownership rules from
  TASK-076 / TASK-085 / TASK-060 stay intact: persistence only in
  `lib/services/**`, RLS evaluation through `withActorRlsContext`, and the
  `lib/env.server.ts` contract for external credentials.

### Scope boundaries

This ADR covers the design contract only. It does not implement the shared
schedule. Implementation is sequenced behind TASK-337 and TASK-331 and will
arrive in a follow-up task that reuses this contract. The personal Google
Calendar overlay is out of scope for this ADR except where it defines the
boundary between personal and shared events.

## 3) Options Considered

### Option A — Promote the existing Google Calendar overlay to a "shared" project calendar

Reuse the user-scoped Google credential model but treat "the project" as a
Google Calendar ID. Owners would share access to a Google Calendar; viewers
would read it; editors would write to it.

- **Pros:**
  - No new persistence schema. Reuses Google's infra.
  - End users get a familiar Google Calendar UX.
  - Native mobile/desktop notifications already exist.
- **Cons:**
  - Google Calendar sharing is per-account, not per-role. NexusDash cannot
    enforce "owner removes `viewer` from the project" by revoking Google
    access in one place.
  - Ownership transfer and agent attribution are not first-class in Google
    Calendar. Audit, assignment, and history must be reverse-engineered.
  - Storage is no longer NexusDash-owned. The audit's "durable project
    history" requirement cannot be met from Google events alone.
  - History and capability enforcement fall back to scraping Google API
    responses, which is fragile and provider-shaped.
- **Verdict:** Rejected. Loses the audit's primary wins (NexusDash-owned
history, capability-aware authorization, project actor identity) while
introducing a brittle cross-system trust dependency.

### Option B — NexusDash-owned shared schedule with optional external sync (selected)

Persist the shared schedule as a normal project artifact in NexusDash
PostgreSQL, behind RLS and the project access service. Optionally allow each
linked external calendar (Google initially) to mirror schedule events to/from
the user's personal calendar through their own OAuth credentials.

- **Pros:**
  - Project ownership, capability, actor, and history are first-class and
    consistent with the rest of the project surface.
  - Personal Google Calendar overlay keeps working as a "My calendar" pane
    without complicated dual-use semantics.
  - External sync is opt-in, per-user, and credential-scoped. No shared
    external accounts.
  - Follows the existing service-layer/RLS pattern; the architecture is
    already shaped for this.
- **Cons:**
  - Requires a new schema, migration, and RLS policies.
  - Two systems to keep coherent (NexusDash truth + external projection).
    Sync conflicts must be handled explicitly.
  - External sync is a feature, not a requirement, so it can be deferred and
    shipped incrementally.
- **Verdict:** Selected. Aligns with the audit, the architecture, and the
existing TASK-336 refinement program.

### Option C — Build the shared schedule inline without TASK-337/TASK-331

Skip the actor + capability foundation and ship a flat schedule with
"owner/editor/viewer" writes.

- **Pros:**
  - Faster to ship than Option B.
  - No blocking work.
- **Cons:**
  - Reinvents vocabulary that TASK-331 will standardize; we will rewrite
    it (and any UI that consumed it) once TASK-331 lands.
  - Agent attribution is missing or fake. TASK-347's calendar notification
    producers and TASK-340's history cannot consume the resulting data.
  - History and audit cannot produce the actor-attributed, snapshot-safe
    timeline the audit requires.
- **Verdict:** Rejected. Throws away the foundation work that is already
sequenced.

## 4) Decision

### 4.1 Artifact model

The shared schedule is a project-scoped collection of `ProjectScheduleEvent`
records. Each event is owned by the project and has:

- **Identity & audit:** `id`, `projectId`, `createdByActorId`,
  `createdAt`, `updatedAt`, `deletedAt` (soft-delete), and a `revision`
  counter for safe replace and conflict rejection (TASK-339).
- **Time:** `startAt`, `endAt`, `isAllDay`, `timezone` (the actor's
  timezone at creation time, captured by IDB tz name, not an offset).
  All-day events use UTC midnight with a separate exclusive `endDate`.
- **Content:** `summary` (required, 1–200 chars), `description`
  (markdown, 0–4000), `location` (text), `status` (`scheduled` |
  `cancelled`).
- **Relationships:** `linkedTaskId` (optional, current project task),
  `linkedMeetingNoteId` (optional, current project meeting note),
  `linkedEpicId` (optional, current project epic), `parentEventId`
  (optional, for series).
- **Ownership:** the event is owned by the project, not by an actor. The
  `createdByActorId` is attribution, not ownership.
- **Assignment:** `assignees` is a small `ProjectScheduleEventAssignee`
  child collection. Each row references a TASK-337 project actor (human or
  agent). Assignees are responsibility, not authorization.
- **External links:** `externalLinks` — one row per external mirror (Google
  initially). Each link records the user's `GoogleCalendarCredentialId`,
  the remote calendar id, the remote event id, the last-known sync cursor,
  and the sync direction (`outbound` | `inbound` | `bidirectional`).

### 4.2 Owner / assignee actor contract (drawing on TASK-337)

The schedule uses the TASK-337 project actor identity verbatim. The actor
contract exposes:

- `id` (opaque stable identifier),
- `kind` (`human` | `agent`),
- `displayLabel` (current, resolved from the linked user or agent credential),
- `displaySnapshot` (durable label captured at write time, used in
  history/timeline when the live `displayLabel` is no longer reachable),
- `currentAccessState` (`active` | `inactive` | `removed`),
- `avatar` resolution (current; falls back to the durable snapshot).

The schedule uses the actor for:

- **Author attribution (`createdByActorId`, `updatedByActorId`).** Agent
  credentials carry the agent identity, not the human owner.
- **Assignment (`ProjectScheduleEventAssignee.actorId`).** When the actor
  is removed, the assignment is preserved as a snapshot row with
  `currentAccessState = "removed"` and the durable `displaySnapshot`.
- **History entries.** Every event row links to the actor that produced
  the change. If the actor is later removed, the history still shows who
  did it.

The actor contract is not a NexusDash-user lookup. It is a project-scoped
resolution that can be either a member of the project or an active project
agent credential.

### 4.3 Capabilities (drawing on TASK-331)

The schedule exposes granular capabilities that plug into the same
vocabulary as tasks, meeting notes, context cards, epics, and roadmap:

| Capability | Reserved to | Service enforcement |
|---|---|---|
| `schedule.read` | viewer, editor, owner | List and detail reads; RLS via `withActorRlsContext`. |
| `schedule.create` | editor, owner | POST `/api/projects/:projectId/schedule/events`. |
| `schedule.update` | editor, owner (unless assignee-only edits are allowed) | PATCH route; reserved-revision precondition. |
| `schedule.delete` | editor, owner (cascades to external links) | DELETE route; tombstone. |
| `schedule.assign` | editor, owner | Add/remove `ProjectScheduleEventAssignee`. |
| `schedule.export` | editor, owner | Emit ICS / mirror to user's external calendar. |
| `schedule.observe` | viewer, editor, owner | Project activity SSE event subscription. |
| `schedule.sync` | self — only the actor's own external link | Sync on behalf of the user; never on behalf of someone else. |

Rules consistent with TASK-331:

- Capability grants never grant project ownership. The owner protections
  remain authoritative.
- Assignment confers no implicit capability. An assignee without
  `schedule.update` cannot mutate the event.
- An agent credential that holds `schedule.create` and `schedule.update`
  can write events on behalf of its owner without the actor being
  independently a project member with `editor` role. The TASK-337
  actor contract resolves the credential owner's RLS subject for the
  write, but the agent identity is the attribution.
- Capability denials surface as `403 insufficient-capability` at the
  route and as a `schedule.capability-denied` row in the project activity
  stream (no secret payload).

### 4.4 History and audit surface

The shared schedule is a first-class producer for the durable project
history (TASK-340). Two complementary surfaces:

1. **`ProjectActivityEvent` SSE stream.** Existing realtime transport
   (TASK-310). The schedule emits typed events for created, updated,
   deleted, assigned, unassigned, and external-sync-completed. The viewer
   dashboard reconciles from the typed event when it is safe.
2. **Paginated `ProjectScheduleEventChange` rows.** Durable per-event
   history with the actor identity (TASK-337), the bounded diff (old vs new
   field values for changed fields), the revision at the time of change,
   and the deleted-tombstone marker. Surface as a project timeline filter
   `Schedule` and as an event-level "History" tab.

Rules:

- Every mutation writes a `ProjectScheduleEventChange` row inside the same
  transaction that updates the event. No best-effort logging.
- Field-level diffs are bounded to the schedule's own schema. They do not
  embed external payload, secrets, or unmodified copy.
- Tombstones (`deletedAt`) are permanent. Restoring a deleted event is a
  new create event; resurrecting the old id is not supported.
- Retention is aligned with the rest of the project history; no schedule-
  specific retention window.

### 4.5 Optional external-calendar synchronization model

Sync is opt-in, per-user, and per-credential. It is never implicit.

- **One link per (event, credential).** A `ProjectScheduleEventExternalLink`
  row is created when the user opts to mirror a schedule event into their
  personal Google Calendar. The row stores the user's
  `GoogleCalendarCredentialId`, the remote `calendarId`, the remote
  `eventId`, the `syncDirection` (`outbound` | `bidirectional`),
  `syncCursor` (opaque etag/version), and `lastSyncedAt`.

- **Direction semantics.**
  - `outbound` only: NexusDash pushes schedule events into the user's
    Google Calendar. Edits made in Google are not pulled back.
  - `bidirectional`: NexusDash projects edits in both directions using
    `syncCursor` + field-level diff. Conflict resolution is
    NexusDash-actor-wins for shared-owned fields (`summary`,
    `description`, `location`, `start/end`) and last-writer-wins by
    actor timestamp for `cancelled` state. Conflicts are surfaced as
    `schedule.sync-conflict` activity rows so the user can reset.
  - Inbound-only mirror is exposed as a downstream read by the existing
    "My calendar" overlay code path; it does not need a separate link
    row.

- **Authorization.** The link can only be created for the signed-in user's
  own Google credential. The route requires `schedule.sync` capability
  and ownership of the credential. The NexusDash credential owner is the
  only identity that can `DELETE` the link.

- **Failure handling.** Transient Google failures (5xx, network) retry on
  the durable queue with exponential backoff, up to the existing
  notifier-dispatch cadence. Permanent failures (401, 403, 404) surface
  as `schedule.sync-disconnected` and prompt the user to reconnect.
  Synced events never silently drift; the link row records the last
  successful sync and the next attempt.

- **What is not synced.** Optional project-only fields such as
  `linkedTaskId`, `linkedMeetingNoteId`, `linkedEpicId`, and assignees
  are stored in NexusDash only. They are not projected to the external
  calendar; remote edits that change those fields are silently ignored
  on the inbound path.

- **Privacy.** External sync is a per-user projection of a shared project
  artifact. The shared schedule is visible to all project members; the
  external link is the user's choice and is not visible to other members.

### 4.6 Service-layer and route shape

- Persistence lives in `lib/services/project-schedule-service.ts`. The
  service exposes `listProjectScheduleEvents`, `createProjectScheduleEvent`,
  `updateProjectScheduleEvent`, `deleteProjectScheduleEvent`,
  `assignProjectScheduleEvent`, `unassignProjectScheduleEvent`,
  `listProjectScheduleEventHistory`, and `syncProjectScheduleEvent`.

- Mutations run inside `withActorRlsContext(actorUserId, async (db) => ...)`
  and enforce the TASK-331 capability via `requireProjectCapability`.

- Routes are thin transport adapters at:

  - `app/api/projects/[projectId]/schedule/events/route.ts` (GET, POST)
  - `app/api/projects/[projectId]/schedule/events/[eventId]/route.ts`
    (GET, PATCH, DELETE)
  - `app/api/projects/[projectId]/schedule/events/[eventId]/assignees/route.ts`
  - `app/api/projects/[projectId]/schedule/events/[eventId]/history/route.ts`
  - `app/api/projects/[projectId]/schedule/events/[eventId]/sync/route.ts`
    (POST/DELETE on the external link)

- Activity events stream through the existing
  `app/api/projects/[projectId]/activity/stream/route.ts` with new typed
  `schedule.*` reasons.

### 4.7 UI surface

- A new "Schedule" project dashboard panel sits alongside Tasks, Context
  cards, Roadmap, and the existing "My calendar" overlay. It is the
  shared schedule and uses the same vocabulary as the dashboard stat row:
  "Schedule — N events this week".
- Event creation and editing flow reuses the existing `CalendarEventModal`
  form atoms but routes through the shared-schedule service. The form
  still distinguishes "My calendar" personal events from "Schedule" shared
  events so users do not confuse the two.
- The "My calendar" overlay remains a personal read/write surface against
  the signed-in user's Google Calendar. It is visually adjacent to the
  shared schedule but not the same panel.
- History is rendered as a timeline tab on each event, sourced from the
  `ProjectScheduleEventChange` rows.

## 5) Consequences

### Technical impact

- New schema: `ProjectScheduleEvent`, `ProjectScheduleEventAssignee`,
  `ProjectScheduleEventExternalLink`, `ProjectScheduleEventChange`.
  Each requires a Prisma migration and RLS policies that gate on
  `app.current_user_id()` and the project's owner/editor/viewer
  boundary.
- New service module and route surface, plus a feature-flag or capability
  gate to keep the dashboard from routing there until the feature ships.
- The TASK-337 project-actor contract must be present. The schedule
  service imports the actor resolution; the route relies on it for
  attribution and assignment.
- The TASK-331 capability vocabulary must include `schedule.*`. The
  service enum and the UI "capability-aware" affordances need to know
  which capabilities exist.
- The project activity SSE bridge gains `schedule.*` reasons. The
  dashboard's targeted reconciliation must recognize them.
- The external sync path depends on the existing durable notifier
  dispatch foundation (TASK-268 / TASK-273). It must integrate with the
  dispatcher's retry/idempotency surface, not invent a parallel one.

### Operational impact

- Project dashboard load increases by one panel. Caching and the
  existing targeted reconciliation will keep the round-trip cost low.
- External sync requires a user-credentialed outbound Google path. The
  existing Resend/credential pattern applies; no new provider.
- The activity timeline grows. Operators get the same observability
  surface as the rest of the project, not a new domain.

### Risks and mitigations

- **Risk:** Shipping before TASK-337 / TASK-331 forces a rewrite.
  **Mitigation:** This ADR is the contract. Implementation is sequenced
  behind both. Phase 1 (TASK-348) does not depend on them.
- **Risk:** External sync conflict is hard to reason about.
  **Mitigation:** The conflict model is intentionally simple (NexusDash
  wins on shared fields, last-writer-wins on cancel) and surfaces
  schedule.sync-conflict activity rows so users see divergence.
- **Risk:** Soft-delete + external mirror can drift.
  **Mitigation:** External links are tombstoned on event delete. A
  delete in Google does not propagate back; the link row keeps its
  `eventId` and the next sync observes the missing event and marks the
  link `disconnected`.
- **Risk:** History row volume grows.
  **Mitigation:** Bounded per-event diff + retention aligned with the
  rest of the project history. No raw payload, no secrets.
- **Risk:** Dashboard coupling between "My calendar" overlay and the
  shared schedule could confuse users.
  **Mitigation:** Two distinct labels, two distinct modal submission
  paths, and an explicit "Saves to project schedule" vs "Saves to your
  Google Calendar" caption on each form.

## 6) Rollout / Migration Plan

1. **Phase 1 (TASK-348, this task).** Relabel the existing personal Google
   Calendar overlay as "My calendar"; decouple mutation from project editor
   role. Keep the existing user-scoped Google flow intact. Ship the ADR.
2. **Phase 2 (TASK-337 lands).** Project actor identity becomes available.
   Verify the contract here is mechanically compatible with the actor
   resolution. No schedule work yet.
3. **Phase 3 (TASK-331 lands).** Capability vocabulary is available.
   Add `schedule.*` capabilities to the existing capability matrix and the
   project invitation acceptance flow.
4. **Phase 4 (Future shared-schedule task).**
   - Add `ProjectScheduleEvent`, assignees, external links, and history
     schema. RLS policies enabled in the same staged pattern as TASK-085.
   - Implement `project-schedule-service.ts` and the route surface.
   - Wire the activity SSE bridge for `schedule.*` reasons.
   - Land the dashboard "Schedule" panel behind a feature flag.
   - Add external sync mirror behind the same flag.
   - Roll the feature flag on, monitor, and remove the flag.
5. **Fallback.** If TASK-337 or TASK-331 slips, the schedule design remains
   valid because both contracts are intentionally defined as
   **inputs** to this design. The rollout steps accept either ordering.

### Validation

- TypeScript, lint, and unit tests green across the service and route
  surface.
- New API integration tests covering viewer, editor, and owner paths for
  each route; success, validation failure, capability denial, and
  not-authorized-for-this-project.
- New Vitest unit tests covering the schedule service for the conflict-
  safe revisions, the actor resolution integration, and the assignment
  snapshot behavior.
- New Playwright smoke for the project dashboard: schedule panel renders,
  editor can create an event, viewer sees the event without edit, history
  tab shows the create and update rows, mobile 375px and dark theme
  render without overflow.
- Manual external sync round-trip: create an event in NexusDash as an
  editor, verify it appears in the linked Google Calendar; edit in
  NexusDash, verify the Google event updates; delete in NexusDash, verify
  the Google event is removed and the link row is tombstoned.
- Manual conflict resolution: edit the same event in both NexusDash and
  Google inside the sync window, verify the conflict surfaces as a
  `schedule.sync-conflict` activity row and the user can reset.

## 7) Validation Requirements

- **`npm run lint`** — must pass; the new modules share the existing
  boundary rules.
- **`npm run rls:check`** — must pass; the new tables must be added to the
  RLS posture check.
- **`npm test`** — must pass; service and route unit tests included.
- **`npm run test:coverage`** — coverage thresholds must be met on the
  new modules.
- **`npm run build`** — must pass; route compilation succeeds.
- **`npm run test:e2e`** — must pass; the new Playwright schedule smoke is
  included.
- **Manual sync round-trip** — see Rollout step 4.
- **Manual conflict resolution** — see Rollout step 4.

## 8) Links

- TASK-348 task brief: `tasks/task-348-personal-calendar-shared-schedule.md`
- TASK-348 current state: `tasks/current.md`
- TASK-336 multi-user collaboration audit: `tasks/task-336-multi-user-collaboration-audit.md`
- TASK-337 project actor identity: `tasks/backlog.md` (Collaboration
  Refinement Program)
- TASK-331 granular project capabilities: `tasks/backlog.md` (Collaboration
  Refinement Program)
- TASK-340 durable collaboration history: `tasks/backlog.md`
- TASK-347 meeting → calendar notification producers: `tasks/backlog.md`
- TASK-310 typed activity events: `adr/decisions.md`
- TASK-308 SSE transport: `adr/decisions.md`
- TASK-276 client-side activity acknowledgements: `adr/decisions.md`
- TASK-085 RLS staged rollout: `adr/decisions.md`
- TASK-076 boundaries: `adr/task-076-supabase-r2-google-calendar-boundaries.md`
- TASK-058 verified existing-user invitations: `adr/decisions.md`
- TASK-059 agent access v1: `adr/decisions.md`
- Existing personal calendar service: `lib/services/calendar-service.ts`
- Personal "My calendar" overlay: `components/project-calendar-panel.tsx`,
  `components/calendar-panel/`, `app/projects/[projectId]/project-calendar-panel-section.tsx`
- Project activity SSE: `app/api/projects/[projectId]/activity/stream/route.ts`
- Project activity events: `prisma/schema.prisma`
