# Changelog

Product releases use SemVer-style pre-1.0 versioning. Keep build identity
separate from product version: release entries describe `v0.x.y`, while commit
SHA, deployment URL, and workflow run belong in release evidence.

## Unreleased

- Define each release entry before the product-impacting PR is merged.
- Preview deployment keeps the shared staging schema forward-only, applies
  checked-in migrations, and rejects runtime-incompatible schemas before
  publishing the stable alias. Feature migrations must use expand/contract for
  destructive changes so concurrently testable branches remain compatible.
- Made least-privilege runtime schema/table grants explicit in migrations and
  made readiness verify access to an application table instead of only `SELECT 1`.
- Made the single-connection Calendar service select and mutate one stable
  credential row by ID instead of depending on a permanent `userId` uniqueness
  constraint, preparing a backward-compatible TASK-327 expansion.

## v0.49.0 - 2026-09-02

- Simplified meeting-note modals by presenting the steward/facilitator as an
  amber-highlighted, crowned participant/member identity instead of a separate
  metadata card.
- Moved creator, last-editor, and updated-time provenance to a quiet footer at
  the bottom of meeting-note and preparation modals.
- Refreshed TASK-356 onto current `main` and reconciled the Calendar schema and
  release history without weakening stewardship persistence or validation.

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
