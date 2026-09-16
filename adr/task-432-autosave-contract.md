# ND-432 Autosave Contract

Date: 2026-09-17
Status: Accepted

## 1) Decision Summary

NexusDash will treat autosave as two separate capabilities:

1. **Recovery drafts** persist valid in-progress form state in browser storage
   without changing a project artifact. They protect work across modal close,
   navigation, reload, transient network loss, and a failed explicit save.
2. **Live save** writes edits to an existing NexusDash artifact after a quiet
   period. It is allowed only when that artifact has an atomic revision
   precondition and the save-latency work has shown that background mutations
   stay inside the agreed latency and database-load budget.

Creation, publication, destructive actions, workflow transitions, and writes
to external systems remain explicit. In particular, an autosaved task or
meeting-comment draft is never posted, and an autosaved create draft never
creates a partial or duplicate entity. Every surface that receives recovery
drafts or live save keeps its existing explicit action; on edit surfaces that
action flushes pending changes through the same conflict-safe mutation path.

## 2) Context

Long-form meeting inputs, meeting outputs, task descriptions, and comments are
currently held only in React state. Closing a modal, navigating away, or
reloading discards them. Other authoring dialogs reset their draft whenever
they open or close.

The existing mutation model is not safe for unguarded live save:

- Task updates are last-write-wins. The UI commonly sends title, labels,
  description, deadline, epic, assignee, and related tasks together even when
  only one field changed.
- Meeting-note updates replace the note's participant list and todo aggregate.
  A stale background request could delete or overwrite another collaborator's
  changes.
- Project activity can update the selected task while its separate edit draft
  remains open. Meeting-note activity currently reloads the page. Neither path
  has a dirty-draft reconciliation contract.
- Context-card and roadmap updates have timestamps but no conditional write.
- Calendar writes target a user's external Google Calendar and do not expose a
  provider revision to the client.

ND-428 is scheduled to measure save latency and database work; ND-429 will
apply its fixes. This design must not pre-judge their numeric targets or turn
each keystroke into a network or database mutation. Browser-local recovery can
ship independently, but live save is gated on those results.

### Scope boundaries

This ADR defines behavior and the implementation contract. It does not add
draft storage, revisions, routes, or UI by itself. ND-433 covers the first
long-form rollout. ND-434 covers the remaining selected authoring surfaces.

Attachments are not autosaved as file blobs. Existing edit surfaces that
upload an attachment immediately keep that independent command. A create form
may remember link drafts and selected file names, but a user must reselect
local files after a reload because browsers cannot safely restore a `File`
selection.

## 3) Options Considered

### Option A - Live-save every form directly to its domain endpoint

- Pros:
  - The server always holds the latest accepted text.
  - Drafts could follow the user across devices.
- Cons:
  - POST-based create forms can produce incomplete or duplicate entities.
  - Comments would be published before the author chose to post them.
  - Current last-write-wins routes can silently overwrite collaborator edits.
  - Typing would add sustained mutation, notification, activity, and database
    load before ND-428 establishes the baseline.
- Verdict: Rejected.

### Option B - Persist browser-local recovery drafts only

- Pros:
  - Removes the main reload/navigation data-loss path with no database load.
  - Preserves the meaning of Create, Post, Save, archive, and external writes.
  - Works while offline.
- Cons:
  - Edits are not visible to collaborators until explicit save.
  - Drafts do not follow a user to another browser or device.
  - Shared-browser retention needs an explicit privacy and cleanup policy.
- Verdict: Accepted as the baseline for every in-scope surface, but not as the
  complete long-term behavior for safe existing-record edits.

### Option C - Layer local recovery with revision-guarded live save

- Pros:
  - Local recovery remains available through network failures and conflicts.
  - Existing records can become current for collaborators without risking a
    silent stale overwrite.
  - Create and publish semantics can stay explicit.
- Cons:
  - Requires a shared draft library, per-aggregate revisions, partial patches,
    conflict UI, and load measurement.
  - Rich-text conflicts require user choice; they cannot be merged reliably in
    the general case.
- Verdict: Accepted. Local recovery is universal within the selected scope;
  live save is an additional, gated behavior for specific existing records.

## 4) Decision

### 4.1 Surface matrix

`Draft` below means browser-local recovery. `Live` means a debounced network
write to an already-created record. "Explicit" names the action that remains
authoritative even after autosave is introduced.

| Surface                                                                                                              | Recovery scope                                                                           | Save semantic                                                                                                                 | Explicit action and reset rule                                                                                                                                            |
| -------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Task comment composer                                                                                                | Text, human/agent mention selections, and already-uploaded screenshot attachment ids     | Draft only; never auto-post                                                                                                   | **Add comment** publishes. Clear only after a successful POST or explicit Discard.                                                                                        |
| Task creation                                                                                                        | Title, labels, description, deadline, epic, assignee, related task ids, and staged links | Draft only; never auto-create                                                                                                 | **Create task** creates exactly once. Clear after the server confirms creation. Local file selections are not restorable.                                                 |
| Task detail edit                                                                                                     | Editable task fields and their base snapshot/revision                                    | Draft plus conditional Live after the latency gate                                                                            | **Save changes** flushes now. Clear when the acknowledged server representation matches the draft. New blocked follow-up entries and attachment commands remain explicit. |
| Meeting preparation - create                                                                                         | Title, time, participants, labels, and input notes                                       | Draft only; never auto-create                                                                                                 | **Save preparation** creates the meeting note. Clear on confirmed creation.                                                                                               |
| Meeting preparation - edit                                                                                           | Preparation fields and their base snapshot/revision                                      | Draft plus conditional Live after the latency gate                                                                            | **Save preparation** flushes now. Steward changes remain their existing atomic command.                                                                                   |
| Meeting output/todos - edit                                                                                          | Output notes and uncommitted todo text/assignment changes with the note base revision    | Draft plus conditional Live for content; the aggregate must use the note revision                                             | **Save notes** flushes now. Moving the note to Done/archive remains explicit and is not triggered by a timer. Todo completion remains its existing atomic command.        |
| Context card creation                                                                                                | Title, rich content, color, and staged links                                             | Draft only; never auto-create                                                                                                 | **Create card** creates once. Clear on confirmed creation; local files must be reselected after reload.                                                                   |
| Context card edit                                                                                                    | Title, rich content, color, and base revision                                            | Draft plus conditional Live after the latency gate                                                                            | **Save card** flushes now. Attachment add/delete remains explicit.                                                                                                        |
| Roadmap event creation                                                                                               | Title, description, target date, status, and target milestone                            | Draft only; never create an event or implicit milestone in the background                                                     | **Create event** creates once and clears the draft only after both the phase/event operation succeeds.                                                                    |
| Roadmap event edit                                                                                                   | Editable event fields and base revision                                                  | Draft only in the planned rollout; no Live until ND-428 shows a user benefit and a safe mutation budget                       | **Save event** remains the only domain write. Card status cycling, drag, and move remain immediate atomic commands.                                                       |
| Google Calendar event creation                                                                                       | Event fields and selected calendar source id                                             | Draft only; never write to Google in the background                                                                           | **Create event** is the external side-effect boundary. Clear only after Google confirms creation.                                                                         |
| Google Calendar event edit                                                                                           | Event fields, source/event identity, and provider revision when available                | Draft only; no Live because provider edits can notify attendees and consume external quota                                    | **Save changes** is the external side-effect boundary. Conditional provider update is required before restoring a stale edit draft over a changed event.                  |
| Epic creation/edit                                                                                                   | Name and description                                                                     | Draft only; later rollout outside ND-433/ND-434 unless its card is expanded                                                   | **Create epic** / **Save epic** remain domain writes. Clear on confirmed success.                                                                                         |
| Project creation/edit                                                                                                | None in the current autosave program                                                     | Explicit only; these are short, infrequent administrative forms                                                               | Existing Create/Save actions remain unchanged.                                                                                                                            |
| Invite, access, credential, account, delete, archive, transfer, drag, status, assignee quick-change, todo completion | None                                                                                     | Excluded: these are commands, security-sensitive operations, or destructive/workflow transitions rather than authoring drafts | Existing confirmation or immediate command remains authoritative.                                                                                                         |

Product feedback and other app-global forms are not part of ND-432. They can
adopt the shared recovery-draft primitive later through a separate task, but
must make their own publication and retention decision.

### 4.2 Shared recovery-draft contract

Use one versioned client module and hook rather than surface-specific storage
code. A draft envelope contains:

- schema version and surface name;
- authenticated user id and project id;
- mode (`create` or `edit`) and stable entity id, or a single `new` slot per
  create surface/project;
- serializable form payload;
- `baseRevision` and a minimal base snapshot for edit conflict detection;
- local `draftRevision`, writer tab id, and `updatedAt` timestamp.

Keys use the following logical shape:

```text
nexusdash.draft.v1:{userId}:{projectId}:{surface}:{mode}:{entityId|new}
```

Browser `localStorage` is selected for the first implementation because the
drafts are bounded JSON text, writes are debounced, synchronous final flushes
are possible on `pagehide`, and it adds no database traffic or dependency.
The module must hide the storage choice so IndexedDB or server-synced drafts
can replace it later without changing each form.

Rules:

- Save locally 300 ms after the last serializable change. Flush the local
  draft on modal close, component unmount, `visibilitychange` to hidden, and
  `pagehide`. None of those lifecycle events starts a network save.
- Do not write during IME composition. The completed composition schedules a
  normal draft write.
- Restore only after client hydration and only for the same authenticated user,
  project, surface, mode, and entity. Show a visible "Draft restored" state and
  a Discard action; do not silently erase it on modal close or Cancel.
- Clear on confirmed create/post/save only when the server acknowledgement
  covers the draft revision that was submitted. If the user typed while a
  request was in flight, keep the newer draft.
- Cancel closes the surface but preserves a dirty recovery draft. Discard is a
  separate, confirmed action that removes it and resets from the current
  server representation.
- Retain drafts for 30 days since last edit. Opportunistically delete expired
  entries and entries for inaccessible/deleted artifacts. Logout clears the
  current user's draft namespace on that browser.
- Never store access tokens, raw agent keys, calendar credentials, password or
  account-security fields, file blobs, or object URLs. Already-uploaded
  attachment ids may be referenced if the caller is still authorized.
- On quota or serialization failure, keep the in-memory draft, stop claiming
  that it is safe, and show an actionable "Draft could not be stored locally"
  state. Never evict the active draft silently; expired drafts are the first
  cleanup candidates.
- Listen for the browser `storage` event. A newer draft written by another tab
  is treated as a concurrent edit, not silently substituted into an active
  form.

### 4.3 Live-save scheduling and load control

For matrix rows marked Live:

- Start a network save 2 seconds after the last valid change. Continuous input
  has a 30-second maximum wait so a long editing session is eventually saved.
- Allow only one request in flight per entity. Changes made while it is in
  flight are coalesced into one later request; they do not form a queue of
  snapshots.
- Send only dirty fields. Do not resend whole aggregates merely because the
  current UI happens to submit them that way.
- Invalid or incomplete state is stored locally but is not sent. The UI shows
  why live save is paused.
- Offline, hidden-tab, authorization-error, and conflict states stop timed
  network saves while local recovery continues. A transient failure uses
  bounded exponential retry (5, 15, then 60 seconds, capped at 60) with one
  timer per entity. An explicit Save retries immediately.
- An explicit Save cancels the timer, validates, and sends immediately through
  the same mutation and conflict path. It is not an unguarded overwrite path.
- The UI has distinct states: `Draft saved locally`, `Saving changes`, `Saved`,
  `Offline - draft safe locally`, `Save failed - draft safe locally`, and
  `Conflict - review changes`. A local draft must never be labelled simply
  `Saved`.

Local recovery may ship before ND-428/ND-429. Live save remains disabled per
surface until the same representative fixture used by ND-428 shows that:

1. the explicit and autosave mutation meet that surface's agreed p95 target;
2. one active editor stays within the request cap above;
3. an idle editor produces zero network/database writes; and
4. representative multi-editor traffic does not cause a sustained increase in
   database query time, activity churn, or notification-email work.

Feature flags must be per surface so one expensive aggregate can be disabled
without removing local recovery elsewhere.

### 4.4 Revision and API contract

`updatedAt` is display/activity metadata and is not a sufficient concurrency
token. Task comments, attachments, status operations, and other subresource
commands can change activity timestamps without changing the fields in an edit
form. Existing NexusDash aggregates selected for Live therefore gain a
monotonic integer `contentRevision` (name may be domain-specific if an
aggregate already has a revision vocabulary).

- Read responses include the revision and a strong `ETag` derived from the
  artifact id plus revision.
- Edit PATCH requests send `If-Match` for the base revision. Services enforce
  the expected revision atomically in the same RLS transaction as the update
  and increment it once for the accepted content mutation.
- Content-affecting commands within the same aggregate increment the revision.
  Activity-only events such as a new task comment do not increment the task's
  content revision.
- A stale `If-Match` precondition returns HTTP `412 Precondition Failed` with a
  stable `edit-conflict` code,
  the current revision, and the authorized current representation needed for
  reconciliation. It never applies the stale payload.
- Routes remain transport adapters. Parsing `If-Match` and mapping the response
  happens at the route; authorization, the compare-and-update, and revision
  increment remain in `lib/services/**`.
- The same precondition applies to explicit Save once a surface adopts the
  revision contract. Autosave must not be safer than the button users trust.

Google Calendar is not given a NexusDash `contentRevision`. Its API adapter
must expose and use the provider ETag (or equivalent updated version) before an
edit draft can be conditionally submitted. Until that exists, a restored draft
requires review and an explicit save; it is never live-saved.

### 4.5 Conflict and remote-update policy

The client keeps the base snapshot used to start the draft and compares it
with the latest authorized server representation:

1. If the server revision still equals the base revision, save normally.
2. If the server changed only fields untouched locally, rebase those fields,
   update the base revision, and retry once.
3. If both sides changed the same scalar, collection, or rich-text field, stop
   live save and show a conflict review. Never use arrival order or timestamps
   to choose a winner.
4. Rich text is an indivisible field for this contract. No automatic HTML or
   character merge is attempted.
5. Conflict review preserves both values and offers per-field **Use latest**
   and **Keep my version**. Keeping the local value is a new conditional write
   against the displayed latest revision, not an unconditional force update.
6. Deletion or lost access keeps the local recovery copy available for copy-out
   but disables saving. It is removed only by the user, logout cleanup, or the
   retention policy.

Remote project activity follows the same rule. A clean form can accept the
new representation immediately. A dirty form is never reset or page-reloaded;
it rebases disjoint fields or enters conflict review. Multiple tabs are an
additional remote writer and follow the same policy through `storage` events
and the server revision check.

### 4.6 Reset and lifecycle policy

- Successful create/post: clear the submitted draft after the response is
  accepted; retain any newer local draft revision.
- Successful edit save: advance the base snapshot/revision and clear only when
  no local changes remain.
- Modal close, Cancel, navigation, reload, offline, 5xx, timeout: retain.
- Validation error: retain and focus the invalid field.
- Conflict: retain until resolved or explicitly discarded.
- Entity delete/lost access: retain read-only for copy-out until discarded or
  expired.
- Switching entities: flush the old local draft and load the exact new key;
  never carry values between task/note/card/event ids.
- Changing project, user, calendar source, or create/edit mode changes the key;
  drafts cannot cross those boundaries.

## 5) Consequences

### Technical impact

- A shared typed recovery-draft module, hook, status component, and test harness
  are required before surface rollout.
- Task, meeting-note, and context-card live save need monotonic revisions and
  partial conditional service mutations. Meeting notes must stop treating a
  background text edit as permission to replace unrelated participants and
  todos.
- Remote activity handlers must become draft-aware. The meeting-note page
  reload on remote mutation cannot remain on an actively edited draft.
- Create and comment flows gain recovery without adding partial domain rows or
  a new server-side draft table.

### Operational impact

- Local recovery produces no server, database, notification, or activity-event
  work.
- Live-save traffic is bounded, measurable, and independently disableable.
- Browser storage contains project content in plaintext under the same-origin
  security boundary. User-scoped keys, logout cleanup, expiry, and the existing
  XSS controls are therefore part of the security contract.

### Risks and mitigations

- **Silent overwrite:** prevented by atomic revision preconditions and a 412
  conflict path.
- **Database load:** prevented for recovery drafts; live save is gated on the
  latency audit, coalesced, rate-bounded, and feature-flagged.
- **Duplicate create/post:** create and publish surfaces never perform timed
  domain writes.
- **False reassurance:** local and server save states use different labels.
- **Stale or private browser data:** drafts are user/project scoped, expire,
  clear on logout, and never contain credentials or file blobs.
- **Draft schema drift:** every envelope is versioned; an incompatible version
  remains copyable or is discarded with an explicit message rather than being
  submitted blindly.

## 6) Rollout / Migration Plan

1. Implement the shared draft envelope/store/hook and status UI with quota,
   expiry, lifecycle flush, logout cleanup, and cross-tab detection.
2. In ND-433, add recovery drafts to task comments, task detail edits, meeting
   preparation, and meeting output/todos. Preserve the current explicit
   buttons.
3. Add content revisions, conditional partial PATCH contracts, and conflict UI
   for Task and ProjectMeetingNote. Keep their Live flags off until ND-428 and
   ND-429 provide the measured gate.
4. Turn on task/meeting Live per surface after the gate passes; monitor request
   rate, p50/p95 latency, conflicts, failures, and database query time.
5. In ND-434, add recovery drafts to task/context/roadmap/calendar create and
   edit surfaces per the matrix. Add conditional context-card Live; keep
   roadmap and Google Calendar edit as Draft only unless a later evidence-backed
   task changes this decision.
6. Add epic recovery in a separately scoped follow-up if product priority
   warrants it. Administrative/security surfaces remain excluded.
7. Fallback: disable the affected Live flag. Local recovery and explicit Save
   continue to work through the same conditional mutation contract.

## 7) Validation Requirements

- Unit tests for key isolation, schema migration, expiry, quota errors, newer
  in-flight edits, and clear/reset rules.
- Component tests with fake timers for the 300 ms local debounce, 2-second
  network debounce, 30-second maximum wait, single-flight coalescing, offline
  behavior, and explicit flush.
- Service/API tests proving stale revisions return 412 and cannot alter data;
  accepted writes increment exactly once; disjoint partial patches do not
  replace untouched aggregate fields.
- Multi-client tests for disjoint rebase, same-field conflict, rich-text
  conflict, remote delete/access loss, and a second browser tab.
- Playwright coverage for reload/navigation recovery, successful clear,
  conflict review, explicit Save availability, create/post non-publication,
  and mobile status/error presentation.
- ND-428 fixture measurements before and after each Live flag is enabled,
  recording p50/p95, requests per active editing minute, idle writes (must be
  zero), database query time, conflict rate, and retry rate.
- Standard repository validation for implementation PRs: lint, RLS inventory,
  unit tests, coverage, production build, and relevant end-to-end flows.

## 8) Links

- Nexus Dash card ND-432: design task and acceptance criteria
- ND-428: save-latency audit and target definition
- ND-429: save-latency remediation
- ND-433: long-form autosave rollout
- ND-434: remaining selected authoring surfaces rollout
- `components/kanban-board.tsx`
- `components/project-meeting-notes-panel.tsx`
- `components/project-context-panel.tsx`
- `components/project-roadmap-panel.tsx`
- `components/project-calendar-panel.tsx`
- `lib/services/project-task-service.ts`
- `lib/services/project-meeting-note-service.ts`
