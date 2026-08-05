# Changelog

Product releases use SemVer-style pre-1.0 versioning. Keep build identity
separate from product version: release entries describe `v0.x.y`, while commit
SHA, deployment URL, and workflow run belong in release evidence.

## Unreleased

- Define each release entry before the product-impacting PR is merged.

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

## v0.35.1 - 2026-08-05

- Fixed the related-task picker so the candidate list actually scrolls when
  its content overflows the visible list height, addressing GitHub issue #401.
- Kept modal pickers inside the dialog scroll-lock boundary so native mouse,
  trackpad, and touch scrolling reaches every candidate without moving the
  task modal or underlying page.
- Separated pointer hover from keyboard option activation so moving the
  pointer never calls `scrollIntoView`, while arrow, Home, and End navigation
  continue to keep the active option visible in both task flows.

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
