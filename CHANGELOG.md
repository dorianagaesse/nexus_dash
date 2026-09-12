# Changelog

Product releases use SemVer-style pre-1.0 versioning. Keep build identity
separate from product version: release entries describe `v0.x.y`, while commit
SHA, deployment URL, and workflow run belong in release evidence.

## Unreleased

- Define each release entry before the product-impacting PR is merged.

## v0.68.0 - 2026-09-13

- Added a read-only agent attention API (ND-385): an authenticated agent
  credential can list its own mention events and its current assignments —
  task comments that tagged it, tasks assigned to it, and meeting to-dos
  assigned to it — via
  `GET /api/projects/{projectId}/agent-attention/mentions` and
  `GET /api/projects/{projectId}/agent-attention/assignments`.
- Every item reports the event type, project, source artifact, a
  human-readable summary, the acting actor, the occurrence time, and the
  artifact's current state, with a stable per-artifact lookup key
  (`mention:<id>`, `assignment:task:<id>`, `assignment:meeting_todo:<id>`)
  for client-side dedup.
- Filtering covers event type, artifact type, assignment state, and a
  since/until time range; results are newest-first by default with an order
  flag and page deterministically through an opaque cursor. Assignments
  stored before provenance tracking report a null occurrence time and sort
  as oldest.
- Access requires the new least-privilege `attention:read` credential scope
  ("Attention Read" in the credential UI); the endpoints only ever read the
  calling credential's own events — no other credential id is accepted — and
  revocation or expiry blocks access immediately while project members keep
  their existing governance views.

## v0.67.0 - 2026-09-12

- Added agent mentions to task comments (ND-383). Selecting an agent in the
  comment `@` picker inserts an unambiguous `@{Credential Label}` token;
  human `@username` mention behavior is unchanged.
- Saving a comment with tagged agents records one durable mention event per
  credential, storing the mentioned credential, its label snapshot, the
  comment, the source task, the tagging actor (human or agent), and the
  occurrence time. Events are immune to credential renames, and historical
  mentions keep rendering after revocation or credential deletion.
- Agent mentions are validated server-side against the live project actor
  registry: selections must match the submitted content token exactly, and
  out-of-project, revoked, or expired credentials fail the whole submission
  without persisting anything.
- Repeated tokens or duplicate selections collapse into a single event per
  (comment, credential), and comment deletion removes its mention events
  deterministically. The new `TaskCommentAgentMention` table is protected by
  forced row-level security with member reads and same-actor
  editor/owner writes.
- Agent mentions display exactly like human mentions — brace-free, with the
  same avatar-and-name hover card — by sharing the mention chip component;
  the stored `@{Label}` token remains the wire format and is hidden in the
  display layer.

## v0.66.0 - 2026-09-12

- Active project agents (API credential identities) are now assignable to
  tasks and meeting todos from every create and edit flow (ND-384). Assignment
  persists the credential identity rather than its human owner and records who
  assigned it and when.
- Reassignment and unassignment append audit history for both tasks and
  meeting todos, preserving the previous and next actor plus the assigning
  actor, while task search matches agent labels so agent-assigned work stays
  discoverable.
- Revoked or expired credentials cannot receive new assignments. Existing
  agent-assigned work keeps its durable identity snapshot and renders with the
  amber needs-reassignment state until it is reassigned to a human or active
  agent.
- Assignment never grants additional project or API permissions, and human and
  external-participant assignment behavior is unchanged.

## v0.65.0 - 2026-09-12

- Added responsibility-aware collaborator and agent offboarding (ND-179):
  owners now review active task assignments, context-card stewardship,
  meeting-note stewardship, and open meeting-todo assignments before access is
  removed, then explicitly reassign that work to a remaining collaborator or
  leave it unassigned.
- Added atomic project ownership transfer to an accepted collaborator. The
  previous owner can remain as an editor or resolve active responsibility and
  leave in the same handoff; the database transition locks the project and
  preserves exactly one owner.
- Replaced generic removal confirmations with responsive, keyboard-accessible
  handoff dialogs that expose categorized counts, consequences, loading and
  error states, mobile-safe layouts, and clear recovery paths.
- Historical creator, editor, completer, uploader, comment-author, and audit
  attribution remains unchanged; only active assignment and stewardship fields
  are reassigned or cleared.
- Successful collaborator removal and agent revocation now refresh the open
  dashboard automatically, so task assignees, context-card and meeting-note
  stewards, and open meeting-todo assignees visibly reconcile without a manual
  page reload. Context cards now show their current steward alongside their
  preserved creator and last-editor history.

## v0.64.0 - 2026-09-12

- Added independent Inputs and Outputs zoom controls to meeting notes (ND-426),
  scaling rich-text read and edit surfaces from 75% through 200% in 25% steps
  without enlarging dialog chrome or changing stored content.
- Zoom controls expose section-specific accessible names, live percentages,
  visible focus and disabled boundary states, while preserving formatting,
  mentions, editor permissions, wrapping, and mobile viewport containment.
- Added focused component and browser coverage for zoom limits, independent
  input/output scale, rich-text integration, keyboard use, and 375px layout.

## v0.63.0 - 2026-09-09

- Added one authorized, project-scoped actor search contract for collaboration
  controls. It searches eligible humans by identity and active project-agent
  credentials by label while returning no credential secret material (ND-382).
- Supported `@` autocomplete and task-assignee controls now show active agent
  credentials alongside humans with a shared bot avatar, credential-label
  identity, and explicit Agent treatment. Agent mention and task-assignment
  actions remain visibly unavailable until ND-383 and ND-384 add their
  persistence contracts, so credentials are never submitted as human ids.
- Meeting-todo assignment now loads its selectable humans and agents from the
  same canonical actor registry. Revoked and expired credentials disappear
  from new choices while durable historical actor snapshots remain readable.
- Added service, route, and Kanban integration coverage for project isolation,
  active-credential filtering, safe response fields, and picker propagation.
## v0.62.0 - 2026-09-08

- Added a project-scoped single-task read endpoint,
  `GET /api/projects/{projectId}/tasks/{taskId}`, returning the same complete
  task shape the board-list surface exposes for session users and project
  agents with `task:read`; unknown or cross-project task ids resolve to 404
  so a task's existence is never leaked (ND-438).
- Board deep links (`?taskId=` targets and the `/tasks/{taskId}` page
  redirect) now open the task detail modal even when the target is missing
  from the initially loaded board list, by fetching the task by id through
  the new endpoint; already-loaded targets keep opening locally without a
  fetch and unresolvable ids keep the board unchanged.
- The project-agent OpenAPI contract and hosted agent docs now list the read
  operation on the task path with response typing shared with the task-list
  surface.
- Added service-level, route-level, and browser coverage for the read
  endpoint's authorization matrix and for the three deep-link behaviors.

## v0.61.0 - 2026-09-08

- Agents can now attach link attachments to existing tasks (ND-424):
  `PATCH /api/projects/{projectId}/tasks/{taskId}` accepts an optional
  `attachmentLinks` array of `{ name, url }` objects that appends new link
  attachments and preserves existing ones, mirroring the create-task
  contract; the response task includes the updated attachments list for
  immediate read-back, and bulk update operations inherit the field through
  the shared task-update schema.
- Link attachments require no new scope (the existing `task:write` update
  scope applies), invalid entries return 400 `attachment-link-invalid`,
  empty arrays append nothing, and removal stays on the dedicated
  `DELETE /tasks/{taskId}/attachments/{attachmentId}` route. Human-session
  updates use the same contract.
- The agent OpenAPI document, the hosted agent guide example, and the
  NexusDash agent guidance (`agent.md` / `CLAUDE.md`) now surface the
  add-links-to-existing-tasks capability.

## v0.60.0 - 2026-09-08

- Replaced the Kanban board's secondary sticky mobile status dock with compact
  previous/next arrows attached directly to each visible lane header (ND-427),
  removing the extra navigation layer above the app's persistent mobile nav.
- Lane arrows follow the canonical Backlog → In Progress → Blocked → Done
  sequence, expose destination-specific accessible names and disabled boundary
  states, meet the 44 px touch-target contract, and preserve keyboard focus and
  each lane's independent scroll position while switching.
- The desktop four-column Kanban layout and drag-and-drop behavior remain
  unchanged; responsive browser coverage locks portrait/landscape containment
  and hides the mobile controls at the desktop breakpoint.

## v0.59.0 - 2026-09-08

- Task titles are capped at 120 characters everywhere they are authored: the
  create and update APIs reject longer titles with a clear validation error
  and write nothing, the task forms enforce the limit with a character count
  shown near the limit, and titles exactly at the limit keep working (ND-407).
- Condensed task surfaces — kanban cards, epic linked-task lists, and
  related-task summaries — ellipsize overlong titles instead of wrapping,
  overflowing, or clipping mid-glyph, keeping at most two rendered lines on
  narrow viewports while the full title remains readable when the task is
  opened.
- Added service-level, route-level, component, and browser coverage for the
  title cap and the two-line ellipsized rendering.

## v0.58.0 - 2026-09-08

- Meeting note inputs and outputs now support rich text (ND-381): the
  Prepare/edit-prep Inputs field and the note dialog Outputs field are now the
  shared rich-text editor with formatting, emoji, links, Codex-style `*`/`-`
  list shortcuts, and project-member @mention autocomplete, and read-only
  views render the sections with full formatting and mention hover cards.
- Meeting note cards keep plain-text previews, and the in-panel search indexes
  memoized plain-text haystacks covering both note sections, so rich markup
  never leaks and searching stays fast while typing.
- Legacy plain-text notes remain readable and searchable unchanged, and are
  upgraded to rich-text HTML in place the next time their inputs or outputs
  are saved.
- Added service, helper, component, and browser coverage for round-tripping
  rich formatting, member mention rendering, and legacy note search and
  upgrade.

## v0.57.0 - 2026-09-07

- Task changes made through the agent API now carry first-class actor
  identity: every create and edit is attributed to the acting agent
  credential with a durable label snapshot, so authorship stays readable
  after later credential renames or revocations.
- Task author records identify human and agent authors consistently with task
  comments, including preserving the agent identity after an initial Kanban
  board load or page refresh.
- Consolidated project actor vocabulary, resolution, and registry building
  behind one canonical contract shared by meeting-note and context-card
  stewardship, with prior behavior and error codes preserved.
- Task-detail attribution now gives agent creators and editors the same
  dedicated robot avatar used for agent-authored comments.

## v0.56.0 - 2026-09-06

- Meeting todo assignees can now be external participants (ND-376): the
  assignee picker lists the owning meeting note's external participants
  alongside members and agents in one uniform list — no group headers or
  subtitles, with the avatar already distinguishing actor kinds — on the
  meeting-notes panel and the project-wide todos page, and picking one
  persists the assignment under the participant's display name. The option
  list scrolls when it exceeds the viewport, styled with the app-wide slim
  scrollbar.
- External participant assignees render with a muted `external` hint wherever
  assignees appear, stay assignable while their name is still a participant
  of the note, and keep their stored name with the needs-reassignment
  treatment when removed or renamed.
- Members and agents remain the canonical project assignee options (member
  participants are not duplicated in the picker), and creators, completers,
  and stewards stay restricted to humans and agents.
- Added migration, service, component, and browser coverage for external
  participant assignment, member parity, and rejection of unknown or
  non-participant names.

## v0.55.0 - 2026-09-06

- Added Codex-style Markdown list shortcuts to the task description editor
  (ND-379): typing `* ` or `- ` at the start of a paragraph converts the whole
  line into a bulleted list item on the spot, preserving inline formatting and
  mentions, while the space stays literal text when the marker is not at the
  line start or the line already lives inside a list, quote, code block, or
  heading. Native list editing continues unchanged after the conversion, and
  the undo stack restores the typed marker as a single step.

## v0.54.1 - 2026-09-06

- Matched the Kanban lane task regions and the archived Done scroller to the
  app-wide slim scrollbar styling (thin rounded thumb, transparent track, light
  and dark parity) without changing lane scrolling, keyboard focus, or
  drag-and-drop behavior.

## v0.54.0 - 2026-09-06

- Added unified Kanban task search and filters (ND-408): a single search bar
  queries the server (title, description, reference, status, labels, epic,
  assignee, comments, attachments, and related tasks) with debounced loading
  and a failure-retry state, while one Filter popover groups label chips
  (AND semantics) and epic options (OR semantics, including "No epic").
  Archived Done tasks that match the active filters surface in an open
  Archive group, and the active filter count lives on the Filter button only.
- Kanban drag-and-drop stays precise while filtering: drops map against
  visible cards only, hidden tasks keep their relative order, and reorder
  persistence behaves identically with or without filters.
- Covered the search and filter surfaces with unit, component, and browser
  tests, including filtered drag ordering, viewer read-only affordances, and
  375px/landscape/dark-mode popover containment.
- Task changes made through the agent API now carry first-class actor
  identity: every create and edit is attributed to the acting agent
  credential with a durable label snapshot, so authorship stays readable
  after later credential renames or revocations.
- Task author records now surface who acted on a task as a real actor —
  human or agent with credential label — consistent with how comment
  identity is rendered.
- Consolidated project actor vocabulary, resolution, and registry building
  behind one canonical contract shared by meeting-note and context-card
  stewardship, with prior behavior and error codes preserved.

## v0.53.0 - 2026-09-05

- Preview deployment keeps the shared staging schema forward-only, applies
  checked-in migrations, and rejects runtime-incompatible schemas before
  publishing the stable alias. Feature migrations must use expand/contract for
  destructive changes so concurrently testable branches remain compatible.
- Made least-privilege runtime schema/table grants explicit in migrations and
  made readiness verify access to an application table instead of only `SELECT 1`.
- Constrained long task comments to a consistent collapsed height with an
  explicit `Show more` / `Show less` toggle that appears only when a rendered
  comment overflows; the control is keyboard-operable with clear state text,
  and short comments stay fully visible without an unnecessary control.
- Made the single-connection Calendar service select and mutate one stable
  credential row by ID instead of depending on a permanent `userId` uniqueness
  constraint, preparing a backward-compatible TASK-327 expansion.

## v0.52.0 - 2026-09-02

- Bounded every Kanban lane to a responsive viewport-aware height with an
  independently scrollable, keyboard-focusable task region and fixed lane
  metadata and controls.
- Preserved mounted desktop and mobile lane instances so scroll positions and
  pointer or keyboard drag-and-drop behavior remain stable across task changes
  and mobile status switches.
- Added accessible region names, visible focus treatment, contained overscroll,
  stable scrollbar gutters, and regression coverage for desktop, mobile, and
  landscape layouts.
- Kept read-only task cards keyboard-operable with a visible focus ring and
  Enter/Space activation, and extended the visible focus treatment to the
  archived Done scroller.

## v0.51.0 - 2026-09-02

- Added durable creator and last-editor identity to context cards, with human
  and agent attribution (avatar and credential label) and display snapshots
  that remain readable after membership removal or credential revocation.
- Surfaced attachment-uploader provenance and explicit inactive-actor states so
  historical knowledge sources remain attributable.
- Added migration, service, route, component, and browser coverage for actor
  attribution, inactive identities, attachment attribution, and permissions.
- Context-card UI keeps provenance minimal: every card shows only `Created`
  and `Last edit` chips with timestamps, rendered as plain dark text on the
  pastel card surface so they stay legible in light and dark themes;
  stewardship assignment and the derived review signal remain persisted at the
  service boundary but are not surfaced in the card UI.

## v0.50.0 - 2026-09-02

- Simplified meeting-note modals by presenting the steward/facilitator as an
  amber-highlighted, crowned participant/member identity instead of a separate
  metadata card.
- Removed the facilitator dropdown: editors now click an eligible participant
  to assign the role and click the crowned participant again to clear it.
- Refined steward chips with a single outer border, a top-left crown, pointer
  cursor, and concise `Steward` / `Make steward` hover and focus tooltips.
- Moved creator, last-editor, and updated-time provenance to a quiet footer at
  the bottom of meeting-note and preparation modals.
- Refreshed TASK-356 onto current `main` and reconciled the Calendar schema and
  release history without weakening stewardship persistence or validation.

## v0.49.0 - 2026-09-02

- Relabeled the project dashboard Calendar section, upcoming-events stat card,
  panel skeleton, and event modal as a user-scoped "My calendar" overlay
  rather than a shared NexusDash project module.
- Decoupled connected-calendar mutations from the project editor role: a
  signed-in project member whose Google credential exposes the calendar write
  scope can now create, update, and delete events in their configured target
  calendar while looking at a project. Project access only scopes the request;
  the user's Google connection and write scope authorize the mutation.
- Dropped the `canEdit` prop from the project calendar panel, section, and
  grid/chip components so the visible "New event" and "Edit" affordances are
  reachable for any project member with a writable Google credential.
- Documented the future NexusDash-owned shared project schedule in
  `adr/task-348-shared-schedule-contract.md` (artifact model, task-337 actor
  contract, task-331 capability vocabulary, task-340 history surface, optional
  external-calendar sync). The shared schedule stays queued behind TASK-337 and
  TASK-331 so the implementation can reuse the shared actor and capability
  vocabularies instead of inventing parallel ones.
- Hardened preview Google OAuth callbacks: a pinned redirect URI is honored
  only when it matches the request origin, otherwise the callback derives from
  the current request so host-scoped OAuth state cookies stay intact.

## v0.48.0 - 2026-09-01

- Added explicit connected-account and calendar provenance to aggregated
  Calendar events and the event detail/edit surface.
- Added provider-color event accents, deterministic fallback colors, and a
  visible multi-calendar legend while retaining text labels for accessibility.
- Made read-only events open in NexusDash with source identity and an optional
  Google Calendar link without enabling mutations.

## v0.46.0 - 2026-08-31

- Made Google Calendar credential reads, refreshes, target updates, and project
  connection status fail closed for revoked credentials.
- Added a true authenticated-user disconnect that blocks local use first,
  attempts Google token revocation, permanently removes stored tokens, and
  provides a recovery warning when upstream revocation is unconfirmed.
- Required encrypted Calendar token storage whenever OAuth is configured
  outside tests and added lazy encryption for legacy plaintext local rows.
- Added an accessible Settings confirmation flow and repaired the project
  Calendar summary request by including its project authorization context.
- Expanded service, API, component, environment, and real PostgreSQL RLS
  coverage for user-owned Calendar credentials and lifecycle failures.
- Refused Preview publication when the migrated database no longer contains
  the tables required by the checked-out Prisma schema, preventing a newer
  branch's forward-only migration from silently breaking an older Preview.
- Distinguished Google token-exchange failures from credential persistence and
  database availability failures so infrastructure drift is no longer reported
  as invalid OAuth credentials or a reauthorization-required 401.

## v0.45.0 - 2026-08-31

- Agent API now supports bounded bulk task operations through
  `POST /api/projects/{projectId}/tasks/bulk` with up to 50 create, update,
  and status operations per request, sequential deterministic execution,
  and per-operation results with partial-success semantics. Bulk v1 does not
  include delete.
- Bulk create items are validated against the single-item field-type contract before coercion (deadline-invalid, epic-invalid, assignee-invalid).

## v0.44.0 - 2026-08-31

- Agent API now supports a focused single-task status transition through
  `POST /api/projects/{projectId}/tasks/{taskId}/status` with optional
  destination-column position, deterministic ordering, reorder-compatible
  `completedAt` semantics, and unarchive-on-move behavior.
- Full-board reorder stays available for bulk ordering; the OpenAPI contract
  and onboarding guidance point single-task moves at the new route.
- Cross-column moves now compact the source lane so later appends cannot collide with existing positions, and the response task carries the updated `completedAt`.

## v0.43.0 - 2026-08-31

- Agent task listing now supports server-side `epicId` and `label` query
  filters that compose with AND, with case-insensitive whole-label matching
  across legacy and JSON label storage, an empty list for unknown epics, and
  an echoed `filters` object in the response.

## v0.42.0 - 2026-08-31

- The agent OpenAPI contract now documents the complete task creation
  response: `TaskCreateResponse` includes both `taskId` and the full created
  task, and `TaskUpdateResponse` references the shared `TaskRecord` schema.
- Task create and update responses now include `completedAt`, completing the
  runtime payload alignment with `TaskRecord`.

## v0.41.0 - 2026-08-31

- The agent OpenAPI contract now documents true partial PATCH semantics for
  task updates: `TaskUpdateRequest` declares no required fields, every field
  describes its omit-vs-null behavior, and the legacy singular `label` input
  is marked deprecated in favor of `labels`.
- `null` is now the sole documented clear value for `deadlineDate`, matching
  the `epicId` and `assigneeUserId` contract pattern.

## v0.40.0 - 2026-08-31

- Agent task API responses now include a canonical `labels` string array on
  every task (list, create, and update) while keeping the legacy `label` and
  `labelsJson` fields as deprecated compatibility output.
- The OpenAPI contract documents `labels` in `TaskRecord` and
  `TaskUpdateResponse` and marks the legacy label fields deprecated.

## v0.39.0 - 2026-08-31

- Agent credential creation now offers one-click scope presets with the
  recommended non-destructive "Read + write (no delete)" preset selected by
  default, so routine agent missions no longer steer toward task deletion.
- Onboarding guidance and the hosted smoke-test example no longer grant or
  exercise `task:delete` for non-destructive task work.

## v0.38.1 - 2026-08-31

- Fixed Google Calendar events created or edited in the project dashboard
  shifting by the timezone offset: the form now submits explicit ISO instants,
  so the wall-clock time the user selects is preserved regardless of the
  server or Google Calendar timezone.

## v0.38.0 - 2026-08-30

- Added a public, unauthenticated NexusDash privacy policy with clear account,
  workspace, security, service-provider, retention, deletion, and user-choice
  disclosures.
- Documented the exact Google Calendar event scope, on-demand event processing,
  encrypted OAuth token storage, access-removal options, and compliance with
  the Google API Services User Data Policy Limited Use requirements.
- Linked the policy from the public sign-in homepage and added canonical page
  metadata plus responsive Playwright coverage.

## v0.47.0 - 2026-08-31

- Replaced the singular Google credential with user-owned Calendar connections,
  discovered sources, and one account-wide writable target while preserving
  existing encrypted tokens and target selection.
- Added multiple Google accounts, CalendarList discovery, safe add/reconnect/
  refresh/disconnect flows, source selection, and read-only enforcement.
- Aggregated selected calendars with bounded concurrency, pagination, one
  transient read retry, deterministic ordering, truncation signals, and
  per-source partial-failure warnings.
- Added source-aware project event creation and origin-locked mutations plus a
  responsive, keyboard-accessible Settings management surface.
- Expanded composite ownership constraints, forced direct-user RLS, migration,
  provider, API, UI, and real PostgreSQL isolation coverage.

## v0.38.0 - 2026-08-24

- Made Google Calendar credential reads, refreshes, target updates, and project
  connection status fail closed for revoked credentials.
- Added a true authenticated-user disconnect that blocks local use first,
  attempts Google token revocation, permanently removes stored tokens, and
  provides a recovery warning when upstream revocation is unconfirmed.
- Required encrypted Calendar token storage whenever OAuth is configured
  outside tests and added lazy encryption for legacy plaintext local rows.
- Added an accessible Settings confirmation flow and repaired the project
  Calendar summary request by including its project authorization context.
- Expanded service, API, component, environment, and real PostgreSQL RLS
  coverage for user-owned Calendar credentials and lifecycle failures.

## v0.38.0 - 2026-08-24

- Added a durable, reassignable steward/facilitator actor to every meeting note
  (human project member or active project agent credential), reusing the
  TASK-330 actor contract so removed members and revoked/expired agents render
  as `Needs reassignment` instead of orphaning the note.
- Persisted creator, last editor, and update-time provenance on every meeting
  note response, surfaced alongside the steward in the meeting notes panel and
  meeting detail view.
- New meeting notes default the steward to the note creator; unrelated edits
  preserve the steward; editors can explicitly reassign or clear it from the
  detail view and the preparation flow with accessible, keyboard-operable
  controls (44px touch target, light/dark, semantic status). Viewers see the
  steward identity without mutation affordances.
- Added URL-backed `All`, `Stewarded by me`, and `Unstewarded` responsibility
  filters for both the active and archived meeting notes lists, with accurate
  counts and useful empty states.
- Extended the project activity event stream so stewardship changes emit a
  project activity event and survive project-scoped realtime reconciliation.

## v0.37.2 - 2026-08-25

- Restored the registered stable Vercel Preview URL for GitHub and Google OAuth
  while retaining immutable deployment, revision, environment, and database
  validation before the alias can move.
- Restricted Preview callback origins to the immutable deployment and one
  explicit `PREVIEW_AUTH_ORIGIN`, rejecting arbitrary or stale aliases.
- Preserved GitHub's established `/api/auth/callback/github` path when deriving
  callbacks from the stable Preview origin.

## v0.37.1 - 2026-08-20

- Fixed Vercel Preview authentication origins so callbacks and post-auth
  redirects remain on the immutable deployment URL instead of a stale alias.
- Pinned Preview and Production runtimes and migration connections to their
  expected Supabase project refs, failing closed on cross-environment routing.
- Added branch, deployment-target, revision, environment, and database
  readiness verification before a preview URL artifact can be published.

## v0.37.0 - 2026-08-06

- Added durable creator, optional human/agent assignee, and completion-actor
  provenance to meeting todos, including display snapshots that remain readable
  after membership removal, credential revocation, or actor deletion.
- Added accessible assignment controls in meeting detail and the project Todos
  page, with URL-backed `All`, `Assigned to me`, and `Unassigned` responsibility
  views plus explicit `Needs reassignment` states for inactive actors.
- Preserved todo IDs and accountability when meeting notes are edited instead
  of deleting and recreating every follow-up action.
- Targeted overdue reminders only at active human assignees with current project
  access, avoiding implicit creator and agent-owner delivery.
- Extended the agent v1 contract so task-scoped credentials can read accountable
  meeting todos and assign, complete, reopen, or unassign one todo with the real
  credential recorded as completion actor.
- Added schema constraints, backfill migration, service/API/component tests, and
  responsive identity presentation across the meeting dialog, quick panel, and
  project-wide Todos destination.

## v0.36.0 - 2026-08-05

- Added an exact active meeting-todo count to the current project's `Todos`
  navigation item on desktop and mobile, with an orange warning treatment when
  at least one active todo is overdue.
- Added accessible count and overdue meaning without relying on color, while
  preserving the existing navigation hierarchy, route state, and touch targets.
- Added a minimal actor-authorized project summary endpoint plus live refresh
  after local todo mutations, remote meeting activity, and project changes.
- Added service, route, component, hook, and Playwright coverage for empty,
  active, overdue, mutation-refresh, viewer, and project-isolation states.
- Restored the established seven-day meeting-todo overdue grace across the
  project list, navigation badge, dashboard copy, reminder dispatcher, and
  tests while retaining one shared threshold and the precise rolling cutoff.
- Limited the navigation summary query to meetings with incomplete actions and
  returned filtered database counts instead of loading action identifiers.

## v0.35.2 - 2026-08-05

- Fixed the related-task picker so the candidate list actually scrolls when
  its content overflows the visible list height, addressing GitHub issue #401.
- Kept modal pickers inside the dialog scroll-lock boundary so native mouse,
  trackpad, and touch scrolling reaches every candidate without moving the
  task modal or underlying page.
- Separated pointer hover from keyboard option activation so moving the
  pointer never calls `scrollIntoView`, while arrow, Home, and End navigation
  continue to keep the active option visible in both task flows.

## v0.35.1 - 2026-08-05

- Reduced the meeting-todo overdue grace period from seven days to one day
  so a todo whose source meeting ended more than 24 hours ago is
  classified as overdue across the project Todos page, the dashboard
  meeting-todos summary, the TASK-354 navigation badge endpoint, and the
  notification email dispatcher.
- Aligned the dispatcher candidate query with the 24-hour rolling rule
  used by the UI by replacing the calendar-date threshold with a
  `now - grace` cutoff, and reused the shared
  `MEETING_TODO_OVERDUE_GRACE_DAYS` constant instead of duplicating it.
- Updated the user-facing reminder copy ("one day after the meeting")
  and the overdue-helper copy inside `Project meeting todos` to match
  the new grace period.
- Updated unit, service, and notification-dispatcher tests to lock in
  the new boundary at exactly 24 hours, 24 hours minus a millisecond,
  and beyond, while preserving the `done` archive exclusion and the
  completed-todo suppression rules.

## v0.35.0 - 2026-08-04

- Replaced the expanded/collapsible desktop meeting-todo popup with a compact
  bottom-right `Todos` trigger that preserves project open and overdue counts.
- Moved the aggregate into an accessible modeless panel with no blocking or
  blurred backdrop, bounded drag-from-anywhere pointer movement without a
  dedicated strip, equivalent arrow-key movement, resize re-containment, and
  reduced-motion-safe presentation while the underlying project page remains
  usable.
- Kept the panel header concise, animated opening from and dismissal back
  toward the floating `Todos` trigger, and restored the last bounded panel
  position when reopened.
- Preserved completion/reopen, overdue, viewer, and source-meeting behavior,
  retained the route-backed mobile Todos experience, and added focused
  component and browser coverage for movement and containment.

## v0.34.0 - 2026-08-03

- Kept project epic cards compact by default with title, textual status, and
  semantic progress visible while descriptions and linked tasks stay folded.
- Added an independent accessible details chevron beside each epic's edit
  action, avoiding an extra collapsed row while restoring the familiar
  one-column mobile and two-column desktop card presentation.
- Preserved complete wrapping descriptions, bounded linked-task summaries,
  theme-safe styling, and focused responsive browser coverage after expansion.

## v0.33.0 - 2026-07-31

- Redesigned related-task suggestions into scannable reference, bounded title,
  and visible status columns that remain contained at a 375 px viewport.
- Reused one shared light/dark Kanban badge palette for Backlog, In Progress,
  Blocked, and Done so picker and board status treatments stay consistent.
- Preserved full titles and status in accessible option names, retained
  keyboard/listbox behavior, and added focused component and responsive
  light/dark browser coverage.

## v0.32.0 - 2026-07-30

- Added immutable, globally unique task references rendered as `ND-<number>`,
  with sequence-backed allocation for concurrent creates and migration
  backfill for existing tasks.
- Exposed task references in read/edit task-detail headers and beside every
  related-task suggestion without revealing internal database IDs.
- Added create/edit related-task search by friendly reference plus focused
  formatter, API, component, migration, responsive browser, and stability
  coverage.

## v0.31.2 - 2026-07-30

- Removed the eight-result cap from create-task and task-detail related-task
  pickers so every eligible active project task remains available across
  Backlog, In Progress, Blocked, and Done.
- Added a viewport-aware, scroll-contained listbox with complete search,
  combobox semantics, arrow/Home/End navigation, active-option visibility,
  44 px rows, and distinct empty states.
- Added mixed-status component and Playwright regression coverage for
  selection, project isolation, archived-task exclusion, desktop overflow, and
  375 px create-flow containment.

## v0.31.1 - 2026-07-30

- Made canonical related-task links reconcile bilaterally after local saves and
  live project updates, so adding or removing a relationship is immediately
  visible from either task without a broad refresh.
- Consolidated incoming/outgoing relation serialization into one sorted,
  duplicate-safe mapping while preserving the existing canonical database row,
  archived-task visibility, and project authorization boundaries.
- Added service/API, client reconciliation, and Playwright regressions for
  bilateral add/remove behavior, repeated updates, and full reloads.

## v0.31.0 - 2026-07-27

- Replaced the obstructive mobile meeting-todo popup with a dedicated,
  protected `/projects/[projectId]/todos` destination in current-project
  navigation.
- Added access-safe project-isolated todo reads, overdue-first open work,
  recent completed work, URL-backed status views, and source meeting deep
  links.
- Preserved owner/editor completion controls and viewer read-only treatment,
  kept the project quick panel on desktop, and removed it from mobile layout
  and accessibility navigation.
- Added a contained horizontally scrollable mobile dock with separate Workspace
  and Project groups, safe-area clearance, 44 px controls, narrow-screen
  containment, and responsive Playwright coverage.

## v0.30.0 - 2026-07-26

- Replaced free-form-only meeting participant tokens with an accessible
  searchable identity picker covering current project collaborators and
  distinct external guests from previous project meetings.
- Linked NexusDash participants to live generated avatars and account metadata,
  while preserving external participants with ordered display-name snapshots
  and same-shape initials avatars.
- Made participant creation explicit through Tab, Enter, suggestion selection,
  or a visible plus action; Space and comma now remain ordinary name input and
  blur no longer commits a partial participant.
- Added a lossless legacy participant migration, project-derived RLS for the
  structured participant rows, backward-compatible API parsing, and focused
  service, route, component, helper, and responsive Playwright coverage.

## v0.29.0 - 2026-07-26

- Added a persistent in-product bug and feedback reporter: a single-line
  labeled action above the desktop sidebar identity area and a compact
  icon-only mobile-header action with a combined bug/message glyph.
- Added a responsive, accessible report sheet with bug/feedback selection,
  bounded message input, optional privacy-explained browser diagnostics,
  explicit sending, success, validation, and retry states.
- Routed verified authenticated reports through the existing NexusDash
  Resend-backed delivery service to the fixed owner inbox, with server-resolved
  reporter identity, safe page/version context, escaped email content,
  delivery observability, and per-account throttling.
- Added service, API, template, component, shell, and Playwright coverage for
  validation, placement, responsive containment, privacy controls, delivery,
  and failure recovery.

## v0.28.0 - 2026-07-26

- Added a subtle `Alpha` product-state label to the persistent desktop and
  compact-mobile NexusDash wordmarks.
- Included the alpha state in the brand links' accessible names and kept the
  disclosure text-based, token-driven, and non-interactive.
- Added focused component and responsive browser coverage for desktop/mobile
  presence, accessible naming, and compact-header containment.

## v0.27.0 - 2026-07-23

- Unified Account, Settings, and Notifications behind one shared responsive
  user hub with route-backed navigation, semantic current state, live unread
  badges, and preserved project return context.
- Kept explicit Account, Settings, and Notifications actions in an avatar menu
  aligned to the desktop identity card, with a separated logout action.
- Restored the compact one-click theme control to the desktop user-info card,
  retained it in the mobile header, and moved app version plus the GitHub
  repository link into an About section in Settings.
- Added accessible loading/error states, 44 px account-surface controls,
  keyboard menu and hub navigation coverage, and light/dark responsive
  Playwright walkthroughs at 375, 768, 1024, and 1440 px.

## v0.26.0 - 2026-07-16

- Redesigned the unauthenticated entry page around product outcomes with a
  focused desktop product/auth split and an auth-first mobile layout.
- Reduced the 390 px sign-up path from 1,993 px to 1,119 px while preserving
  credentials, social providers, recovery, validation, and safe return paths.
- Added 48 px authentication controls, clearer status and focus treatment,
  deterministic reduced-motion behavior, and responsive Playwright coverage.
- Made project-scoped API agent access the lead capability, replaced generic
  example work with the connected NexusDash context/planning/delivery/meeting
  workflow, and unified the desktop split with motion-safe ambient gradients.

## v0.25.0 - 2026-07-06

- Added a responsive authenticated app shell with Projects and Inbox as visible
  workspace destinations, Account and Settings retained in the avatar menu,
  semantic current-location state, an adaptive desktop sidebar, and a
  touch-sized mobile bottom dock.
- Preserved normalized project/task and notification-list origins through
  account detours and notification targets, including query and hash state,
  with safe direct-entry fallbacks and no external redirects.
- Moved repository/version diagnostics into the account utility, established a
  shared shell/menu/toast/dialog layer map, and added focused component and
  Playwright coverage for keyboard, responsive, dark-mode, and round-trip
  navigation behavior.

## v0.24.0 - 2026-07-05

- Added a shared accessible dialog and responsive-sheet foundation with named
  modal semantics, focus containment/restoration, background isolation,
  guarded Escape behavior, and reduced-motion support.
- Migrated task, context, attachment, calendar, project-settings,
  confirmation, meeting, roadmap, and project-creation overlays without
  redesigning their content.
- Added component and Playwright coverage for keyboard focus, nested controls,
  desktop dialog behavior, and internally scrollable 390 px sheets.

## v0.23.1 - 2026-06-27

- Fixed project dashboards so already-open pages refresh after an invited
  member accepts a project invitation.
- Added a membership-specific project activity marker touch that validates the
  accepted invite and resulting membership without relaxing editor-only content
  activity rules.
- Added regression coverage for viewer invitation acceptance advancing the
  project refresh marker.

## v0.23.0 - 2026-06-25

- Added a compact collaborator presence block to project dashboards so members
  can see who has access from the project header.
- Reused generated user avatars and existing viewer-or-higher collaborator
  identity data, keeping owner-only sharing management unchanged.
- Improved project-title wrapping on narrow screens so long project names stay
  contained beside the new presence affordance.

## v0.22.0 - 2026-06-25

- Added durable in-app reminders for meeting-note todos that remain open seven
  or more days after the meeting date.
- Queued overdue meeting todo reminders through the existing notification email
  dispatcher so email delivery, skipped mode, grouping, and delivery logging use
  the shared project digest path.
- Added dispatcher summary, workflow-summary, runbook, and service coverage for
  meeting-todo reminder eligibility, idempotency, and digest rendering.

## v0.21.0 - 2026-06-21

- Added a responsive project-wide floating Meeting Todos card with overdue-first
  sorting, minimal source-meeting context, direct meeting-note navigation, and a
  reducible compact state.
- Added atomic todo completion and reopening for owners/editors while keeping
  viewer access read-only; reopening an archived todo reactivates its meeting.
- Added service, route, aggregation, permission, and Playwright coverage for
  project-wide meeting follow-up workflows.

## v0.20.0 - 2026-06-19

- Added a machine-checked RLS inventory that classifies every Prisma model and
  blocks unclassified schema additions.
- Extended forced PostgreSQL RLS to task comment reactions and project agent
  credential, scope-grant, and audit records, with a narrow pre-authentication
  credential lookup for raw-key exchange.
- Added a CI tenant-isolation matrix that provisions a non-superuser
  `NOBYPASSRLS` role and verifies cross-project CRUD denial, role differences,
  revoked membership, child rows, and agent credential visibility.

## v0.19.2 - 2026-06-19

- Restored the green production dependency-security audit by updating the
  Prisma development-tooling Hono override to a patched release.
- Refreshed patchable development-tooling transitive dependencies so the full
  npm audit also reports zero vulnerabilities.
- Preserved Prisma 7.8 and the Node 20.19 runtime baseline while documenting
  that the affected Hono packages are confined to Prisma CLI tooling and are
  not imported by the deployed NexusDash request runtime.

## v0.19.1 - 2026-06-18

- Prefetched project agent credentials when the settings modal opens so the
  Agent access tab no longer waits to begin its first load.
- Added an explicit initial credential loading state and contained long
  credential IDs, audit request paths, project IDs, and quickstart values
  within the settings modal.

## v0.19.0 - 2026-06-08

- Added a project-scoped Meeting Notes workspace with structured preparation
  inputs, task-style labels, explicit label filtering, participants,
  after-meeting outputs, personal todos, and overdue todo highlighting.
- Added searchable meeting-note history on the project dashboard so previous
  discussions can be found by title, participant, label, notes, or todos, with
  done notes shown in a separate archived list.
- Added meeting-note persistence, RLS-protected project APIs, dashboard stats,
  and Playwright coverage for the core meeting-notes workflow.

## v0.18.0 - 2026-06-08

- Corrected the app product version after auditing the merge history from
  TASK-132/#270 (`v0.2.0`) through TASK-313/#329.
- Backfilled the branch-based SemVer policy across shipped non-doc feature
  work so the current app version reflects the product capabilities already
  delivered instead of only the version-governance PR.
- Recorded the reconciliation basis in
  `docs/releases/version-reconciliation-2026-06-08.md`.

## v0.3.0 - 2026-06-06

- Added product version governance so feature branches bump minor versions,
  release-impacting fix/refactor/chore branches bump patch versions, and
  commit/build details remain diagnostic metadata instead of visible product
  version components.
- Added a CI guard that validates package version consistency, branch-based
  SemVer bumps, and matching changelog entries for production-bound PRs.
- Improved the release helper with branch-type aliases such as `feature`,
  `fix`, `refactor`, and `chore`.

## v0.2.0 - 2026-05-20

- Made `package.json` the canonical product-version source.
- Changed the app metadata pill to show a clean product version instead of
  appending commit SHA build metadata to the visible label.
- Kept commit SHA, runtime environment, and repository URL as diagnostic
  deployment metadata.
- Updated Vercel deploy workflows to inject `APP_VERSION`, `APP_ENV`,
  `COMMIT_SHA`, and `APP_REPOSITORY_URL` from the checked-out ref.
