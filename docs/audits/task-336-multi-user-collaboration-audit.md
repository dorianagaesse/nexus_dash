# TASK-336 Multi-User Collaboration Audit

- Audit date: 2026-07-27
- Baseline: `c1ebb17` (`origin/main`, including TASK-329)
- Product frame: shared project execution for people and project-scoped agents
- Related UX baseline:
  [`task-270-ui-ux-assessment.md`](../reports/task-270-ui-ux-assessment.md)

## Executive assessment

NexusDash is multi-user at the **access and freshness** layers, but only partly
multi-user at the **accountability** layer.

The foundations are credible:

- projects have owner/editor/viewer access and tenant isolation
- active dashboards receive live remote changes
- tasks have a human assignee, creator, last editor, attributed comments,
  mentions, reactions, assignment notifications, and reminders
- agent credentials have project scopes and an operational audit trail
- meeting participants now distinguish NexusDash users from external guests

The inconsistency appears above those foundations. Meeting notes, context
cards, epics, and roadmap items are shared records that any eligible editor can
change, but they do not communicate who is accountable for them. Their
timestamps often exist without visible authorship. Realtime activity is used to
refresh screens, not to explain history. Agent writes outside task comments
are represented as writes by the credential owner or have no artifact-level
actor at all. Concurrent editors can overwrite one another without a version
conflict.

The product should therefore avoid a cosmetic "add avatars everywhere" pass.
It needs one collaboration model:

> Every shared artifact has a visible accountable steward, every action has an
> assignee when responsibility matters, and every mutation preserves the real
> human or agent actor without silently granting that actor extra access.

## Important distinctions

These concepts must not be collapsed:

| Concept | Meaning |
| --- | --- |
| Project access | The principal may see or mutate some project data. |
| Steward or owner | The actor accountable for keeping one artifact correct and moving. |
| Assignee | The actor expected to complete one actionable item. |
| Creator | The actor who originally created the record; useful provenance, not permanent responsibility. |
| Last editor | The most recent actor to mutate the record; useful context, not history. |
| Participant | A person who attended a meeting; participation does not imply accountability or product access. |
| Follower | An actor who wants relevant changes without owning the artifact. |
| Agent credential owner | The human who manages an API credential; not the agent that performed a scoped mutation. |

Assignment must never grant permission. External meeting guests may remain
participants, but they cannot be product assignees until they become authorized
project actors.

## Audit method

The audit combined:

- the Prisma schema and migrations
- service authorization and mutation paths
- session and agent API routes
- dashboard and account UI components
- notification and realtime infrastructure
- existing unit, API, component, and Playwright coverage
- a production build and seven Playwright walkthroughs against isolated local
  PostgreSQL

The runtime walkthrough passed all seven selected flows: project creation,
task lifecycle, context-card preview, meeting preparation/output/search,
participant identity, roadmap milestones, and Calendar interaction.

This is a collaboration-product audit, not a security penetration test, formal
WCAG audit, or implementation design for every resulting task.

## Collaboration maturity by surface

| Surface | Current strengths | Material gap | Priority |
| --- | --- | --- | --- |
| Project and membership | Singular project owner; owner/editor/viewer roles; owner-managed invitations and agent credentials; visible member avatars | No ownership transfer or owner leave path; collaborator removal does not provide a responsibility-reassignment workflow; shared-project cards show the viewer's role but not the responsible owner identity | P0 |
| Tasks and Kanban | Human assignee, creator, last editor, comments, mentions, reactions, due reminders, assignment notifications, task deep links | Assignee is user-only; most agent writes are credited to the credential owner; only the latest editor survives; blocker follow-ups and attachment actions lack visible actor history; no personal responsibility filters | P0 foundation / P2 refinement |
| Meeting notes | Project-scoped history, structured participants, stored creator and last editor IDs, lifecycle state, search, todos, realtime refresh | No visible note steward, creator, or last editor; any editor can mutate/delete; decisions have no individual provenance; no discussion or mentions | P1 |
| Meeting todos | Open/completed state, project-wide panel, overdue state, deep link, reminder foundation | No assignee or completion actor; UI says "Todos for me" while the todos are shared and unassigned; every editor can complete any item; overdue reminders target the note creator | P1 |
| Context cards | Shared rich content, attachments, realtime reconciliation, owner-only card deletion | No steward, creator, last editor, or visible update time; uploader identity is stored but omitted from responses/UI; no review cadence, discussion, or mentions | P2 |
| Epics | Shared initiative grouping, derived progress and status, linked task rollup | No accountable lead, creator, last editor, history, discussion, or subscription; agents borrow task scopes and leave no epic-level actor attribution | P2 |
| Roadmap phases/events | Shared milestone states, target dates, ordering, agent read/write/delete scopes | No milestone owner, creator, last editor, discussion, or execution link; typed realtime events do not cover roadmap mutations; agent actor is not preserved on the artifact | P1/P2 |
| Calendar | Credentials and target calendar are correctly user-owned; project access is checked | The project module displays and mutates the current user's private Google Calendar while looking like shared project data; an editor role controls mutation of the editor's own calendar; teammates do not see one shared schedule | P1 |
| Attachments | Uploader ID is stored; storage lineage and project authorization are enforced | Uploader is not surfaced; add/delete events are not part of a durable user-facing history; replacement/version semantics are absent | P2, fold into parent/history tasks |
| Notifications | Durable per-user inbox, live unread state, invitations, task mentions/assignments, due reminders, meeting-todo reminders, email orchestration | No follow/watch model, per-artifact preferences, or broad change producers; agents have no work notification contract; meeting reminders currently infer responsibility from creator | P2 |
| Agent access | Project-scoped credentials, bounded scopes, token exchange, request-use audit, agent identity in task comments and notifications | Agents cannot be assignees; task/context/epic/roadmap mutations generally resolve to the credential owner's user ID or no displayed actor; there is no agent-focused assigned-work query | P0 |
| Realtime collaboration | SSE-first freshness, typed events for tasks/comments/context/meetings, safe local acknowledgement and fallback refresh | Event coverage omits epics, roadmap, Calendar, attachments, sharing, and many sub-actions; events are transport payloads rather than a readable history; actor is user-only | P0/P1 |
| Concurrent editing | Local mutation locks avoid disruptive refreshes during active edits | Writes carry no expected version or `updatedAt`; two valid editors can save stale drafts and silently overwrite one another | P0 |
| Account, settings, feedback | Correctly user-scoped and separated from project authorization | These are personal surfaces and should not receive artificial project ownership or assignment | No ownership redesign |

## Repository evidence

### Tasks are the current benchmark

`Task` stores `createdByUserId`, `updatedByUserId`, and `assigneeUserId`.
`TaskComment` separately preserves an optional agent credential and label.
Task detail renders the assignee, creator, last editor, comments, mentions, and
reactions. Notification producers cover task assignment, mentions, and due
dates.

Evidence:

- `prisma/schema.prisma` (`Task`, `TaskComment`)
- `lib/services/project-task-service.ts`
- `lib/services/project-task-comment-service.ts`
- `components/kanban/task-detail-modal.tsx`
- `lib/services/notification-service.ts`

This is a good interaction pattern, but it still needs a real actor abstraction
and durable history. `Task.assigneeUserId` excludes agents, and agent mutations
use the credential owner's `actorUserId`; only task comments retain the
credential identity explicitly.

### Meeting data has provenance fields but no accountability contract

`ProjectMeetingNote` stores creator and last-editor user IDs, but
`ProjectMeetingNoteSummary` omits both and the meeting UI does not render them.
There is no steward field. `ProjectMeetingNoteAction` stores only content,
position, and completion time.

The detail UI labels the action group "Todos for me", even though no user or
agent is assigned. The overdue reminder query sends each open action to
`ProjectMeetingNote.createdByUserId`, which makes creation an implicit and
non-transferable responsibility.

Evidence:

- `prisma/schema.prisma` (`ProjectMeetingNote`,
  `ProjectMeetingNoteAction`)
- `lib/services/project-meeting-note-service.ts`
- `components/project-meeting-notes-panel.tsx`
- `components/meeting-todos/meeting-todo-side-panel.tsx`
- `lib/services/project-notification-email-service.ts`

TASK-330 already owns todo assignment and should be strengthened rather than
duplicated. A separate note-stewardship task is still required because a
meeting owner/facilitator is not the same thing as each follow-up assignee.

### Shared knowledge and planning objects are effectively anonymous

`Resource`, `Epic`, `RoadmapPhase`, and `RoadmapEvent` have no creator, last
editor, or accountable actor relations. Some have timestamps, but their public
summary and UI either omit the time or show it without an actor. Editors can
mutate them under project-role or agent-scope checks.

Evidence:

- `prisma/schema.prisma` (`Resource`, `Epic`, `RoadmapPhase`,
  `RoadmapEvent`)
- `lib/services/context-card-service.ts`
- `lib/services/project-epic-service.ts`
- `lib/services/project-roadmap-service.ts`
- `components/project-context-panel-types.ts`
- `components/project-epic-panel.tsx`
- `components/project-roadmap-panel.tsx`

Context attachments already store `uploadedByUserId`, but
`AttachmentResponsePayload` does not expose it. The data can support
provenance, but the product currently hides it.

### Realtime events are not an audit timeline

`ProjectActivityEvent` persists an optional `actorUserId`, domain, action,
entity, payload, and timestamp. The supported domain union is limited to
project, task, task-comment, context-card, and meeting-note. The UI consumes
events to reconcile open dashboards; it does not give users a project or
artifact history.

Because the actor field is user-only, an agent request is normally represented
by the credential owner. Because some routes only touch the project's
`updatedAt`, many mutations have no typed event.

Evidence:

- `prisma/schema.prisma` (`ProjectActivityEvent`)
- `lib/project-activity-event-types.ts`
- `lib/services/project-activity-service.ts`
- `lib/project-activity-event-response.ts`
- `components/project-live-refresh.tsx`

The existing event table is a useful seed, but a product history needs
intentional retention, immutable actor identity, human-readable summaries,
redacted payload rules, deletion tombstones, pagination, and role-aware UI.

### Personal Calendar data is presented as if it were a project module

`GoogleCalendarCredential.userId` correctly makes the integration personal.
Calendar API calls use the signed-in user's token and calendar target, while a
`projectId` is used only to confirm project access. The dashboard passes the
project's `canEdit` flag into Calendar, so a project editor may mutate their
own Google Calendar while a viewer may not, even though both calendars remain
private and different.

Evidence:

- `prisma/schema.prisma` (`GoogleCalendarCredential`)
- `lib/services/calendar-service.ts`
- `components/project-calendar-panel.tsx`
- `app/projects/[projectId]/project-calendar-panel-section.tsx`

Until a project schedule exists, the module should say "My calendar" and
explain its private overlay semantics. A later shared schedule should be a
NexusDash project artifact with its own actor, owner, permissions, history, and
optional external-calendar synchronization.

### Collaboration-safe writes are missing

Shared update routes accept object IDs and new values but no expected
`updatedAt`, revision, ETag, or comparable precondition. Local edit locks only
delay incoming refreshes; they do not prevent a stale save from replacing a
teammate's newer content.

Evidence:

- task, context, meeting, epic, and roadmap update routes under
  `app/api/projects/[projectId]/`
- `components/project-live-refresh.tsx`

This is a data-loss risk, especially for long meeting notes and context cards.

## Target collaboration model

### 1. Project actors

Introduce one reusable actor representation:

- human project member
- active project agent credential

The representation needs a stable ID, kind, display label, avatar treatment,
current access state, and optional immutable display snapshot. Credential
owners remain visible for governance, but the agent credential is the actor
for work it performs.

### 2. Responsibility fields

Use responsibility only where it has product meaning:

- project: owner/steward
- task: assignee
- meeting note: meeting steward/facilitator
- meeting todo: assignee
- context card: knowledge steward
- epic: initiative lead
- roadmap phase/event: milestone owner
- personal account/settings/feedback: no project owner

Defaulting the creator as steward is reasonable, but stewardship must be
visible and reassignable.

### 3. Provenance and history

Each shared artifact should expose:

- created by and created at
- last edited by and updated at
- durable important activity, including state, assignment, ownership,
  deletion, attachment, and relationship changes
- actual agent identity when an agent acted

Not every keystroke belongs in history. Record meaningful accepted mutations.

### 4. Capabilities

Keep capability separate from responsibility:

- role or capability grants determine whether an actor may act
- ownership or assignment determines who is accountable
- following determines who is informed

TASK-331 should become the common module-capability model instead of adding
meeting- and roadmap-only exceptions.

### 5. Handoff and offboarding

Removing a member or revoking an agent must inventory active responsibility and
offer reassignment. Historical creator/actor records should remain readable
through snapshots even when access is removed.

### 6. Discovery and notifications

Accountability becomes useful only when people and agents can find it:

- My work
- owned by me
- assigned to me
- unassigned
- owned by inactive actor
- recently changed
- followed

Notification producers should follow assignment, ownership, mention, and
explicit subscription rules rather than notifying every project member.

### 7. Conflict handling

Shared edits should carry an expected revision. On conflict, preserve both
drafts and offer an understandable reload/compare/reapply recovery path. Never
discard a user's long-form meeting or context draft silently.

## Prioritized remediation

### P0: establish trustworthy collaboration

1. **TASK-337 — first-class project actors.** Preserve real human/agent
   identity for assignments and mutations.
2. **TASK-338 — project ownership continuity and offboarding.** Support safe
   transfer, departure, and responsibility reassignment.
3. **TASK-339 — conflict-safe shared editing.** Prevent silent stale-write
   overwrites.

### P1: make responsibility and history visible

4. **TASK-340 — durable collaboration history.** Turn typed activity into
   actor-attributed project and artifact timelines.
5. **TASK-330 — meeting todo assignees and completion accountability.**
6. **TASK-341 — meeting note stewardship and decision provenance.**
7. **TASK-331 — common module capability model.**
8. **TASK-348 — personal Calendar versus shared project scheduling.**

### P2: extend the model consistently

9. **TASK-342 — context knowledge stewardship and attachment provenance.**
10. **TASK-343 — epic leadership and initiative accountability.**
11. **TASK-344 — roadmap milestone ownership and execution linkage.**
12. **TASK-345 — cross-artifact discussion, mentions, and watchers.**
13. **TASK-346 — personal responsibility views and agent work queues.**
14. **TASK-347 — collaboration notification preferences and follow events.**

This order prevents each feature from inventing its own user-only owner field,
agent label, activity table, and notification rules.

## Non-goals and cautions

- Do not make every record assignable. Assignment is for expected action;
  stewardship is for ongoing accountability.
- Do not treat the project owner as the default recipient for all activity.
- Do not let assignment grant read or write access.
- Do not make external meeting guests selectable as assignees without project
  access.
- Do not expose raw activity payloads or secrets in a timeline.
- Do not use agent credential owners as a substitute for agent attribution.
- Do not add comments to every card before a reusable, notification-aware
  thread model exists.
- Do not merge users' private Google calendars to simulate a shared schedule.

## Completion signals for the refinement program

The collaboration redesign is successful when:

- every shared object communicates who is accountable
- all actionable work is either assigned or intentionally unassigned
- human and agent work is attributed to the real actor
- removed/revoked actors cannot leave invisible active responsibility behind
- users can reconstruct important changes without reading server logs
- concurrent edits cannot silently destroy a teammate's work
- people and agents can query their own responsibilities
- notifications are relevant, explain why the recipient received them, and
  deep-link to the responsible artifact
- personal integrations are clearly distinguished from shared project data
