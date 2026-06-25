# Development Journal

This file is a concise execution log.
Use it for important implementation milestones, blockers, validation runs, and release evidence.

# 2026-06-25 - TASK-314 meeting todo overdue reminders started

- Summary: Removed clean local task worktrees for TASK-316, TASK-318, and
  TASK-319, leaving only the main checkout. Started
  `feature/task-314-meeting-todo-overdue-reminders` from refreshed
  `origin/main` and drafted `tasks/current.md` around TASK-314.
- Grounding: Reviewed `agent.md`, `project.md`, `CLAUDE.md`, `README.md`, the
  TASK-314 brief, current/backlog context, notification email dispatch runbook,
  existing task due-date reminder reconciliation, notification metadata, and the
  meeting-note action model.
- Decision: Keep TASK-314 focused on durable in-app/email reminders through the
  existing notification dispatcher. Treat per-action reminder persistence as the
  primary implementation design question before coding begins.

# 2026-06-25 - TASK-314 meeting todo overdue reminders implemented

- Summary: Added overdue meeting-todo reminder reconciliation to the existing
  protected notification email dispatcher. Incomplete meeting-note actions now
  become eligible seven local calendar days after the meeting date, only for the
  meeting-note creator while they still have project access and verified email.
  The dispatcher creates durable `meeting_todo_overdue_reminder` notifications,
  queues them through the shared project digest path, renders concise digest
  items, exposes a `meetingTodoOverdueRemindersReconciled` summary count, and
  surfaces that count in the scheduler workflow summary.
- Decision: No new reminder-state table was added. The existing
  `Notification` uniqueness key plus pending/dispatching/sent email item
  coverage provides the durable idempotency record for
  `<actionId>:<recipientUserId>:<scheduledDate>`, matching the task due-date
  reminder pattern while keeping the schema unchanged.
- Documentation: Extended the notification email dispatch runbook with
  meeting-todo eligibility, idempotency, and smoke validation guidance.
- Validation: Focused notification tests passed (47 tests). `npm run lint`,
  `npm run rls:check`, `npm run release:check -- --base origin/main --branch
  feature/task-314-meeting-todo-overdue-reminders`, full `npm test` with local
  database env (124 files passed, 2 skipped; 922 tests passed, 2 skipped),
  `npm run test:coverage` (91.37% statements, 81.33% branches, 92.2%
  functions, 91.88% lines), `git diff --check`, and `npm run build` with
  local-safe placeholder secrets passed. An initial bare `npm test` failed
  before assertions because `DATABASE_URL` was not set in the shell; rerunning
  with local-safe `DATABASE_URL`/`DIRECT_URL` passed.
- Review/preview follow-up: Copilot flagged stale `tasks/current.md` status and
  brittle `$queryRaw.mock.calls[index]` assertions; updated the task status and
  switched SQL assertions to query-signature lookup. Branch preview workflow run
  `28134979130` deployed
  `https://nexus-dash-q9kwqqxs3-dorian-agaesses-projects.vercel.app` from
  explicit `git_ref=feature/task-314-meeting-todo-overdue-reminders`, with logs
  confirming checkout of commit `c6dae7fe5104f6fcb0ee9dc50802ba878e0a154f`.
  A preview notification-dispatch smoke attempt, run `28135234472`, failed
  safely with `503 notification-email-dispatch-secret-missing` before
  dispatching work; fixed the deploy workflow to pass
  `NOTIFICATION_EMAIL_DISPATCH_SECRET` into preview deployments.

# 2026-06-19 - TASK-319 Prisma tooling advisory remediation

- Summary: Restored clean production and full npm audits without changing the
  Prisma 7.8 line. Updated the Prisma development-tooling Hono override from
  4.12.23 to 4.12.26, retained `@hono/node-server` 1.19.14 because removing it
  restores `GHSA-92pp-h63x-v22m`, and refreshed compatible lockfile transitives
  (`js-yaml` 4.2.0, `undici` 7.28.0, Vite 8.0.16).
- Decision: Rejected an `@prisma/dev` 0.24.14 override because replacing
  Prisma's pinned internal package would update several unrelated local-tooling
  dependencies when a one-package Hono patch is sufficient. The current
  0.24.3 subtree already includes an `@prisma/streams-local` package with a
  declared Node 22 engine, so that declaration was not treated as a new
  0.24.14 constraint. The Hono path remains confined to Prisma CLI tooling; no
  NexusDash runtime source imports Hono or exposes the Prisma development
  server.
- Validation: Clean `npm ci` and postinstall Prisma generation passed.
  `npm run security:audit`, moderate-threshold production audit, and
  `npm run security:audit:full` all reported zero vulnerabilities.
  `npx prisma --version`, `npx prisma generate`, `npx prisma validate`,
  release-policy validation for `v0.19.2`, `git diff --check`, `npm run lint`,
  `npm test` (122 files passed, 2 skipped; 906 tests passed, 2 skipped),
  `npm run test:coverage` (91.37% statements, 81.33% branches, 92.2%
  functions, 91.88% lines), and the preview-style production build passed.
- Local database note: Docker Desktop's Linux engine returned HTTP 500 and
  localhost PostgreSQL ports 5432/5433 were unavailable. The local E2E command
  built successfully, then all nine specs stopped during database setup.
  GitHub Quality Gates run `27850400507` subsequently passed Prisma migration
  deployment, all nine Playwright specs, Quality Core, and the container image
  build.
- Review: Copilot generated one documentation comment about the
  `@prisma/dev` 0.24.14 rejection rationale. Rephrased the decision to separate
  the pre-existing Node engine declaration from the actual concern: expanding
  the override scope and tooling delta beyond the narrow Hono remediation.

# 2026-06-19 - Post-TASK-088 repository and backlog reset

- Merged PR #341 and closed TASK-088 as complete.
- Removed 30 obsolete secondary Git worktrees after matching their branches to
  merged or superseded pull requests. The sole dirty worktree contained only an
  obsolete staged TASK-088 planning brief superseded by PR #341.
- Returned the primary checkout to an up-to-date `main`.
- Reconciled stale backlog states for TASK-317 and TASK-098 after PRs #332 and
  #331 merged.
- Set the next execution queue to TASK-319, TASK-318, TASK-316, TASK-314, and
  TASK-119, balancing bounded security/architecture work with immediate
  user-facing collaboration features.

# 2026-06-19 - TASK-088 architecture audit correction

- Summary: Replaced the draft TASK-088 audit with an evidence-backed review of
  application boundaries, authentication, authorization, tenancy, persistence,
  storage, deployment, scheduling, caching, observability, and CI.
- Decision: Continue normal feature delivery. No broad refactor or project-wide
  pause is justified by the repository evidence.
- Follow-up: Added TASK-318 as a high-priority, bounded guardrail for complete
  RLS model classification and real least-privilege tenant-isolation testing.
  Added TASK-319 after the repository security audit exposed current
  high-severity Hono advisories in Prisma's dev-tooling chain. Existing TASK-063
  and TASK-064 continue to own background-work extraction and general API rate
  limiting.
- Report: `tasks/task-088-architecture-audit.md`
- Brief: `tasks/task-318-rls-coverage-tenant-isolation-guardrail.md`
- Brief: `tasks/task-319-prisma-tooling-dependency-advisory-remediation.md`
- Validation: `git diff --check`, backlog task-ID uniqueness, route/Prisma
  boundary scan, `npm run lint`, `npm test` (122 test files passed, 2 skipped;
  906 tests passed, 2 skipped), `npm run test:coverage` (91.37% statements,
  81.33% branches, 92.2% functions, 91.88% lines), production build, and
  release-policy check passed.
- Security validation: `npm run security:audit` reported the Prisma
  dev-tooling Hono advisory now tracked by TASK-319. The dependency tree marks
  the affected chain dev-optional; no NexusDash runtime import was found.
- E2E note: local Playwright validation could not start because Docker Desktop
  was not running and the PostgreSQL test service was unavailable. The remote
  PR Quality Gates remain responsible for the PostgreSQL-backed E2E run.
- GitHub: PR #341 replaces the diverged Copilot draft PR #334.

# 2026-06-18 - TASK-317 agent access settings remediation

- Summary: Started GitHub issue #312 as TASK-314, then renumbered it to
  TASK-317 after merged PR #331 independently assigned TASK-314 to meeting-todo
  overdue reminders. Project settings now starts the agent-access summary
  request as soon as the modal opens, presents an explicit initial credential
  loading state, and contains long IDs, paths, and env values within the modal.
- Scope: Credential lifecycle, scopes, authorization, and audit semantics are
  unchanged.
- Validation after rebasing onto PR #333 and PR #331: focused agent-access and
  app-metadata tests passed (3 files / 11 tests), `npm run lint` passed, the
  full unit/API suite passed (122 files passed, 2 skipped; 906 tests passed,
  2 skipped), coverage passed at 91.37% statements / 81.33% branches / 92.2%
  functions / 91.88% lines, `npm run build` passed, and
  `npm run release:check -- --base origin/main --branch
  fix/task-317-agent-access-settings` passed for `v0.19.1`.
- Local E2E note: `npm run test:e2e` built successfully but all browser specs
  were blocked before app interaction because PostgreSQL was unavailable at
  `127.0.0.1:5432`; Docker Desktop was not running. GitHub E2E subsequently
  passed with its PostgreSQL service.
- Preview validation: Workflow run `27725759573` used the original
  `git_ref=fix/task-314-agent-access-settings`; logs confirmed checkout of that
  branch. The preview URL was
  `https://nexus-dash-7bk6fxnb8-dorian-agaesses-projects.vercel.app`.
- Browser evidence: At a 1280x900 viewport, a fresh settings/Agent access open
  showed `Loading credentials...` within 79.8 ms. The deployed agent-access
  request measured about 2171 ms and had already completed before the tab was
  selected in the prefetch check. A credential with a deliberately long label,
  the long raw-key/quickstart values, and the internally scrollable quickstart
  block left both page and body `scrollWidth` at 1280 px, with no modal/page
  horizontal overflow. Credential create, rotate, and revoke succeeded; the
  revoked state disabled rotation. The disposable validation project and its
  credential were deleted afterward.
- GitHub evidence: PR #332 passed branch-name, Quality Core, E2E Smoke, and
  Container Image checks before rebasing. Copilot's only finding concerned the
  June 18 date relative to GitHub's June 17 UTC timestamp; the date is correct
  in the repository operator's Europe/Paris timezone.

# 2026-06-18 - TASK-315 protected preview agent diagnostics

- Summary: Reconciled GitHub issue #313 with the confirmed reproduction: the
  active credential was valid, while Vercel deployment protection returned an
  HTML `401 Authentication Required` response before NexusDash received the
  direct request.
- Decision: Added a dedicated diagnostic runbook that separates Vercel preview
  access from NexusDash key validation, documents `ApiKey` for raw-key exchange
  versus `Bearer` for returned access tokens, and defines secret-safe response,
  audit, rotation, and revocation evidence.
- Validation: Confirmed the documented command shape against Vercel CLI
  `54.14.2` help, verified runbook links and authentication wording with `rg`,
  passed `git diff --check`, and passed
  `npm run release:check -- --base origin/main --branch
  docs/task-315-protected-preview-agent-diagnostics` with no product version
  bump required.
- GitHub evidence: PR #333 passed branch-name, Quality Core, E2E Smoke, and
  Container Image checks. Copilot reviewed all changed files and produced no
  comments or unresolved threads.

# 2026-06-08 - Version history reconciliation

- Summary: Audited merged PR history from TASK-132/#270 (`v0.2.0`) through
  TASK-313/#329 and corrected the current app version to `v0.18.0`.
- Decision: Count non-doc `feature/*` PRs as minor releases, count
  release-impacting `fix/*` PRs as patch releases until the next minor, and
  ignore docs-only/task-tracking/dependency/investigation-report PRs. Commit
  count remains diagnostic metadata and does not influence SemVer.
- Evidence: Added `docs/releases/version-reconciliation-2026-06-08.md` with
  the PR-by-PR release path.

# 2026-06-06 - TASK-313 app version governance implemented

- Summary: Implemented branch-based product version governance. `feature/*`
  PRs now require a minor bump/reset patch, release-impacting `fix/*`,
  `refactor/*`, and `chore/*` PRs require patch bumps, and docs/dependabot/
  task-tracking work can hold steady unless explicitly released. Commit count
  remains diagnostic/build metadata, not part of the visible SemVer product
  version.
- Evidence: Added `npm run release:check`, CI guard wiring in Quality Core,
  release helper branch-type aliases, guard tests, changelog enforcement, and
  bumped the product version from `0.2.0` to `0.3.0` for this feature PR.
- Validation: `npm run release:check -- --base origin/main --branch
  feature/task-313-version-governance`, focused Vitest for metadata/version
  guard tests, `npm run release:version -- feature --dry-run`, `npm run lint`,
  CI-shaped `npm test`, CI-shaped `npm run test:coverage`, and full-env
  `npm run build` passed. Local full test initially exposed a stale generated
  Prisma Client missing roadmap enum values; `npx prisma generate` restored the
  expected local generated client before the green run.
- PR: Opened PR #329, fixed Copilot's changelog-enforcement gap for
  non-production-bound version bumps, resolved the review thread, and verified
  GitHub checks passed: branch name, Quality Core, E2E Smoke, and Container
  Image.

# 2026-06-06 - TASK-313 app version governance created

- Summary: Created TASK-313 after reviewing the existing versioning history:
  TASK-087 exposed the running version, TASK-272 defined a release-version
  policy/helper, and TASK-132 made `package.json` the canonical product version
  at `0.2.0`.
- Decision: Treat the current stagnant `v0.2.0` as a release-governance gap.
  The follow-up task should align NexusDash with SemVer-oriented product
  releases, keep commit/build metadata separate from the product version, and
  add automation/guards so production releases cannot silently ship forever
  under the same version.

# 2026-06-06 - TASK-224 agent roadmap access started

- Summary: Started TASK-224 on
  `feature/task-224-agent-roadmap-access`, moved TASK-263 to completed after PR
  #320 merged, and drafted the active task brief.
- Decision: Add dedicated `roadmap:read`, `roadmap:write`, and
  `roadmap:delete` scopes instead of folding roadmap access into task scopes.
  Roadmap routes will use the same `requireApiPrincipal` and
  `AgentProjectAccessContext` pattern as task/context agent APIs, while
  roadmap services remain the authorization boundary.

# 2026-06-06 - TASK-224 agent roadmap access implemented

- Summary: Added dedicated roadmap credential scopes, Prisma enum migration,
  runtime scope mappings, agent-aware roadmap route handlers, service-level
  scope enforcement, hosted onboarding copy, and OpenAPI schemas/paths for
  roadmap phases, events, reorder, move, and delete operations.
- Evidence: Focused Vitest passed 8 files / 40 tests. `npm run lint`, local
  validation env `npm test`, local validation env `npm run test:coverage`, and
  local validation env `npm run build` passed. `npm run db:migrate` applied all
  migrations, including `20260606090000_task224_agent_roadmap_scopes`, against
  a fresh local PostgreSQL on host port 5433.

# 2026-06-06 - TASK-224 PR merged

- Summary: Merged TASK-224 through PR #326 after handling Copilot's five
  test-contract comments about the `forbidden` agent-scope error.
- Evidence: PR #326 merged as
  `3d497c77a790a14e32c9cb20a85349d2e448239e`; follow-up review fix
  `f1f800c41498966acadd55940906acb1b99a2677`; GitHub checks passed:
  `check-name`, `Quality Core (lint, test, coverage, build)`, `E2E Smoke
  (Playwright)`, and `Container Image (build + metadata artifact)`.

# 2026-06-04 - TASK-263 realtime notification updates started

- Summary: Drafted the implementation brief for live in-app notification
  updates after inspecting notification services, account menu count rendering,
  awareness banner rendering, notification center list behavior, and the
  existing project activity SSE transport.
- Decision: Reuse the SSE-first realtime pattern for an authenticated
  account-scoped notification snapshot stream. `Notification` remains the
  source of truth; the stream publishes compact unread/version/latest-title
  state and the notification center refetches full rows when that version
  changes. Email digest batching remains separate.

# 2026-06-04 - TASK-263 account notification realtime implemented

- Summary: Implemented account-scoped live notification snapshots with SSE-first
  transport and polling fallback. Account menu badges, account notification
  links, awareness banners, and the notification center now consume live
  snapshots; the notification center refetches full rows when the snapshot
  version changes.
- Evidence: Added `/api/account/notifications/summary` and
  `/api/account/notifications/stream`, `NotificationLiveUpdates`, shared
  notification realtime client state, and service snapshot support. Focused
  notification tests passed 7 files / 41 tests. `npm run lint`, local
  PostgreSQL env `npm test`, local PostgreSQL env `npm run test:coverage`,
  local-safe `npm run build`, and local-safe `npm run test:e2e` passed. The
  first E2E run exposed that `networkidle` waits are incompatible with the new
  persistent account SSE connection; the projects helper now waits for visible
  UI readiness instead.

# 2026-06-04 - TASK-263 PR opened for maintainer review

- Summary: Opened ready PR #320 from
  `feature/task-263-live-notification-updates` and intentionally left it
  unmerged for maintainer review.
- Evidence: PR checks passed: `check-name`, `Quality Core (lint, test,
  coverage, build)`, `E2E Smoke (Playwright)`, and `Container Image (build +
  metadata artifact)`.

# 2026-06-04 - TASK-263 Copilot review handled

- Summary: Addressed all four Copilot comments by adding no-store headers to
  summary-route error responses, introducing a request-scoped cached server
  helper for initial notification snapshots, reusing that helper across chrome
  and notification-aware pages/layouts, and restoring `Link` navigation in the
  awareness banner.
- Evidence: Focused notification tests passed 7 files / 42 tests. `npm run
  lint`, local PostgreSQL env `npm test` (118 files passed, 2 skipped; 880 tests
  passed, 2 skipped), local PostgreSQL env `npm run test:coverage`, and
  local-safe `npm run test:e2e` passed 8/8 Playwright specs.

# 2026-06-04 - TASK-312 hidden project refresh reconciliation

- Summary: Removed the user-facing project refresh prompt/button while keeping
  the internal pending-refresh safety path for edit locks and hidden tabs.
- Evidence: `ProjectLiveRefresh` now renders no UI for pending versions. Focused
  component coverage was updated so locked remote updates stay invisible and
  still auto-refresh once the lock clears. `npm test -- --run
  tests/components/project-live-refresh.test.tsx`, `npm run lint`, local
  PostgreSQL env `npm test`, local PostgreSQL env `npm run test:coverage`, and
  local-safe `npm run build` passed. Local-safe `npm run test:e2e` passed 8/8
  specs after adding the expected local auth origin env. TASK-311 was moved to
  completed after PR #318 merged.

# 2026-05-31 - TASK-275 performance investigation completed

- Summary: Completed the app action-latency investigation and scoped TASK-276
  remediation around immediate local feedback, bounded refresh work, and
  before/after preview validation.
- Evidence: Added `docs/reports/task-275-performance-investigation.md`. Local
  Docker Postgres service probe showed core task/comment/context mutations in
  the 15-30 ms range, while full-board reorder took 113.9 ms for a 41-task
  board. Protected preview API probing via `vercel curl` exchanged the new
  credential successfully and measured task create at 2442.1 ms, task update at
  2152.4 ms, task list at 1776-1898 ms, and full-board reorder at 1551.3 ms on a
  warm repeat. Local Playwright timing against `next start` showed task creation
  at 4696.2 ms from submit to visible card, despite direct service creation
  measuring 22.1 ms. Code review found common flows gated by server
  confirmation plus broad `router.refresh()` calls; task creation, comments,
  task edits, context-card mutations, and project Server Actions all rely on
  refresh/navigation for visible completion. After Vercel deployment protection
  was disabled, direct preview API timings remained seconds-level: task create
  p50 2316.9 ms, task update p50 2029.4 ms, task list p50 1603.6 ms, and reorder
  p50 1109.2 ms. The earlier direct 401 was Vercel protection, not the app
  credential.

# 2026-05-31 - TASK-275/TASK-276 performance task split

- Summary: Split app performance work into investigation and implementation so
  remediation can be evidence-led while still targeting durable production-grade
  fixes for several-second action latency.
- Evidence: Promoted TASK-275 to the top of the execution queue as the
  measurement/root-cause investigation, created TASK-276 for implementation,
  updated `tasks/current.md` for TASK-275, and created
  `feature/task-275-performance-investigation` from current `origin/main`.

# 2026-05-31 - Backlog cleanup after TASK-307 merge

- Summary: Refreshed task tracking after the latest merged PRs so the backlog no
  longer lists completed work as active or deferred.
- Evidence: Moved TASK-307 to Completed after PR #309, updated TASK-306 as
  merged via PR #307, moved TASK-118 to Completed after PR #305, reset
  `tasks/current.md` to no active implementation task, and recorded TASK-307
  post-merge preview smoke evidence in its task brief.

# 2026-05-31 - TASK-307 agent comment credential identity

- Created TASK-307 to track dedicated agent credential presentation for task
  comments: display the credential label with ` (agent)` and use one shared
  robot-head-like avatar for all agent-authored comments.
- Added a task brief covering current behavior, scope, acceptance criteria,
  definition of done, and implementation notes around preserving the existing
  owner-principal authorization model while adding comment author metadata.
- Drafted `tasks/current.md` around TASK-307 after investigating the task
  comment service, comments API route, Prisma `TaskComment` model, task detail
  comment rendering, and existing agent-aware notification attribution. The
  selected implementation approach is to keep `authorUserId` as the owner/RLS
  actor while adding durable nullable agent credential id and label snapshot
  metadata to comments.
- Implemented TASK-307 locally by adding nullable `TaskComment` agent credential
  metadata, storing a label snapshot on agent-created comments, returning
  agent-aware comment authors through the comments API, rendering agent comments
  with a shared local robot-head-like avatar, and updating the agent OpenAPI
  schema/notes.
- Focused validation passed: `npx prisma generate`, `npx prisma validate`,
  task comment route tests, task detail comment rendering tests, agent
  onboarding docs tests, and `npm run lint`.
- Full local validation passed for `npm test`, `npm run test:coverage`, and
  `npm run build` with documented local DB env plus placeholder build-only
  secrets. Local `npm run test:e2e` rebuilt successfully but failed before app
  interaction because localhost PostgreSQL ports 5432/5433 were not reachable;
  `npx prisma migrate deploy` against the same env failed with a schema engine
  connection error.
- Superseded docs-branch PR #308 was closed after the implementation was moved
  onto `feature/task-307-agent-comment-identity`; PR #309 merged the feature on
  2026-05-31 after Quality Gates and Copilot review completed.

# 2026-05-31 - TASK-306 task comment mention cursor spacing

- Started TASK-306 from GitHub issue #306 on
  `fix/task-306-mention-cursor-spacing`.
- Read `agent.md`, `project.md`, `README.md`, and the issue body. The task
  requires a matching backlog/current task entry, a focused fix branch, ready PR,
  Copilot follow-up, branch-ref Vercel preview deploy, and Playwright validation
  against the preview URL.
- Initial investigation points to the task comment composer's transparent
  textarea mirror: the visible mention highlight uses chip padding and medium
  font weight while the actual caret is owned by the transparent textarea's
  plain text. That layout mismatch explains why text after a selected mention
  appears offset and the caret cannot visually reach the end.
- Implemented a textarea-mirror-specific mention highlight class that removes
  layout-affecting padding, inline-block display, and font-weight changes while
  preserving mention highlighting. The read-only mention chip styling remains
  unchanged.
- Extended the Playwright smoke task lifecycle flow to select a comment mention,
  type after it, assert the textarea value/caret end position, submit the
  comment, and verify a `task_comment_mention` notification row for the
  mentioned project member.
- Validation passed: `git diff --check`, `npm run lint`, focused mention/comment
  tests, full `npm test` with documented DB env, full `npm run test:coverage`
  with documented DB env, and `npm run build` with documented DB env plus
  placeholder production-only secrets.
- Local E2E bootstrap is blocked because Docker Desktop is unavailable:
  `npm run db:local:up` cannot connect to the `dockerDesktopLinuxEngine` pipe.
- PR #307 E2E initially failed because the smoke test typed immediately after
  clicking the autocomplete result, before the deferred animation-frame caret
  restoration completed. Tightened the component by imperatively syncing the
  textarea value and selection during mention selection, while keeping the
  animation-frame selection pass as a stabilization step.
- The next E2E run showed the stabilization frame could still jump the caret
  after the first characters were typed. Guarded the frame callback so it only
  restores selection when the textarea still contains the untouched replacement
  value.
- The follow-up E2E run passed the caret/value assertion and only failed on a
  strict-mode locator because the same mention appeared in the task description,
  card preview, and submitted comment. Scoped the rendered mention assertion to
  the submitted comment article.
- The next E2E run reached a stale test variable after reopening the task; the
  assertion now checks the comment suffix used by the mention comment flow.
- PR #307 checks are green on head
  `987f1fe26f6e5311346801615b8d76f723063914`: branch-name, Quality Core, E2E
  Smoke, and Container Image all passed.
- Copilot review completed with one actionable stale-variable comment. The
  thread was resolved after the current PR diff and green checks confirmed the
  assertion now uses `taskCommentSuffix`.
- Preview workflow run `26697364465` was dispatched with
  `action=deploy-preview` and
  `git_ref=fix/task-306-mention-cursor-spacing`. Logs show checkout of
  `refs/remotes/origin/fix/task-306-mention-cursor-spacing` and deployed commit
  `987f1fe26f6e5311346801615b8d76f723063914`; artifact URL:
  `https://nexus-dash-as20alnt0-dorian-agaesses-projects.vercel.app`.
- Playwright request validation against that preview passed using
  `tmp/project-access-cred.env`: health, agent token exchange, temporary task
  create, task comment create with `@dorianagaesse`, comment list verification,
  and cleanup verification with no `task306-preview-mention-*` tasks remaining.

## Entry Format

- `Date`
- `Type`: `Execution` | `Planning` | `Validation` | `Governance` | `Blocker`
- `Summary`
- `Evidence`: commands, PR number, preview URL, or impacted files

## Recent Entries (Most Relevant)

### 2026-05-30
- Type: Planning
- Summary: Started TASK-118 realtime collaboration implementation.
- Evidence: Created `feature/task-118-realtime-collaboration` from
  `origin/main`; replaced `tasks/current.md` with a TASK-118 execution brief;
  investigated project dashboard server/client data flow and existing
  `router.refresh()`-only mutation paths in Kanban, context cards, epics, and
  roadmap panels; selected project activity version polling on the current
  Prisma/PostgreSQL stack and recorded the decision in `adr/decisions.md`.

### 2026-05-30
- Type: Execution
- Summary: Implemented TASK-118 project activity polling and dashboard live refresh.
- Evidence: Added the `app.touch_project_activity` migration; introduced
  `lib/services/project-activity-service.ts` and
  `GET /api/projects/[projectId]/activity`; mounted `ProjectLiveRefresh` on the
  project dashboard; added panel-level refresh locks for Kanban, context cards,
  epics, and roadmap; and wired successful task, comment/reaction, attachment,
  context-card, epic, and roadmap mutations to advance project activity.

### 2026-05-30
- Type: Validation
- Summary: TASK-118 local validation passed except for Docker-blocked local E2E.
- Evidence: `npm run lint` passed. `DATABASE_URL=postgresql://nexus:nexus@localhost:5432/nexusdash DIRECT_URL=postgresql://nexus:nexus@localhost:5433/nexusdash npm test` passed (112 files passed, 2 skipped; 843 tests passed, 2 skipped). Same DB env `npm run test:coverage` passed (91.23% statements, 81.2% branches, 93.42% functions, 91.75% lines). Preview-style build env with distinct DB URLs plus `GOOGLE_TOKEN_ENCRYPTION_KEY` and `AGENT_TOKEN_SIGNING_SECRET` passed `npm run build`. `npx prisma validate` passed. `npm run db:local:up` failed because Docker Desktop's `dockerDesktopLinuxEngine` pipe is unavailable, so local Playwright E2E is blocked pending deploy-preview smoke.

### 2026-05-30
- Type: Validation
- Summary: TASK-118 PR #305 remote validation and preview deployment passed.
- Evidence: PR #305 opened at `https://github.com/dorianagaesse/nexus_dash/pull/305` from commit `4cc1167`. Quality Gates run `26689822570` passed Quality Core, Playwright E2E smoke, and container image artifact jobs. Manual deploy workflow `26689831199` deployed preview `https://nexus-dash-3dlunbbgu-dorian-agaesses-projects.vercel.app`. Direct preview smoke from this shell is blocked by Vercel protection because no `VERCEL_AUTOMATION_BYPASS_SECRET` is available locally; unauthenticated `/` and `/api/health/live` return 401.

### 2026-05-30
- Type: Execution
- Summary: Implemented TASK-274 production dependency audit remediation.
- Evidence: Created `chore/task-274-production-audit` from `origin/main`.
  Confirmed `next@16.2.6`, `eslint-config-next@16.2.6`, and `prisma@7.8.0`
  are already the latest npm stable versions. Added targeted npm overrides for
  `next` to use `postcss@8.5.15`, and for Prisma's `@prisma/dev` tree to use
  `@hono/node-server@1.19.14` and `hono@4.12.23`. Regenerated
  `package-lock.json` from the updated manifest so the production audit
  resolves the override tree.

### 2026-05-30
- Type: Validation
- Summary: TASK-274 local validation passed except for an environment-blocked
  local E2E database prerequisite.
- Evidence: `npm audit --omit=dev --audit-level=high` passed with 0
  vulnerabilities; `npm audit --omit=dev --audit-level=moderate` passed with 0
  vulnerabilities; `npm ls next postcss hono @hono/node-server prisma
  @prisma/client --depth=2` showed Next using deduped `postcss@8.5.15` and
  Prisma's dev tree using overridden `@hono/node-server@1.19.14` /
  `hono@4.12.23`; `git diff --check` passed; `npm run lint` passed; explicit
  local PostgreSQL env `npm test` passed (109 files passed, 2 skipped; 837
  passed, 2 skipped); explicit local PostgreSQL env `npm run test:coverage`
  passed (91.23% statements, 81.2% branches, 93.42% functions, 91.75% lines);
  placeholder-production-env `npm run build` passed. Initial plain `npm test`
  failed because Vitest does not load `.env` and `DATABASE_URL` was unset.
  `npm run test:e2e` built successfully but Playwright tests could not complete:
  after installing Chromium with `npx playwright install chromium`, all eight
  E2E tests failed during setup because PostgreSQL was unreachable at
  `127.0.0.1:5432`; Docker Desktop was also unavailable
  (`dockerDesktopLinuxEngine` pipe missing), so the local DB prerequisite could
  not be started in this session.

### 2026-05-30
- Type: Validation
- Summary: TASK-274 PR automation passed and Copilot review produced no
  actionable comments.
- Evidence: Opened ready-for-review PR #304
  (`https://github.com/dorianagaesse/nexus_dash/pull/304`) at head
  `836e33e633353a527fa9efae36e5ef1336cdead0`. GitHub Actions passed Check
  Branch Name, Quality Core, E2E Smoke, and Container Image checks; Dependabot
  auto-triage jobs skipped as expected for a non-Dependabot branch. Copilot
  pull request review completed on 2026-05-30 and generated no inline comments
  or unresolved review threads.

### 2026-05-26
- Type: Execution
- Summary: Started TASK-266 from a dedicated worktree and implemented a
  transaction-client query serialization guard for Prisma's pg adapter path.
- Evidence: Created/used `../nexus_dash_task266` on
  `feature/task-266-pg-query-deprecation-cleanup`, rewrote
  `tasks/current.md` for TASK-266 acceptance and preview validation, and updated
  `lib/prisma.ts` to pass Prisma an external `pg.Pool` whose borrowed
  transaction clients serialize `query()` calls before returning to the
  adapter. Added focused coverage in
  `tests/lib/pg-transaction-query-serialization.test.ts`.

### 2026-05-26
- Type: Validation
- Summary: TASK-266 local validation passed for the transaction-client query
  serialization change.
- Evidence: `git diff --check`; focused
  `npm test -- --run tests/lib/pg-transaction-query-serialization.test.ts tests/lib/project-notification-email-service.test.ts tests/api/notification-email-dispatch.route.test.ts`
  (29 tests); `npm run lint`; local PostgreSQL env `npm test` (109 files
  passed, 2 skipped; 836 passed, 2 skipped); local PostgreSQL env
  `npm run test:coverage` (91.23% statements, 81.2% branches, 93.42%
  functions, 91.75% lines); preview-style env `npm run build`.

### 2026-05-26
- Type: Blocker
- Summary: TASK-266 remote automation and full preview smoke are blocked by
  external runtime/dispatch constraints after PR #293 was opened.
- Evidence: PR #293 is open and mergeable at head
  `1d4ca2e79d32db1dd10f8df665400955934d9e4a`, but GitHub reported no PR
  checks and repeated `gh workflow run` / Actions dispatch attempts for
  `quality-gates.yml`, `check-branch-names.yml`, and `deploy-vercel.yml`
  returned HTTP 500 `Failed to run workflow dispatch`. Direct Vercel preview
  deploys from the TASK-266 worktree succeeded, including
  `https://nexus-dash-8u5ltuc43-dorian-agaesses-projects.vercel.app`, but the
  deployment using normal preview env reported `/api/health/ready`
  `database-unreachable`, and the production env pulled from Vercel has empty
  `DATABASE_URL` / `DIRECT_URL` because DB runtime secrets are injected by the
  GitHub deploy workflow rather than stored in Vercel preview env. A protected
  dispatch smoke with outbound delivery disabled therefore cannot be completed
  until GitHub workflow dispatch recovers or the preview runtime receives the
  required DB/dispatch secrets through the expected deploy workflow.

### 2026-05-25
- Type: Execution
- Summary: Started TASK-269 GitHub Actions workflow cleanup.
- Evidence: Created `chore/task-269-workflow-cleanup` from `origin/main`, replaced `tasks/current.md` with the TASK-269 execution contract, audited the seven active workflows, and selected a conservative no-delete cleanup focused on least-privilege permissions plus a durable workflow inventory runbook.

### 2026-05-25
- Type: Execution
- Summary: Fixed Dependency Security workflow shell quoting during TASK-269 audit.
- Evidence: `gh workflow view dependency-security.yml` showed repeated scheduled failures. `gh run view 26391151111 --log-failed` showed Bash expanding JavaScript template literals in inline `node -e` snippets (`High/Critical: No such file or directory`, `${meta.total ?? 0}: bad substitution`). Replaced the snippets with quoted Node heredocs so summaries render and future failures reflect actual audit findings.

### 2026-05-25
- Type: Planning
- Summary: Added TASK-274 for the current Next.js production audit finding.
- Evidence: During TASK-269 validation, `npm audit --omit=dev --audit-level=high` failed on a high-severity `next` advisory. Added TASK-274 so the dependency/security update can be handled in a dedicated PR instead of mixing framework upgrades into workflow cleanup.

### 2026-05-25
- Type: Validation
- Summary: TASK-269 local validation passed with one expected audit follow-up.
- Evidence: Workflow YAML parsed with PyYAML for all seven active workflow files. `git diff --check`, `npm run lint`, local PostgreSQL `npm test` (108 files passed, 2 skipped; 834 passed, 2 skipped), local PostgreSQL `npm run test:coverage` (91.23% statements, 81.2% branches, 93.42% functions, 91.75% lines), and placeholder-env `npm run build` passed. `gh workflow view` succeeded for all seven workflows. `npm audit --omit=dev --audit-level=high` still fails on the current `next` advisory and is tracked as TASK-274.

### 2026-05-25
- Type: Execution
- Summary: Reapplied TASK-273 cost-aware notification email scheduling implementation after rollback.
- Evidence: Created `feature/task-273-cost-aware-scheduler-review` from the post-rollback `origin/main`, selected the documented no-new-cost 30-minute GitHub Actions cadence, added dispatcher scheduler-lag metrics, and updated workflow/runbook/project documentation to describe the new cadence and residual GitHub scheduler limitation.

### 2026-05-25
- Type: Validation
- Summary: TASK-273 reapply validation passed after using the explicit local PostgreSQL env.
- Evidence: Focused notification email tests passed (`npm test -- --run tests/lib/project-notification-email-service.test.ts tests/api/notification-email-dispatch.route.test.ts`, 26 tests). `npm run lint` and `git diff --check` passed. Plain `npm test` and `npm run test:coverage` initially failed because Vitest does not load `.env` and `DATABASE_URL` was unset; Docker Compose local Postgres could not bind because port 5432 was already allocated, but the documented local PostgreSQL URL was reachable and `npm run db:migrate` showed no pending migrations. With explicit `DATABASE_URL`/`DIRECT_URL`, `npm test` passed (108 files passed, 2 skipped; 833 passed, 2 skipped), `npm run test:coverage` passed (91.23% statements, 81.2% branches, 93.42% functions, 91.75% lines), and `npm run build` passed with safe local placeholder runtime secrets.

### 2026-05-25
- Type: Validation
- Summary: TASK-273 implementation is ready for fresh maintainer review.
- Evidence: Reapplied the implementation on `feature/task-273-cost-aware-scheduler-review` after rollback PR #290 merged. A new PR will be opened and left unmerged for maintainer approval.

### 2026-05-25
- Type: Planning
- Summary: Reviewed and refreshed the backlog after the TASK-273 planning merge.
- Evidence: Updated `tasks/backlog.md` with a 2026-05-25 review stamp, clarified that TASK-273's strategy brief merged via PR #280 while implementation remains pending, queued TASK-269 after scheduler work unless deferred, labeled TASK-266/TASK-133 as follow-ups, and corrected stale completed PR statuses for TASK-104 and TASK-127.

### 2026-05-22
- Type: Planning
- Summary: Created TASK-273 for cost-aware notification email scheduling improvements.
- Evidence: Production smoke after TASK-226/TASK-265 confirmed the durable notification email pipeline can reconcile and send, but user discussion identified the current 3-hour GitHub Actions bridge as too coarse and predictably batched compared with common production notification systems. Added `tasks/task-273-cost-aware-notification-email-scheduling.md`, queued TASK-273 in `tasks/backlog.md`, updated `tasks/current.md`, marked TASK-226 complete after PR #279, and recorded a proposed architecture direction in `adr/decisions.md` to keep the app-owned durable email queue while improving scheduler cadence under cost constraints.

### 2026-05-22
- Type: Execution
- Summary: Started TASK-226 production RLS remediation after prod smoke found no due-date reminder candidates.
- Evidence: Created branch `fix/task-226-due-reminder-rls` in `../nexus_dash_task226` from `origin/main`. Root cause analysis found due-date reminder discovery reading RLS-protected task rows without an actor context and reminder email queueing depending on a later global notification scan. Updated `tasks/current.md` and `tasks/backlog.md` for the focused production fix.

### 2026-05-22
- Type: Validation
- Summary: TASK-226 production RLS remediation passed local validation.
- Evidence: Due-date reminder reconciliation now scans verified recipients and runs task discovery under each recipient's RLS context, then creates/reuses the reminder notification and queues its email group immediately. Validation passed: focused `npm test -- --run tests/lib/project-notification-email-service.test.ts` (18 tests); `git diff --check`; `npm run lint`; local PostgreSQL env `npm test` (108 files passed, 832 tests passed, 2 skipped); local PostgreSQL env `npm run test:coverage` (91.23% statements, 81.2% branches, 93.42% functions, 91.75% lines); preview-style env `npm run build`.

### 2026-05-22
- Type: Execution
- Summary: TASK-226 addressed Copilot review feedback on verified-recipient scan scale.
- Evidence: Copilot flagged that due-date reconciliation materialized every verified user before applying the reminder cap. Added paginated recipient scanning with a 100-user batch size, cursor continuation, and early stop once the reminder cap is reached. Follow-up validation passed: focused service tests (19 tests), `git diff --check`, `npm run lint`, local PostgreSQL `npm test` (108 files passed, 833 tests passed, 2 skipped), local PostgreSQL `npm run test:coverage`, and preview-style `npm run build`.

### 2026-05-22
- Type: Validation
- Summary: Resolved PR #277 merge conflicts against current `origin/main`.
- Evidence: Merged `origin/main` at `d5464d8` into
  `feature/task-265-notification-actor-attribution`, preserved TASK-226
  due-date reminder updates, retained TASK-265 actor-attribution evidence, and
  adapted the email digest actor-precedence test to the new reminder
  reconciliation query flow. Validation passed: `git diff --check`, focused
  route/email tests (5 files, 71 tests), `npm run lint`, full `npm test` (108
  files passed, 831 tests passed, 2 skipped), `npm run test:coverage`, and
  `npm run build` with local placeholder runtime env.

### 2026-05-22
- Type: Execution
- Summary: Implemented TASK-265 notification actor attribution and
  self-notification rules.
- Evidence: Added explicit actor metadata to task assignment and comment
  mention notifications, including agent credential id/label and display copy
  such as `<credential> (agent)` for agent-authored activity. Human
  self-assignment and self-mention notifications are suppressed, while
  agent-to-owner notifications remain eligible. Validation passed with
  `git diff --check`, focused route/email tests, `npm run lint`, full
  `npm test`, `npm run test:coverage`, and `npm run build` using the local
  Postgres database and local-only build env.

### 2026-05-22
- Type: Planning
- Summary: Started TASK-265 in a dedicated worktree and cleaned stale execution
  queue entries.
- Evidence: Fetched current `origin/main` at `522daeb`, created
  `../nexus_dash_task265` on
  `feature/task-265-notification-actor-attribution`, moved merged TASK-271
  (PR #275) and TASK-272 (PR #276) from the execution queue to Completed in
  `tasks/backlog.md`, promoted TASK-265 to Active, and redrafted
  `tasks/current.md` with acceptance criteria, definition of done, local
  prerequisites, validation plan, and review workflow.

### 2026-05-22
- Type: Execution
- Summary: TASK-226 started from a dedicated worktree and branch with reminder recipient/idempotency decisions recorded before implementation.
- Evidence: Created `../nexus_dash_task226` on `feature/task-226-task-due-date-email-reminders` from `origin/main`. Rewrote `tasks/current.md` for TASK-226 and marked the backlog entry active. Decisions: due-date reminders target the current assignee, or the task creator when unassigned; recipients must still have project access; `Done`/archived tasks are excluded; source identity is `task_due_date_reminder` plus `<taskId>:<recipientUserId>:<deadlineDate>`; reminder notifications will feed the existing project notification email digest pipeline.

### 2026-05-22
- Type: Validation
- Summary: TASK-226 due-date reminder implementation passed local validation.
- Evidence: Added `task_due_date_reminder` notification mapping, dispatcher reconciliation for tasks exactly three calendar days from `deadlineAt`, shared project digest email rendering for due-date reminder items, notification center labeling, and documentation/runbook updates. Validation passed: `git diff --check`; focused `npm test -- --run tests/lib/task-deadline.test.ts tests/lib/notification-service.test.ts tests/lib/project-notification-email-service.test.ts tests/lib/outbound-email-templates.test.ts tests/api/notification-email-dispatch.route.test.ts` (5 files, 45 tests); `npm run lint`; local PostgreSQL env `npm test` (108 files passed, 827 tests passed, 2 skipped); `npm run test:coverage` (91.23% statements, 81.2% branches, 93.42% functions, 91.75% lines); local placeholder runtime env `npm run build`.

### 2026-05-22
- Type: Execution
- Summary: TASK-226 addressed Copilot review comments on PR #278.
- Evidence: Changed the due-date reminder eligibility query to compare `deadlineAt` to a bound date-only string cast with `CAST(... AS date)`, avoiding timezone-sensitive timestamp comparison. Canonicalized `createTaskDueDateReminderNotification()` so the validated top-level recipient id overrides stale metadata/source input before create/update. Follow-up validation passed: focused notification/email service tests (2 files, 28 tests), `npm run lint`, local placeholder runtime env `npm run build`, and `git diff --check`.

### 2026-05-22
- Type: Execution
- Summary: Started TASK-272 release version cadence and tagging policy.
- Evidence: Added `tasks/task-272-release-version-cadence-and-tagging.md`,
  promoted TASK-272 to active in `tasks/backlog.md`, created
  `docs/runbooks/release-versioning.md`, seeded `CHANGELOG.md`, and added the
  `npm run release:version` helper for dry-run and intentional
  `package.json`/`package-lock.json` product-version bumps.

### 2026-05-21
- Type: Execution
- Summary: Started TASK-271 to suppress repeated notification digest emails for
  already-delivered notifications.
- Evidence: User reported receiving repeated NexusDash notification reminder
  emails for notifications that had already been emailed but remained unread
  in-app. Created `fix/task-271-notification-email-no-repeat`, added
  `tasks/task-271-notification-email-delivery-deduplication.md`, and tightened
  `lib/services/project-notification-email-service.ts` so sent email items
  cover notification IDs permanently while pending/dispatching groups still use
  current fingerprints for pre-delivery refreshes. Added a dispatch-time guard
  so stale pending groups created before the fix are skipped when another sent
  group already covered their notification IDs.

### 2026-05-20
- Type: Execution
- Summary: Fixed notification email scheduler production target drift.
- Evidence: Recent scheduled `Notification Email Dispatch Scheduler` runs were
  calling a Vercel-protected deployment URL from
  `NOTIFICATION_EMAIL_DISPATCH_URL` and failing with Vercel Authentication
  `401` before reaching the app endpoint. Updated the GitHub repository and
  production-environment variable to `https://nexus-dash.app`, then changed the
  workflow so scheduled runs always default to production and only manual
  dispatch can override the target URL.

### 2026-05-20
- Type: Planning
- Summary: Added post-deploy operational and design assessment follow-ups.
- Evidence: Updated `tasks/backlog.md` to move merged TASK-268 and TASK-132 to
  completed, added TASK-269 for GitHub Actions workflow cleanup at the top of
  the execution queue, and added TASK-270 as a product-wide UI/UX design
  assessment that feeds existing refinement tasks instead of duplicating them.
  Added dedicated briefs in
  `tasks/task-269-github-actions-workflow-cleanup.md` and
  `tasks/task-270-app-ui-ux-design-assessment.md`.

### 2026-05-20
- Type: Governance
- Summary: Clarified Supabase runtime/admin connection policy after production
  credential repair.
- Evidence: Production and staging role checks confirmed `app_runtime` exists
  with no superuser/create-role/create-db/RLS-bypass privileges, while
  `postgres` remains admin-capable. The validated runtime shape is
  `app_runtime.<project-ref>` through the transaction pooler on port `6543`.
  Supabase direct-host DNS resolved IPv6-only from local diagnostics, so the
  docs now allow an admin `postgres.<project-ref>` session-pooler fallback for
  `DIRECT_URL` / `MIGRATION_DATABASE_URL` when direct connectivity is
  unavailable, while keeping admin/session-pooler credentials forbidden for
  `DATABASE_URL`.

### 2026-05-19
- Type: Validation
- Summary: TASK-132 PR #270 branch refreshed against current `main` and
  revalidated after PR #271 merged.
- Evidence: Merged `origin/main` into
  `feature/task-132-version-update-system`; resolved tracking-doc conflicts;
  confirmed the preview failure was the Vercel Preview `DATABASE_URL` session
  pooler on port `5432`, not a TASK-132 code regression; reran focused metadata
  tests, lint, full Vitest, coverage, production build, and `git diff --check`.

### 2026-05-19
- Type: Execution
- Summary: TASK-132 implemented production-grade app version metadata.
- Evidence: Bumped `package.json`/`package-lock.json` to `0.2.0`; changed
  `lib/app-metadata.ts` so the visible app label is the clean product version
  while revision/environment remain diagnostic metadata; updated
  `components/app-metadata-pill.tsx`, Vercel deploy metadata injection,
  `.env.example`, README, and the Vercel env runbook. Validation passed with
  focused metadata tests, lint, full Vitest, coverage, production build, and
  `git diff --check`; DB-backed tests used a temporary PostgreSQL 16 instance
  on port `55432` because Docker was not running.

### 2026-05-19
- Type: Validation
- Summary: TASK-132 branch-scoped preview workflow reached metadata resolution
  but was blocked by preview database env configuration.
- Evidence: Workflow run `26104594474` used workflow ref
  `feature/task-132-version-update-system`, checked out
  `origin/feature/task-132-version-update-system` at commit `f197129`
  before later documentation-only tracking updates, and resolved
  `APP_VERSION=0.2.0`, `APP_ENV=preview`, `COMMIT_SHA=f1971290c4909284e2a9f00fccb4dc52b816b892`,
  and `APP_REPOSITORY_URL=https://github.com/dorianagaesse/nexus_dash`. The
  deploy failed during Vercel preview build because the pulled preview
  `DATABASE_URL` still uses the Supabase session-pooler port `5432`; the
  existing runtime guard requires transaction-pooler port `6543`.

### 2026-05-19
- Type: Planning
- Summary: TASK-268 replaced the QStash scheduler path with a GitHub Actions production bridge.
- Evidence: User validated moving on without QStash because Upstash account/token setup was too fragile for the current stage. Added TASK-268, superseded active TASK-228, scheduled `.github/workflows/notification-email-dispatch.yml` every 3 hours, and documented that this bridge preserves durable/idempotent dispatch but no longer promises one-hour notification email delivery.

### 2026-05-16
- Type: Planning
- Summary: TASK-267 drafted dedicated handoff briefs for the next notification/email tasks.
- Evidence: Added `tasks/task-228-qstash-notification-email-scheduler-activation.md`, `tasks/task-265-notification-actor-attribution-and-self-notification-rules.md`, and `tasks/task-226-task-due-date-email-reminders.md`; linked them from `tasks/backlog.md`; kept the change documentation-only so scheduler activation, actor attribution, and due-date reminder implementation remain separate PRs.

### 2026-05-16
- Type: Planning
- Summary: TASK-264 cleaned the notification backlog path after production digest smoke.
- Evidence: Production multi-notification smoke succeeded: two atomic assignment notifications produced one grouped digest email after manual dispatch, and repeat dispatch sent nothing. The same smoke showed QStash/managed scheduling is not live yet, so TASK-228 was promoted as the next scheduler task. Added TASK-265 for agent/human notification attribution and self-notification rules, and TASK-266 for the recurring production `pg@9` client query deprecation warning observed in Vercel logs.

### 2026-05-16
- Type: Planning
- Summary: TASK-263 captured realtime in-app notification updates as a dedicated follow-up related to TASK-118.
- Evidence: PR #262 merged the email-only digest boundary and kept in-app notification surfaces atomic. Added a pending notification-specific realtime task for live notification-center rows, unread counts, and awareness banner updates without navigation/manual refresh, while requiring alignment with the broader TASK-118 realtime collaboration transport decision.

### 2026-05-16
- Type: Execution
- Summary: TASK-260 kept in-app notification awareness atomic while preserving email digests.
- Evidence: Production grouped-notification smoke showed the email digest layer works, but in-app awareness copy could read as a grouped notification (`+N more unread notifications`). Updated the notification awareness banner to show only the latest unread atomic notification and link to the notification center for the full list. Added component coverage proving the banner does not render grouped unread text while existing email-service coverage continues to prove recipient/project email batching.

### 2026-05-15
- Type: Execution
- Summary: TASK-259 added production Supabase project-ref guardrails after runtime DB drift incident.
- Evidence: Opened issue #260 after production authenticated successfully but showed no projects, indicating `DATABASE_URL` had been overwritten to a valid but wrong Supabase database while `DIRECT_URL`/`MIGRATION_DATABASE_URL` were unchanged. Added validation to compare Supabase project refs extracted from shared pooler usernames, direct DB hosts, and `SUPABASE_URL`; updated README and DB/env runbooks with recovery guidance that agents must not rewrite production secrets without explicit operator authorization.

### 2026-05-15
- Type: Validation
- Summary: TASK-259 local validation passed.
- Evidence: `npm ci`; `npm test -- --run tests/lib/env.server.test.ts` passed with 70 tests; `npm run lint` passed; local PostgreSQL `npm run db:migrate` passed with no pending migrations; local DB `NODE_ENV=test npm test` passed (107 files passed, 2 skipped; 809 tests passed, 2 skipped); local DB `NODE_ENV=test npm run test:coverage` passed with 91.23% statements, 81.2% branches, 93.42% functions, and 91.75% lines; production build passed with local PostgreSQL and safe local runtime secrets.

### 2026-05-15
- Type: Execution
- Summary: TASK-258 hardened production database pooling after `EMAXCONNSESSION` incident.
- Evidence: Opened issue #258 after production logs showed `DriverAdapterError: (EMAXCONNSESSION) max clients reached in session mode` on `/account/notifications` and `/`. Masked env inspection found the ignored production runtime `DATABASE_URL` shape used the Supabase pooler on port `5432` (session mode). Runtime validation now rejects Supabase session-pooler `DATABASE_URL` in production, accepts transaction-pooler port `6543`, and normalizes Prisma runtime URLs with Supabase transaction-pooler compatibility flags. GitHub production `DATABASE_URL` and Vercel Production `DATABASE_URL` were updated to the derived transaction-pooler shape without printing secret values.

### 2026-05-15
- Type: Validation
- Summary: TASK-258 local validation passed.
- Evidence: `npm ci`; `npm test -- --run tests/lib/env.server.test.ts` passed with 68 tests; `npm run lint` passed; `npm run db:local:up` could not bind port `5432` because another local PostgreSQL service was already using it; `npm run db:migrate` passed against the existing local `127.0.0.1:5432` database with no pending migrations; local DB `NODE_ENV=test npm test` passed (107 files passed, 2 skipped; 807 tests passed, 2 skipped); local DB `NODE_ENV=test npm run test:coverage` passed (91.23% statements, 81.2% branches, 93.42% functions, 91.75% lines); production-guarded `npm run build` passed with local PostgreSQL and safe local runtime secrets.

### 2026-05-14
- Type: Execution
- Summary: Hardened manual Vercel promote/rollback target handling after a failed promote run.
- Evidence: Run `25861160816` failed because `deployment_id_or_url` contained the same Vercel deployment URL twice, producing a malformed `.apphttps://...` target. The deploy workflow now normalizes the promote/rollback target once, trims accidental whitespace, warns and uses the first URL if two `https://` deployment URLs are pasted together, and uses the normalized value for inspect, promote/rollback, and the job summary.

### 2026-05-14
- Type: Validation
- Summary: Production notification email dispatch endpoint smoke passed with the protected Vercel production secret.
- Evidence: Pulled production Vercel env into ignored `tmp/vercel-production-smoke.env`, confirmed `https://nexus-dash.app/api/health/live` returned 200, and invoked `GET https://nexus-dash.app/api/cron/notification-emails` with `x-notification-email-dispatch-secret`. The endpoint returned 200 with `ok: true`, `groupsClaimed: 0`, `recipientEmailsAttempted: 0`, and `errors: 0`. A first `POST` probe returned 405, confirming QStash must call the documented `GET` method.

### 2026-05-14
- Type: Planning
- Summary: Added TASK-228 for QStash production scheduler activation after PR #254 merged.
- Evidence: PR #254 merged as `e83dfa73b9ede02775bdd3d8a467c4b521fe8f7b`. TASK-227 delivered the durable notification email orchestration and protected endpoint, but QStash itself is not provisioned in code. Because the Vercel plan will not be upgraded and Hobby cron cannot run sub-hour schedules, TASK-228 now tracks activation of an Upstash QStash Schedule or equivalent managed HTTP scheduler, including the 5-minute cadence, protected header, retries/visibility, redaction, and production smoke validation.

### 2026-05-13
- Type: Execution
- Summary: TASK-227 addressed Copilot PR #254 review feedback on migration backfills, retryability, reconciliation scale, dispatch-time verification, and env docs.
- Evidence: Changed the TASK-227 migration to backfill runtime-compatible grouping keys and ISO source fingerprints, merge duplicate pending project digest rows before adding the active grouping-key index, and declare the source fingerprint index in Prisma. Reconciliation now queries uncovered notification candidates directly instead of scanning all verified users or repeatedly consuming the cap on covered notifications. Stale claimed groups are released back to `pending` for retry. Dispatch reloads and rechecks `emailVerified` before sending. `.env.example` now matches the manual diagnostic workflow and preferred dispatch header.

### 2026-05-13
- Type: Validation
- Summary: TASK-227 Copilot follow-up passed focused, migration, lint, full test, coverage, and build validation.
- Evidence: Focused orchestration suite passed after review fixes with 4 files and 83 tests. A fresh temporary local database `nexusdash_task227_migration_check` applied all 35 migrations successfully via `npm run db:migrate`, then was dropped. `npm run lint` passed. Local PostgreSQL `NODE_ENV=test npm test` passed (107 files passed, 2 skipped; 802 tests passed, 2 skipped). Local PostgreSQL `NODE_ENV=test npm run test:coverage` passed (91.23% statements, 81.2% branches, 93.42% functions, 91.75% lines). Production-guarded `npm run build` passed with local PostgreSQL, disabled outbound delivery mode, localhost trusted origins, local agent signing secret, local Google token key, and explicit `NEXTAUTH_URL`/`NEXTAUTH_SECRET`.

### 2026-05-13
- Type: Execution
- Summary: TASK-227 started from the required dedicated worktree and audited TASK-225/PR #246 plus PR #252.
- Evidence: Reused existing worktree `../nexus_dash_task227`, switched it from deleted `docs/task-227-prod-notification-delivery` to `feature/task-227-production-grade-notification-email-orchestration` at `origin/main`, rewrote `tasks/current.md` for TASK-227, inspected PR #246 and PR #252, and checked recent `Notification Email Dispatch` runs. Run `25752062859` failed with empty dispatch URL/secret; run `25826658473` on `fix/task-225-notification-dispatch-workflow` reached Vercel deployment protection and returned 401 HTML; run `25826921991` on `main` still returned 401 through the bearer path.

### 2026-05-13
- Type: Execution
- Summary: TASK-227 replaced scan-time notification email dispatch with durable debounce orchestration.
- Evidence: Added TASK-227 migration `20260513120000_task227_notification_email_orchestration` for grouping keys, first/latest pending timestamps, send-after/max-send timestamps, claim state, attempt counters, and source fingerprints. Reworked `lib/services/project-notification-email-service.ts` so notification creation/refreshed paths enqueue pending recipient/project groups, dispatcher claims due groups with `FOR UPDATE SKIP LOCKED`, batches due groups by recipient, and records sent/skipped/failed outcomes against outbound delivery attempts. Wired ingestion from `lib/services/notification-service.ts`.

### 2026-05-13
- Type: Execution
- Summary: TASK-227 demoted GitHub Actions scheduling and documented the production scheduler decision.
- Evidence: `.github/workflows/notification-email-dispatch.yml` is now manual-only diagnostic tooling using `x-notification-email-dispatch-secret`. README/runbook guidance now states Vercel Cron is the preferred production path on a plan with sub-hour cadence, the current Hobby plan is blocked by daily-only cron, and a managed HTTP scheduler such as Upstash QStash Schedule is the Hobby-compatible production alternative. Preview validation remains manual endpoint invocation because Vercel Cron runs only on production deployments.

### 2026-05-13
- Type: Validation
- Summary: TASK-227 focused orchestration validation passed during implementation.
- Evidence: `npm ci`; `npx prisma validate`; `npm test -- --run tests/lib/project-notification-email-service.test.ts tests/api/notification-email-dispatch.route.test.ts tests/lib/outbound-email-templates.test.ts tests/lib/env.server.test.ts` passed with 4 files and 81 tests. Focused notification producer regression also passed with `npm test -- --run tests/lib/notification-service.test.ts tests/api/task-comments.route.test.ts tests/api/task-update.route.test.ts` (3 files, 41 tests).

### 2026-05-13
- Type: Validation
- Summary: TASK-227 local validation baseline passed.
- Evidence: `npm run lint`; local PostgreSQL `npm run db:migrate` applied `20260513120000_task227_notification_email_orchestration`; local DB `NODE_ENV=test npm test` passed (107 files passed, 2 skipped; 800 tests passed, 2 skipped); local DB `NODE_ENV=test npm run test:coverage` passed (91.23% statements, 81.2% branches, 93.42% functions, 91.75% lines); production-guarded `npm run build` passed with local PostgreSQL, disabled outbound delivery mode, localhost trusted origins, local agent signing secret, local Google token key, and explicit `NEXTAUTH_URL`/`NEXTAUTH_SECRET`. `npm run db:local:up` was blocked by port 5432 already being allocated, so the existing local PostgreSQL service was used.

### 2026-05-13
- Type: Planning
- Summary: Added TASK-227 to clarify the production-grade notification email refactor.
- Evidence: Added `tasks/task-227-production-grade-notification-email-orchestration.md` and queued TASK-227 in `tasks/backlog.md`. The task captures the product goal as grouped project notification email delivery with debounce and a hard maximum delay, separates TASK-226 due-date reminder business logic, directs the next implementation away from GitHub Actions as the primary production scheduler, and updates TASK-225 tracking to reflect that PR #246 has merged.

### 2026-05-08
- Type: Execution
- Summary: TASK-104 follow-up made email-only project invites email-first in the owner UI.
- Evidence: Updated the sharing composer to show `Send invitation` for unmatched email addresses, show an invitation-sent state without exposing the raw link after successful delivery, keep copy-link fallback only for failed/skipped delivery and pending invitations, and reword owner feedback away from link creation. Focused validation passed with `npm test -- tests/components/project-dashboard-owner-sharing-panel.test.tsx tests/components/project-dashboard-owner-access-panel.test.tsx` and `npm run lint`.

### 2026-05-07
- Type: Execution
- Summary: TASK-104 implemented app-managed project invitation email delivery.
- Evidence: Added trusted-origin invite email sending for owner-created invitations, a resend endpoint at `/api/projects/[projectId]/sharing/invitations/[invitationId]/email`, owner UI delivery feedback and resend controls, safe outbound metadata, and copy-link fallback preservation. Updated `lib/services/project-collaboration-service.ts`, sharing API routes, owner sharing/access panels, component/API/service tests, and the outbound email runbook.

### 2026-05-07
- Type: Validation
- Summary: TASK-104 passed local validation and live invitation-email smoke testing.
- Evidence: `npm ci`; `npx prisma generate`; local migration deploy against the existing `127.0.0.1:5432` PostgreSQL service; focused invite-email tests passed (5 files, 23 tests); `npm run lint`; local DB `NODE_ENV=test npm test` passed (105 files passed, 2 skipped; 778 tests passed, 2 skipped); local DB `NODE_ENV=test npm run test:coverage` passed with 91.23% statements, 81.2% branches, 93.42% functions, and 91.75% lines; production-guarded `OUTBOUND_EMAIL_DELIVERY_MODE=disabled npm run build` passed after an initial expected local build guard failure without `RESEND_API_KEY`; `npm run test:e2e` passed all 8 Playwright tests. Manual live smoke created local project `cmovu31nw0000swsz9nhd1q80`, invited `galo.guccy@gmail.com` as an email-only recipient and `dorian.agaesse@gmail.com` as a matched verified local account, and recorded two sent `project_invitation` outbound delivery rows with provider message ids present.

### 2026-05-07
- Type: Governance
- Summary: TASK-104 PR #245 passed required checks and Copilot review follow-up.
- Evidence: PR #245 was opened from `feature/task-104-invite-email-delivery`. Copilot's three actionable threads were addressed in commit `49ea2e4` by validating invite URL origins, separating original inviter metadata from resend actor metadata, and restoring jsdom globals in roadmap component tests. Post-review focused validation passed with `npm test -- tests/lib/project-collaboration-service.test.ts tests/components/project-roadmap-panel.test.tsx`, `npm run lint`, and production-guarded `OUTBOUND_EMAIL_DELIVERY_MODE=disabled npm run build`; GitHub checks passed for `check-name`, `Quality Core`, `E2E Smoke`, and `Container Image`.

### 2026-05-07
- Type: Execution
- Summary: TASK-104 follow-up changed project invitation expiry to 24 hours.
- Evidence: Replaced the previous project invitation TTL constant with a 24-hour policy in `lib/services/project-collaboration-service.ts` and pinned service coverage to assert new invitations are created with `now + 24h`. Focused validation passed with `npm test -- tests/lib/project-collaboration-service.test.ts`.

### 2026-05-07
- Type: Execution
- Summary: TASK-125 implemented the outbound email foundation with durable provider-aware delivery records.
- Evidence: Added `OutboundEmailDelivery` schema/migration, `sendOutboundEmail`, typed auth/project-invitation/smoke template keys, Resend delivery-mode config through `lib/env.server.ts`, provider-safe structured logging, and refactored email verification/password reset sends onto the shared foundation while leaving owner-triggered invite email delivery for TASK-104.

### 2026-05-07
- Type: Validation
- Summary: TASK-125 passed local validation and a live outbound email smoke.
- Evidence: `npm ci`; `npx prisma generate`; local migration deploy against the existing `127.0.0.1:5432` PostgreSQL service; focused `npm test -- --run tests/lib/outbound-email-service.test.ts tests/lib/email-verification-service.test.ts tests/lib/password-reset-service.test.ts tests/lib/env.server.test.ts`; `npm run lint`; local DB `NODE_ENV=test npm test`; local DB `NODE_ENV=test npm run test:coverage`; production-guarded `npm run build`; live smoke with `RUN_OUTBOUND_EMAIL_SMOKE=1`, `OUTBOUND_EMAIL_DELIVERY_MODE=live`, and `OUTBOUND_EMAIL_SMOKE_TO=dorian.agaesse@gmail.com`; `npm run test:e2e` rerun with trusted localhost origins passed all 8 Playwright tests after the first run exposed missing local `TRUSTED_ORIGINS`.

### 2026-05-07
- Type: Validation
- Summary: TASK-125 PR #243 Copilot review feedback was addressed and required checks passed.
- Evidence: Copilot produced three actionable comments; commit `925af2a` sanitized project-invitation email subject/text fields, made failed-delivery record updates non-throwing, and stored omitted delivery metadata as SQL NULL. Revalidated with focused outbound email tests, `npm run lint`, local DB `npm test`, local DB `npm run test:coverage`, and production-guarded `npm run build`. Replied to and resolved all three Copilot threads; PR checks passed after the follow-up: `check-name`, `Quality Core`, `E2E Smoke`, and `Container Image`.

### 2026-05-04
- Type: Governance
- Summary: Tightened the repository agent workflow contract for worktrees, branch prefixes, mandatory PRs, and final push parity.
- Evidence: Updated `agent.md` and `CLAUDE.md` so GitHub issue work maps to `fix/*`, docs-only repository changes still require PRs, task worktree creation points to `npm run worktree:create -- TASK-XXX slug`, and completed local work must be pushed so the remote branch matches the handoff state.

### 2026-05-04
- Type: Validation
- Summary: Agent workflow contract documentation cleanup passed whitespace and lint validation.
- Evidence: `git diff --check`; `npm ci` in the docs worktree to provide ignored local dependencies; `npm run lint`.

### 2026-05-04
- Type: Execution
- Summary: TASK-124 PR #211 follow-up fixed the remaining mention display regressions reported from task comments and edited task descriptions.
- Evidence: Comment composer mention mirrors now hide discriminator text without extending the visible `@name` highlight or leaving a blank tail; task-description view rendering normalizes split text nodes before mention highlighting so earlier mentions remain highlighted after later edits add more mentions. Updated `lib/content-with-mentions.tsx`, `components/kanban/task-detail-modal.tsx`, `components/rich-text-content.tsx`, `tests/components/rich-text-content.test.ts`, `tests/components/rich-text-editor.test.ts`, and `tasks/current.md`.

### 2026-05-04
- Type: Validation
- Summary: TASK-124 remaining mention regression fixes passed focused local validation.
- Evidence: `npx -p node@20.19.0 node node_modules/vitest/vitest.mjs run tests/components/rich-text-content.test.ts tests/components/rich-text-editor.test.ts tests/lib/mention.test.ts tests/components/mention-autocomplete.test.ts`; `npm run lint`; build with Node `20.19.0` and test env values via `npx -p node@20.19.0 node node_modules/next/dist/bin/next build`.

### 2026-05-03
- Type: Execution
- Summary: TASK-124 PR #211 follow-up fixed mention display regressions from task view mode and comment composer mirrors.
- Evidence: Visible mentions now render as highlighted `@name` text without discriminators while retaining discriminator-backed lookup/storage where needed; updated `lib/content-with-mentions.tsx`, `components/kanban/task-detail-modal.tsx`, `components/rich-text-content.tsx`, `tests/components/rich-text-content.test.ts`, and `tasks/current.md`.

### 2026-05-03
- Type: Validation
- Summary: TASK-124 mention display follow-up passed lint, focused mention/rich-text tests, and production build locally.
- Evidence: `npm run lint`; `npm test -- tests/lib/mention.test.ts tests/components/mention-autocomplete.test.ts`; `npx -p node@20.19.0 node node_modules/vitest/vitest.mjs run tests/components/rich-text-content.test.ts tests/lib/mention.test.ts tests/components/mention-autocomplete.test.ts`; build with Node `20.19.0` and test env values via `npx -p node@20.19.0 node node_modules/next/dist/bin/next build`. Default workstation Node `20.17.0` still reproduces the known jsdom worker `ERR_REQUIRE_ESM` startup blocker for component tests.

### 2026-04-29
- Type: Execution
- Summary: TASK-123 Copilot review follow-up tightened notification durability and read-path efficiency before preview deployment.
- Evidence: Addressed six PR #210 review threads by adding typed error handling for notification read-state writes, making notification timestamps deterministic across render environments, tightening the notification RLS update policy to preserve recipient email binding, and changing invitation sync to batch missing-row creation/stale resolution instead of refreshing every active invitation during list/count reads.

### 2026-04-29
- Type: Validation
- Summary: TASK-123 Copilot follow-up passed the repository validation baseline locally.
- Evidence: `DATABASE_URL=... DIRECT_URL=... npm test -- tests/lib/notification-service.test.ts tests/components/notification-center-list.test.ts tests/app/account-notifications-actions.test.ts`; `npm run lint`; `DATABASE_URL=... DIRECT_URL=... npm test`; `DATABASE_URL=... DIRECT_URL=... npm run test:coverage`; `DATABASE_URL=... DIRECT_URL=... AGENT_TOKEN_SIGNING_SECRET=... RESEND_API_KEY=... GOOGLE_TOKEN_ENCRYPTION_KEY=... npm run build`. A first build attempt used a too-short local `AGENT_TOKEN_SIGNING_SECRET` and failed env validation before succeeding with a 32-character test secret.

### 2026-04-29
- Type: Validation
- Summary: TASK-123 preview deployment completed from the active branch ref after Copilot review follow-up.
- Evidence: Ran `gh workflow run deploy-vercel.yml -f action=deploy-preview -f git_ref=feature/task-123-notification-center`; workflow run `25097818406` succeeded and produced preview `https://nexus-dash-lzzh9ro0y-dorian-agaesses-projects.vercel.app`. Log evidence includes `ref: feature/task-123-notification-center`, fetch of `origin/feature/task-123-notification-center`, and checkout command `git checkout --progress --force -B feature/task-123-notification-center refs/remotes/origin/feature/task-123-notification-center`. Direct preview browser automation was not run because the preview is Vercel SSO-protected and no `VERCEL_AUTOMATION_BYPASS_SECRET` was available locally; PR CI E2E Smoke passed on run `25097764300`.

### 2026-04-29
- Type: Execution
- Summary: TASK-123 delivered the durable in-app notification center foundation with project invitations as the first producer.
- Evidence: Added `Notification` schema/migration/RLS, implemented `lib/services/notification-service.ts`, integrated invitation create/replace/revoke/respond lifecycle with notification delivery/resolution, replaced invitation-specific account menu/count behavior with notification unread counts, added `/account/notifications`, replaced the account invitation card with a notification-center entry, and routed quick awareness banners to the notification center.

### 2026-04-29
- Type: Validation
- Summary: TASK-123 passed local lint, focused notification tests, full Vitest, coverage, and production build after restoring stale local dependencies to the repo-required Prisma 7 toolchain.
- Evidence: `npm install`; `DATABASE_URL=... DIRECT_URL=... node node_modules/prisma/build/index.js generate`; `npm run lint`; focused `npm test -- tests/lib/notification-service.test.ts tests/components/notification-center-list.test.ts tests/components/account-menu.test.ts tests/app/account-notifications-actions.test.ts tests/lib/project-collaboration-service.test.ts`; `DATABASE_URL=... DIRECT_URL=... npm test`; `DATABASE_URL=... DIRECT_URL=... npm run test:coverage`; `DATABASE_URL=... DIRECT_URL=... AGENT_TOKEN_SIGNING_SECRET=... RESEND_API_KEY=... GOOGLE_TOKEN_ENCRYPTION_KEY=... npm run build`. Initial `npm test` without `DATABASE_URL` failed at env bootstrap before affected suites executed.

### 2026-04-29
- Type: Blocker
- Summary: TASK-123 local Playwright validation could not complete against the local E2E fixture.
- Evidence: `npm run test:e2e -- --grep "task lifecycle and attachment interaction flow"` first failed because Chromium was missing; after `npx playwright install chromium`, the focused smoke built successfully but failed in `tests/e2e/helpers/auth-helpers.ts` during Prisma seeded-user creation before browser flow execution, matching the local validation fragility tracked by `TASK-131`.

### 2026-04-27
- Type: Execution
- Summary: TASK-130 roadmap follow-up fixed a connector-centering bug by replacing the old fixed-height desktop math with measured event-card centers, and milestone lane markers now inherit a status tone from their child events so lane chrome reflects planned, active, or reached state.
- Evidence: Updated `components/project-roadmap-panel.tsx` and `tasks/current.md`.

### 2026-04-27
- Type: Validation
- Summary: The connector-centering follow-up passed focused lint, a production build, and fresh preview validation on the branch-head roadmap deployment.
- Evidence: `npm run lint -- components/project-roadmap-panel.tsx`; env-overridden `npm run build`; preview deploy plus Playwright smoke against the latest branch-head preview.

### 2026-04-27
- Type: Execution
- Summary: TASK-130 modal follow-up aligned the light-theme event dialog with the darker unified surface treatment, reordered fields into the intended top-down authoring flow, and removed the extra milestone-placement shell so the picker matches the status control pattern.
- Evidence: Updated `components/project-roadmap-panel.tsx` and `tasks/current.md`.

### 2026-04-25
- Type: Execution
- Summary: TASK-130 roadmap polish tightened the event modal by removing the redundant edit-state inner callout, replacing icon-heavy roadmap dropdowns with more compact task-style pickers, clamping dropdown positioning so the status control no longer overflows the dialog, and strengthening milestone lane headers without introducing non-standard modal gradients.
- Evidence: Updated `components/project-roadmap-panel.tsx` and `tasks/current.md`.

### 2026-04-25
- Type: Validation
- Summary: The roadmap modal follow-up passed focused lint, a production build, and protected-preview Playwright validation against the latest branch-head deployment after the selector sizing and milestone-header refinements landed.
- Evidence: `npm run lint -- components/project-roadmap-panel.tsx`; env-overridden `npm run build`; workflow `Deploy Vercel (CD + Rollback)` run to be refreshed for the latest branch head with explicit `git_ref=feature/task-130-roadmap-groups`; preview Playwright smoke `npx playwright test tests/e2e/smoke-project-task-calendar.spec.ts --grep 'roadmap event-first milestone flow'`.

### 2026-04-24
- Type: Execution
- Summary: TASK-130 was refined into an event-first roadmap experience: the dashboard now creates `New event` items directly, treats milestones as structural lanes instead of authored cards, moves roadmap below Kanban, keeps drag handles inside event cards, supports regrouping events into existing milestones or a new trailing milestone lane, and fixes roadmap dialogs so they render as true viewport overlays.
- Evidence: Updated `components/project-roadmap-panel.tsx`, `app/projects/[projectId]/page.tsx`, `tests/components/project-roadmap-panel.test.tsx`, `tests/e2e/smoke-project-task-calendar.spec.ts`, `tasks/current.md`, `README.md`, and `project.md`; commit `186eeac`; PR `#198`.

### 2026-04-24
- Type: Validation
- Summary: The event-first TASK-130 refinement passed lint, a production build with repo-aligned preview-safe env overrides, and protected-preview Playwright validation on the deployed branch preview, including the full critical dashboard smoke suite.
- Evidence: `npm run lint -- components/project-roadmap-panel.tsx app/projects/[projectId]/page.tsx tests/components/project-roadmap-panel.test.tsx tests/e2e/smoke-project-task-calendar.spec.ts`; env-overridden `npm run build` with direct Supabase host plus `GOOGLE_TOKEN_ENCRYPTION_KEY` and `AGENT_TOKEN_SIGNING_SECRET`; workflow `Deploy Vercel (CD + Rollback)` run `24877497847` with explicit `git_ref=feature/task-130-roadmap-groups`; log evidence shows `actions/checkout@v6`, `ref: feature/task-130-roadmap-groups`, and `git checkout --progress --force -B feature/task-130-roadmap-groups`; preview URL `https://nexus-dash-27ddw5ukv-dorian-agaesses-projects.vercel.app`; `.env`-loaded `PLAYWRIGHT_BASE_URL=https://nexus-dash-27ddw5ukv-dorian-agaesses-projects.vercel.app` plus `VERCEL_AUTOMATION_BYPASS_SECRET=...` with `npx playwright test tests/e2e/smoke-project-task-calendar.spec.ts --grep 'roadmap event-first milestone flow'` passed and the full `npx playwright test tests/e2e/smoke-project-task-calendar.spec.ts` suite passed (`5 passed`).

### 2026-04-23
- Type: Execution
- Summary: TASK-130 replaced the flat roadmap milestone strip with a grouped roadmap model built around milestone phases plus child events, preserving existing roadmap data through migration and adding direct dashboard editing with drag-and-drop sequencing for both phases and events.
- Evidence: Replaced `RoadmapMilestone` with `RoadmapPhase` and `RoadmapEvent` in `prisma/schema.prisma` plus migration `prisma/migrations/20260423201000_task130_roadmap_v2/migration.sql`; rewrote roadmap services/routes in `lib/services/project-roadmap-service.ts` and `app/api/projects/[projectId]/roadmap/**`; rebuilt the grouped roadmap UI in `components/project-roadmap-panel.tsx` and `app/projects/[projectId]/project-roadmap-panel-section.tsx`; updated roadmap docs in `README.md`, `project.md`, `tasks/current.md`, and `tasks/backlog.md`; PR `#198`.

### 2026-04-23
- Type: Validation
- Summary: TASK-130 passed local Prisma regeneration, focused roadmap regressions, lint, production build, and protected-preview Playwright validation after adding explicit Vercel preview-bypass header support so the smoke suite could target deployed branch previews directly and after addressing the remaining Copilot review follow-ups.
- Evidence: `npx -y node@22 node_modules\\prisma\\build\\index.js generate`; `npx -y node@22 node_modules\\vitest\\vitest.mjs run tests/api/project-roadmap.route.test.ts tests/components/project-roadmap-panel.test.tsx tests/lib/project-roadmap-service.test.ts`; `npm run lint`; env-loaded `npm run build` with preview-safe overrides for `DIRECT_URL`, `VERCEL_ENV`, `RESEND_API_KEY`, `AGENT_TOKEN_SIGNING_SECRET`, and `GOOGLE_TOKEN_ENCRYPTION_KEY`; workflow `Deploy Vercel (CD + Rollback)` run `24863190808` with `action=deploy-preview` and explicit `git_ref=feature/task-130-roadmap-groups`; log evidence shows `actions/checkout@v6`, `ref: feature/task-130-roadmap-groups`, and `git checkout --progress --force -B feature/task-130-roadmap-groups`; preview URL `https://nexus-dash-kcse5jmrn-dorian-agaesses-projects.vercel.app`; `PLAYWRIGHT_BASE_URL=https://nexus-dash-kcse5jmrn-dorian-agaesses-projects.vercel.app` plus `VERCEL_AUTOMATION_BYPASS_SECRET=...` with `npx -y node@22 node_modules\\playwright\\cli.js test tests/e2e/smoke-project-task-calendar.spec.ts` passed (`5 passed`).

### 2026-04-23
- Type: Execution
- Summary: TASK-106 roadmap follow-up refined the first milestone UI by removing the persistent explanatory hero copy, replacing the long desktop cross-rail with a card-to-card journey treatment, deduplicating deadline display, clamping card descriptions, and adding a dedicated milestone detail view triggered by a `View` action.
- Evidence: Updated `components/project-roadmap-panel.tsx`, added roadmap detail-view regression coverage in `tests/components/project-roadmap-panel.test.tsx`, and recorded the future section-help affordance follow-up in `tasks/backlog.md` as `TASK-134` (originally `TASK-129`, renumbered to resolve a duplicate-ID conflict).

### 2026-04-22
- Type: Execution
- Summary: TASK-107 follow-up refined the epic registry UX to sit between project context and Kanban, removed the extra epic-header subtitle for better section consistency, made `New epic` expand the collapsed section before opening the form, and replaced the full-card light gradient treatment with a more consistent accent-strip/card treatment that stays readable in dark mode.
- Evidence: Updated `app/projects/[projectId]/page.tsx`, `components/project-epic-panel.tsx`, and added focused regression coverage in `tests/components/project-epic-panel.test.tsx`.

### 2026-04-22
- Type: Execution
- Summary: Hardened the new epic server section so an epic-fetch failure no longer crashes the whole project page; the section now logs the server error and degrades to an inline epic-panel warning instead of surfacing a route-level error boundary.
- Evidence: Updated `app/projects/[projectId]/project-epic-panel-section.tsx` to catch/log `listProjectEpics(...)` failures and render `ProjectEpicPanel` with a temporary load error banner.

### 2026-04-22
- Type: Governance
- Summary: Clarified the repository release workflow so coding tasks are not considered handoff-ready without an open PR, and branch-scoped preview validation now explicitly requires passing the branch `git_ref` and confirming from workflow logs that the requested branch ref was checked out.
- Evidence: Updated `agent.md` execution-contract bullets covering mandatory PR creation, branch-ref preview invocation, and workflow-log verification expectations.

### 2026-04-22
- Type: Execution
- Summary: TASK-107 implemented project-scoped epics end to end as dedicated planning entities with CRUD support, nullable task-to-epic links, automatic epic status/progress rollups, a colorful project epic registry section, and epic visibility across task create/edit/detail/Kanban plus agent-facing API documentation.
- Evidence: Added `Epic` plus `Task.epicId` in `prisma/schema.prisma` with migration `prisma/migrations/20260422103000_task107_project_epics/migration.sql`; added `lib/epic.ts` and `lib/services/project-epic-service.ts`; added epic routes in `app/api/projects/[projectId]/epics/route.ts` and `app/api/projects/[projectId]/epics/[epicId]/route.ts`; updated task/project service and API contracts in `lib/services/project-service.ts`, `lib/services/project-task-service.ts`, `app/api/projects/[projectId]/tasks/route.ts`, and `app/api/projects/[projectId]/tasks/[taskId]/route.ts`; added the project epic section and epic task surfaces in `app/projects/[projectId]/project-epic-panel-section.tsx`, `components/project-epic-panel.tsx`, `components/create-task-dialog.tsx`, `components/kanban-board.tsx`, `components/kanban/kanban-columns-grid.tsx`, `components/kanban/task-detail-modal.tsx`, and related onboarding/docs updates in `lib/agent-onboarding.ts`, `components/agent-onboarding/agent-onboarding-guide.tsx`, and `project.md`.

### 2026-04-22
- Type: Validation
- Summary: TASK-107 local validation passed for lint, focused regressions, full Vitest, coverage, Prisma client generation, and production build; the follow-up Copilot review fixes also passed the same baseline after tightening epic form close-state handling and aligning epic name uniqueness with the database layer.
- Evidence: `npm run lint`; `npx -y -p node@20.19.0 node .\\node_modules\\prisma\\build\\index.js generate`; `npx -y -p node@20.19.0 node .\\node_modules\\vitest\\vitest.mjs run tests\\lib\\project-epic-service.test.ts tests\\lib\\epic.test.ts tests\\api\\project-epics.route.test.ts --pool=threads --maxWorkers=1 --no-file-parallelism`; `$env:DATABASE_URL='postgresql://localhost:5432/postgres'; $env:DIRECT_URL='postgresql://localhost:5433/postgres'; npx -y -p node@20.19.0 node .\\node_modules\\vitest\\vitest.mjs run --pool=threads --maxWorkers=1 --no-file-parallelism`; same env with `--coverage`; same env plus `GOOGLE_TOKEN_ENCRYPTION_KEY` and `AGENT_TOKEN_SIGNING_SECRET` with `npx -y -p node@20.19.0 node .\\node_modules\\next\\dist\\bin\\next build`.

### 2026-04-22
- Type: Blocker
- Summary: TASK-107 local Playwright coverage remains blocked in this workstation session before browser interaction because the required PostgreSQL-backed fixture state is unavailable, so authenticated E2E seed user creation fails before the app can boot into the smoke flows.
- Evidence: `$env:DATABASE_URL='postgresql://localhost:5432/postgres'; $env:DIRECT_URL='postgresql://localhost:5433/postgres'; $env:GOOGLE_TOKEN_ENCRYPTION_KEY='0123456789abcdef0123456789abcdef'; $env:AGENT_TOKEN_SIGNING_SECRET='0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'; npx -y -p node@20.19.0 node .\\node_modules\\playwright\\cli.js test` failed in `tests/e2e/password-recovery.spec.ts` and `tests/e2e/helpers/auth-helpers.ts` with `PrismaClientKnownRequestError` during `prisma.user.create(...)` setup.

### 2026-04-21
- Type: Execution
- Summary: TASK-101 implemented first-class task ownership and provenance end to end so tasks now persist creator, updater, and optional assignee metadata and surface avatar-backed attribution across task cards, task detail, create/edit flows, comments, and task-related attachment activity.
- Evidence: Added task ownership fields plus migration `prisma/migrations/20260421131500_task101_task_ownership_and_provenance/migration.sql`; updated `prisma/schema.prisma`, `lib/services/project-task-service.ts`, `lib/services/project-service.ts`, `lib/services/project-task-comment-service.ts`, `lib/services/project-attachment-service.ts`, `app/api/projects/[projectId]/tasks/route.ts`, `app/projects/[projectId]/kanban-board-section.tsx`, `components/kanban-board.tsx`, `components/kanban/task-detail-modal.tsx`, `components/kanban/kanban-columns-grid.tsx`, `components/create-task-dialog.tsx`, `components/kanban-board-types.ts`, `lib/agent-onboarding.ts`, and related API/service tests.

### 2026-04-21
- Type: Validation
- Summary: TASK-101 local validation passed for lint, targeted regressions, full Vitest suite, coverage, and production build after regenerating Prisma client artifacts with a Node `20.19.0` runtime compatible with the current Prisma `7.7` toolchain.
- Evidence: `npm run lint`; `npx vitest run tests/lib/project-attachment-service.test.ts tests/api/task-create.route.test.ts tests/api/task-comments.route.test.ts tests/api/task-update.route.test.ts tests/api/tasks-reorder.route.test.ts tests/api/agent-project-routes.test.ts tests/lib/project-service.test.ts`; `$env:DATABASE_URL='postgresql://localhost:5432/postgres'; $env:DIRECT_URL='postgresql://localhost:5432/postgres'; npx -y -p node@20.19.0 node .\\node_modules\\vitest\\vitest.mjs run`; same env with `--coverage`; `npx -y -p node@20.19.0 node .\\node_modules\\prisma\\build\\index.js generate`; `$env:DATABASE_URL='postgresql://localhost:5432/postgres'; $env:DIRECT_URL='postgresql://localhost:5433/postgres'; $env:GOOGLE_TOKEN_ENCRYPTION_KEY='0123456789abcdef0123456789abcdef'; $env:AGENT_TOKEN_SIGNING_SECRET='0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'; npm run build`.

### 2026-04-21
- Type: Blocker
- Summary: TASK-101 local Playwright validation is blocked before browser interaction because Playwright boots against the shared `.env` database, and that database has not yet had the TASK-101 ownership/provenance migration applied.
- Evidence: `$env:DATABASE_URL='postgresql://localhost:5432/postgres'; $env:DIRECT_URL='postgresql://localhost:5433/postgres'; $env:GOOGLE_TOKEN_ENCRYPTION_KEY='0123456789abcdef0123456789abcdef'; npx -y -p node@20.19.0 node .\\node_modules\\playwright\\cli.js test` failed during seed user creation in `tests/e2e/helpers/auth-helpers.ts` / `tests/e2e/password-recovery.spec.ts` with `PrismaClientKnownRequestError` before UI flow execution; the controlled preview deployment workflow applies migrations and is the safe place to complete browser verification.

### 2026-04-21
- Type: Execution
- Summary: TASK-089 follow-up extended the generated-avatar rollout by lowering pixel density, rendering avatars in task comments, and adding avatars to the project settings contributors list while keeping the same shared avatar primitive and collaborator/comment identity contracts.
- Evidence: Updated `lib/avatar.ts`, `lib/services/project-task-comment-service.ts`, `components/kanban/task-detail-modal.tsx`, `lib/services/project-collaboration-service.ts`, `components/project-dashboard/project-dashboard-owner-access-panel.tsx`, `components/project-dashboard/project-dashboard-owner-actions.shared.ts`, `lib/agent-onboarding.ts`, `tasks/current.md`, and related tests in `tests/api/task-comments.route.test.ts` plus `tests/components/project-dashboard-owner-access-panel.test.tsx`.

### 2026-04-21
- Type: Validation
- Summary: TASK-089 local validation passed for lint, full Vitest suite, coverage, Prisma client regeneration, and production build after running the repo toolchain on Node `20.19.0`, which matches the current Prisma/Next baseline better than the workstation default Node `20.17.0`.
- Evidence: `npm run lint`; `$env:DATABASE_URL='postgresql://user:pass@127.0.0.1:5432/postgres?sslmode=require'; $env:DIRECT_URL='postgresql://user:pass@127.0.0.1:5433/postgres?sslmode=require'; $env:RESEND_API_KEY='test-resend-key'; $env:GOOGLE_TOKEN_ENCRYPTION_KEY='0123456789abcdef0123456789abcdef'; $env:AGENT_TOKEN_SIGNING_SECRET='0123456789abcdef0123456789abcdef'; npx -y -p node@20.19.0 node .\\node_modules\\vitest\\vitest.mjs run`; same env with `--coverage`; same env with `npx -y -p node@20.19.0 node .\\node_modules\\next\\dist\\bin\\next build`; `npx -y -p node@20.19.0 node .\\node_modules\\prisma\\build\\index.js generate`.

### 2026-04-21
- Type: Blocker
- Summary: TASK-089 browser-based Playwright validation remains blocked in this workstation session because the local PostgreSQL fixture service expected by the authenticated app flow is unreachable, so the app cannot boot into a usable browser test target.
- Evidence: `Test-NetConnection -ComputerName 127.0.0.1 -Port 5432` returned `TcpTestSucceeded : False`; `playwright.config.ts` expects a local app server backed by the project database.

### 2026-04-21
- Type: Execution
- Summary: TASK-089 implemented the generated avatar baseline end to end with persisted avatar seeds, deterministic pixel-avatar rendering, account-page regeneration, and first-party rollout across the top-right account affordance plus account/settings identity surfaces.
- Evidence: Added `avatarSeed` to `User` in `prisma/schema.prisma` plus migration `prisma/migrations/20260421103000_task089_generated_avatar_baseline/migration.sql`; added `lib/avatar.ts` and `components/ui/user-avatar.tsx`; updated account identity/profile flows in `lib/services/account-identity-service.ts`, `lib/services/account-profile-service.ts`, and `app/account/actions.ts`; updated UI consumers in `app/account/page.tsx`, `components/account-menu.tsx`, `components/top-right-controls.tsx`, `components/account/account-settings-shell.tsx`, `app/account/settings/page.tsx`, and `app/account/settings/developers/page.tsx`; added avatar coverage in `tests/lib/avatar.test.ts` and refreshed affected account/menu tests.

### 2026-04-19
- Type: Governance
- Summary: TASK-099 shipped to PR `#180`, initial Copilot review completed with two actionable comments, both were applied in follow-up commit `94b534a` and the review threads were replied to and resolved before handoff.
- Evidence: PR `#180`; implementation commit `97bb45c`; follow-up review-response commit `94b534a`; resolved threads on `components/kanban-board.tsx` and `components/kanban/task-detail-modal.tsx`; latest PR checks passed (`check-name`, `Quality Core`, `E2E Smoke`, `Container Image`).

### 2026-04-19
- Type: Validation
- Summary: TASK-099 branch preview deployment completed successfully from the latest reviewed branch head through the manual Vercel workflow.
- Evidence: Workflow `Deploy Vercel (CD + Rollback)` run `24616376957` with `action=deploy-preview` and `git_ref=feature/task-099-task-comments`; preview URL `https://nexus-dash-f73912u3w-dorian-agaesses-projects.vercel.app`.

### 2026-04-19
- Type: Execution
- Summary: TASK-099 implemented project-scoped task comments end to end with append-only persistence, RLS-aware service/API handling, lazy-loaded task threads, lightweight board comment metadata, and aligned agent onboarding/OpenAPI documentation.
- Evidence: Added `TaskComment` in `prisma/schema.prisma` plus migration `prisma/migrations/20260419110000_task099_task_comments/migration.sql`; added `lib/services/project-task-comment-service.ts` and `app/api/projects/[projectId]/tasks/[taskId]/comments/route.ts`; updated task payloads in `lib/services/project-service.ts`, `lib/services/project-task-service.ts`, and `app/api/projects/[projectId]/tasks/route.ts`; wired thread UI in `components/kanban-board.tsx`, `components/kanban/task-detail-modal.tsx`, `components/kanban/kanban-columns-grid.tsx`, and `app/projects/[projectId]/kanban-board-section.tsx`; updated agent docs in `lib/agent-onboarding.ts` and `components/agent-onboarding/agent-onboarding-guide.tsx`; refreshed tracking docs in `tasks/current.md`, `tasks/backlog.md`, and `project.md`.

### 2026-04-19
- Type: Validation
- Summary: TASK-099 local validation passed for lint, full Vitest suite, coverage, production build, schema migration, and focused Playwright smoke after forcing a fresh `next start` instance on an alternate port instead of reusing an unrelated local process on `3000`.
- Evidence: `npm run lint`; `$env:DATABASE_URL='postgresql://user:pass@localhost:5432/postgres'; $env:DIRECT_URL='postgresql://user:pass@localhost:5432/postgres'; $env:VERCEL_ENV='preview'; $env:RESEND_API_KEY='test-resend-key'; $env:GOOGLE_TOKEN_ENCRYPTION_KEY='0123456789abcdef0123456789abcdef'; $env:AGENT_TOKEN_SIGNING_SECRET='0123456789abcdef0123456789abcdef'; npx -y -p node@20.19.0 node .\\node_modules\\vitest\\vitest.mjs run`; same env with `--coverage`; same env with `npx -y -p node@20.19.0 node .\\node_modules\\next\\dist\\bin\\next build`; repo `.env` loaded with `npx -y -p node@20.19.0 node .\\node_modules\\prisma\\build\\index.js migrate deploy`; repo `.env` loaded with `$env:CI='1'; $env:PORT='3001'; npx playwright test tests/e2e/smoke-project-task-calendar.spec.ts`.

### 2026-04-17
- Type: Execution
- Summary: TASK-117 implemented first-class task deadlines end to end with a date-only task contract, urgency-aware board/task UI, deadline-aware task service/API handling, and aligned agent onboarding/OpenAPI docs.
- Evidence: Added `lib/task-deadline.ts` and migration `prisma/migrations/20260417153000_task117_task_deadlines/migration.sql`; updated `prisma/schema.prisma`, `lib/services/project-task-service.ts`, `app/api/projects/[projectId]/tasks/route.ts`, `app/projects/[projectId]/kanban-board-section.tsx`, `components/create-task-dialog.tsx`, `components/kanban-board.tsx`, `components/kanban/kanban-board-header.tsx`, `components/kanban/kanban-columns-grid.tsx`, `components/kanban/task-detail-modal.tsx`, `components/kanban-board-types.ts`, `lib/agent-onboarding.ts`, `tasks/current.md`, and deadline-related tests under `tests/api/**`, `tests/components/**`, and `tests/lib/task-deadline.test.ts`.

### 2026-04-17
- Type: Validation
- Summary: TASK-117 validation passed for lint, targeted deadline regressions, full Vitest suite, coverage, and production build after running the repo toolchain on a Node `20.19.0` runtime compatible with the current Prisma/Next baseline.
- Evidence: `npm run lint`; `$env:DATABASE_URL='postgresql://user:pass@localhost:5432/postgres'; $env:DIRECT_URL='postgresql://user:pass@localhost:5432/postgres'; $env:VERCEL_ENV='preview'; $env:RESEND_API_KEY='test-resend-key'; $env:GOOGLE_TOKEN_ENCRYPTION_KEY='0123456789abcdef0123456789abcdef'; $env:AGENT_TOKEN_SIGNING_SECRET='0123456789abcdef0123456789abcdef'; npx -y -p node@20.19.0 node .\\node_modules\\vitest\\vitest.mjs run`; same env with `--coverage`; same env with `npx -y -p node@20.19.0 node .\\node_modules\\next\\dist\\bin\\next build`; targeted local slice also passed with `npx vitest run tests/lib/task-deadline.test.ts tests/api/task-create.route.test.ts tests/api/task-update.route.test.ts tests/api/agent-project-routes.test.ts tests/api/agent-openapi.route.test.ts tests/components/agent-onboarding-guide.test.ts tests/lib/project-service.test.ts`.

### 2026-04-17
- Type: Blocker
- Summary: TASK-117 local Playwright smoke validation could not run in this workstation session because the required PostgreSQL fixture service is unreachable and Docker Desktop is unavailable, so the app cannot boot for browser-based verification.
- Evidence: `Test-NetConnection -ComputerName 127.0.0.1 -Port 5432` returned `TcpTestSucceeded : False`; `docker ps` failed with missing `dockerDesktopLinuxEngine` pipe while `playwright.config.ts` expects a local `next start` server backed by the app database.

### 2026-04-17
- Type: Execution
- Summary: Fixed the shared calendar datepicker so its popup renders through a body portal instead of inside scrollable modal content, preventing Google Calendar event dialogs from growing inner scrollbars when the picker opens.
- Evidence: Updated `components/calendar-date-time-field.tsx` to portal the picker surface, track trigger position on resize/scroll, and preserve outside-click dismissal across the portaled popup.

### 2026-04-17
- Type: Validation
- Summary: Datepicker overflow follow-up validated with lint, a focused picker regression test, and a production build on the repo's Node `20.19.0` toolchain.
- Evidence: `npm run lint`; `npx -y -p node@20.19.0 node .\\node_modules\\vitest\\vitest.mjs run tests/components/calendar-date-time-field.test.ts`; `$env:DATABASE_URL='postgresql://user:pass@localhost:5432/postgres'; $env:DIRECT_URL='postgresql://user:pass@localhost:5432/postgres'; $env:VERCEL_ENV='preview'; $env:RESEND_API_KEY='test-resend-key'; $env:GOOGLE_TOKEN_ENCRYPTION_KEY='0123456789abcdef0123456789abcdef'; $env:AGENT_TOKEN_SIGNING_SECRET='0123456789abcdef0123456789abcdef'; npx -y -p node@20.19.0 node .\\node_modules\\next\\dist\\bin\\next build`.

### 2026-04-15
- Type: Planning
- Summary: Started `TASK-105` on a dedicated `docs/task-105-convex-assessment` branch, moved it to the top of the execution queue, replaced `tasks/current.md`, and drafted the initial Convex migration assessment plus architecture decision update.
- Evidence: Reviewed `project.md`, `README.md`, `prisma/schema.prisma`, `prisma/migrations/**`, `lib/services/rls-context.ts`, `lib/services/project-access-service.ts`, `lib/services/project-service.ts`, `lib/services/project-task-service.ts`, `lib/services/project-collaboration-service.ts`, `lib/services/project-agent-access-service.ts`, `lib/services/session-service.ts`, `lib/services/calendar-service.ts`, and `lib/auth/api-guard.ts`; consulted official docs at `https://docs.convex.dev/functions`, `https://docs.convex.dev/realtime`, `https://docs.convex.dev/database/schemas`, `https://docs.convex.dev/auth/convex-auth`, `https://docs.convex.dev/scheduling/scheduled-functions`, `https://docs.convex.dev/file-storage`, `https://docs.convex.dev/database/import-export`, `https://docs.convex.dev/database/backup-restore`, `https://supabase.com/docs/guides/auth`, `https://supabase.com/docs/guides/database/postgres/row-level-security`, `https://supabase.com/docs/guides/realtime/postgres-changes`, `https://supabase.com/docs/guides/database/prisma`, and `https://supabase.com/docs/guides/deployment/branching`.

### 2026-04-15
- Type: Validation
- Summary: Opened PR `#176`, let CI complete, waited for Copilot's initial review, and applied the one valid documentation follow-up by aligning the task ADR status with the repository ADR template.
- Evidence: PR `#176`; checks `check-name`, `Quality Core (lint, test, coverage, build)`, `E2E Smoke (Playwright)`, and `Container Image (build + metadata artifact)` passed; Copilot review `pullrequestreview-4116748451` left inline comment `3089308118`, addressed by changing `adr/task-105-convex-migration-assessment.md` to `Status: Accepted`.

### 2026-04-14
- Type: Validation
- Summary: TASK-091 mobile QA passed across the priority small-screen flows on `390x844` and `360x800`, confirming no horizontal overflow on home, projects, workspace, and the task/context modal paths while keeping modal primary actions reachable inside the viewport.
- Evidence: `npm run lint`; Playwright mobile checks against `http://localhost:3000` with screenshots `home-qa-390.png`, `projects-qa-390.png`, `workspace-qa-390.png`, `task-create-modal-390.png`, `task-detail-modal-390.png`, `context-create-modal-390.png`, `context-preview-modal-390.png`, plus matching `360px` captures; metrics and overflow results recorded in `.tmp/task-091-qa-results.json`.

### 2026-04-14
- Type: Execution
- Summary: TASK-091 completed the baseline responsive adaptation pass by reordering home mobile auth prominence, reducing workspace compression, converting shared task/context/confirm flows to mobile bottom-sheet behavior, and replacing the calendar's phone-sized horizontal week grid with a stacked mobile week view.
- Evidence: Updated `app/page.tsx`, `app/projects/page.tsx`, `app/projects/[projectId]/page.tsx`, `app/projects/projects-grid-client.tsx`, `components/create-project-dialog.tsx`, `components/create-task-dialog.tsx`, `components/ui/confirm-dialog.tsx`, `components/context-panel/context-modal-frame.tsx`, `components/context-panel/context-preview-modal.tsx`, `components/context-panel/context-create-modal.tsx`, `components/context-panel/context-edit-modal.tsx`, `components/kanban/task-detail-modal.tsx`, `components/calendar-panel/calendar-event-modal.tsx`, `components/calendar-panel/calendar-week-grid.tsx`, `components/project-context-panel.tsx`, `components/project-calendar-panel.tsx`, `components/kanban/kanban-board-header.tsx`, `components/project-dashboard/project-dashboard-owner-actions.tsx`, and related dashboard spacing/stat files.

### 2026-04-13
- Type: Validation
- Summary: TASK-051 closed the security-baseline verification pass by confirming the merged TASK-050 implementation still matches the original TASK-049 findings, pulling preserved CI evidence from PR `#161`, and recording the current local replay blockers precisely.
- Evidence: `git diff --name-only a1bc590..HEAD -- lib app prisma tests README.md journal.md tasks adr` showed no drift in the security-critical implementation; `gh pr checks 161 --repo dorianagaesse/nexus_dash` confirmed passing `check-name`, `Quality Core`, `E2E Smoke`, and `Container Image`; `gh run list --repo dorianagaesse/nexus_dash --branch fix/task-050-security-remediation --limit 10` confirmed successful branch-scoped `Quality Gates`, `Check Branch Name`, and preview deploy runs; attempted `npx vitest run tests/lib/session-service-storage.test.ts tests/lib/credential-auth-service.test.ts tests/app/forgot-password-actions.test.ts tests/app/verify-email-actions.test.ts tests/lib/project-agent-access-exchange.test.ts tests/lib/project-agent-access-service.test.ts tests/lib/api-guard.test.ts` and `npm install`, both blocked locally because this workstation is on Node `20.17.0` while Prisma 7 in this repo requires Node `^20.19 || ^22.12 || >=24.0`.

### 2026-04-13
- Type: Execution
- Summary: TASK-051 produced the closure report for the TASK-049/TASK-050 security baseline, marked TASK-051 complete, and corrected the README Node prerequisite to match the current Prisma/Next toolchain floor.
- Evidence: Updated `tasks/current.md`, `tasks/task-051-security-verification-and-closure-report.md`, `tasks/backlog.md`, `journal.md`, and `README.md`.

### 2026-04-13
- Type: Validation
- Summary: TASK-120 follow-up validated on PR `#167` with all required checks green, Copilot review comments addressed/resolved, and a manual preview deploy confirmed from branch `fix/task-120-dependabot-repair-followup`.
- Evidence: PR `#167`; commits `9271309` and `5629103`; green runs `24343300501` (`check-name`) and `24343300445` (`Quality Core`, `E2E Smoke`, `Container Image`); resolved review threads `PRRT_kwDORPDIrs56hcqG`, `PRRT_kwDORPDIrs56hcqw`, and `PRRT_kwDORPDIrs56hcrA`; preview deploy run `24343028393` checked out `fix/task-120-dependabot-repair-followup` and published `https://nexus-dash-itlv8pqfw-dorian-agaesses-projects.vercel.app`.

### 2026-04-13
- Type: Execution
- Summary: TASK-120 hardened the Dependabot follow-up flow by reclassifying failed safe-lane PRs out of `dependabot:auto-merge`, broadening the repair scanner to any red Dependabot PR, and moving the Copilot repair context into the repo so the agent can finally write/read its machine-readable result.
- Evidence: Updated `.github/workflows/dependabot-auto-triage.yml`, `.github/workflows/dependabot-repair-agent.yml`, `scripts/dependabot_repair_agent.py`, `README.md`, `tasks/current.md`, and `tasks/backlog.md`; fix addresses live red PR behavior seen on Dependabot PRs `#162`, `#163`, and `#164`.

### 2026-04-10
- Type: Validation
- Summary: Investigated a broken TASK-050 preview and traced `GET /` runtime failures to Prisma's `@prisma/adapter-pg` path interpreting `sslmode=require` as certificate-verifying TLS against the Supabase pooler; fixed the runtime client to add `uselibpqcompat=true` for `sslmode=require`, which matches libpq semantics and restores preview connectivity.
- Evidence: `npx vercel logs https://nexus-dash-87wiabtci-dorian-agaesses-projects.vercel.app --no-follow --since 6h --level error --expand`; `npx vercel curl / --deployment https://nexus-dash-87wiabtci-dorian-agaesses-projects.vercel.app`; one-off `pg` reproduction against preview `DATABASE_URL` showing raw connection failure and success after appending `uselibpqcompat=true`; updated `lib/env.server.ts`, `lib/prisma.ts`, and `tests/lib/env.server.test.ts`; validated with `npm test -- --run tests/lib/env.server.test.ts`, `npm run lint`, and `npm run build`.

### 2026-04-10
- Type: Governance
- Summary: Tightened the TASK-050 execution contract by adding explicit expected output, acceptance criteria, and definition of done, and updated the repo operating guide so future task briefs must include acceptance criteria plus DoD before implementation starts.
- Evidence: Updated `tasks/current.md` and `agent.md`.

### 2026-04-10
- Type: Execution
- Summary: TASK-050 implemented the ranked security remediation slice from `TASK-049` by adding PostgreSQL-backed abuse controls on public auth/token exchange paths, hashing human session tokens at rest, and enforcing request-time credential liveness for agent bearer-token usage.
- Evidence: Updated `lib/services/auth-abuse-control-service.ts`, `lib/services/credential-auth-service.ts`, `app/forgot-password/actions.ts`, `app/verify-email/actions.ts`, `lib/services/session-service.ts`, `lib/services/project-agent-access-service.ts`, `lib/auth/api-guard.ts`, `app/api/auth/agent/token/route.ts`, `prisma/schema.prisma`, and migration `prisma/migrations/20260410110000_task050_security_remediation/migration.sql`.

### 2026-04-10
- Type: Governance
- Summary: TASK-050 security implementation was locked with an explicit architecture record covering DB-backed abuse buckets, one-time legacy session invalidation, and immediate-effect agent credential liveness checks.
- Evidence: Added `adr/task-050-security-remediation-adr.md` and updated `adr/decisions.md`.

### 2026-04-10
- Type: Validation
- Summary: TASK-050 local validation passed for lint, unit tests, coverage, and production build after syncing the Prisma 7 / Next 16 toolchain in this checkout and regenerating the Prisma client on a Node 20.19 runtime.
- Evidence: `npm run lint`; `npm test`; `npm run test:coverage`; `$env:DATABASE_URL='postgresql://user:pass@localhost:5432/postgres'; $env:DIRECT_URL='postgresql://user:pass@127.0.0.1:5433/postgres'; $env:VERCEL_ENV='preview'; $env:RESEND_API_KEY='test-resend-key'; $env:GOOGLE_TOKEN_ENCRYPTION_KEY='0123456789abcdef0123456789abcdef'; $env:AGENT_TOKEN_SIGNING_SECRET='0123456789abcdef0123456789abcdef'; npm run build`; `npx prisma generate`.

### 2026-04-10
- Type: Blocker
- Summary: TASK-050 local Playwright smoke validation remains environment-blocked because the PostgreSQL fixture service expected at `127.0.0.1:5432` is unreachable in this workstation session.
- Evidence: `$env:DATABASE_URL='postgresql://user:pass@127.0.0.1:5432/postgres'; $env:DIRECT_URL='postgresql://user:pass@127.0.0.1:5433/postgres'; $env:VERCEL_ENV='preview'; $env:RESEND_API_KEY='test-resend-key'; $env:GOOGLE_TOKEN_ENCRYPTION_KEY='0123456789abcdef0123456789abcdef'; $env:AGENT_TOKEN_SIGNING_SECRET='0123456789abcdef0123456789abcdef'; npm run test:e2e` built successfully, then all 6 Playwright specs failed with `PrismaClientKnownRequestError: Can't reach database server at 127.0.0.1:5432`.

### 2026-04-09
- Type: Validation
- Summary: The repaired rerun on Dependabot PR `#133` finally created fresh retry PR `#153` and dispatched the required workflows, but GitHub branch protection still showed no required checks on the PR until the same successful results were mirrored into commit statuses for the repair-branch head SHA.
- Evidence: Actions run `24202784221`; superseding PR `#153`; `gh api /commits/0baa776.../check-runs` showed all four required runs associated with PR `#153` while `gh pr checks 153` still returned no checks until matching commit statuses were posted.

### 2026-04-09
- Type: Validation
- Summary: The next live rerun on Dependabot PR `#133` proved the repair lane was finally building branches from current `main`, but GitHub still refused to reopen the previously closed superseding PR `#150`, so TASK-116 needs one more follow-up to create a fresh retry review surface instead of reusing a closed PR.
- Evidence: Actions run `24201632661`; traceback at `create_superseding_pr()` shows `gh pr reopen 150` failed with `GraphQL: Could not open the pull request`; original Dependabot PR `#133` remained open and superseding PR `#150` remained closed.

### 2026-04-09
- Type: Validation
- Summary: A live main-branch rerun of the weekly TASK-116 repair lane on Dependabot PR `#133` finally reached a successful Copilot repair and created superseding PR `#148`, but the replacement PR never became mergeable because `GITHUB_TOKEN`-created PRs do not automatically trigger the repository's required workflows.
- Evidence: Actions run `24189096005`; replacement PR `#148`; run logs show Copilot produced a `fixed` result and then failed late on `gh pr create` policy before repo settings were updated, after which the generated PR still showed no status checks because no workflows had been triggered on its branch.

### 2026-04-09
- Type: Validation
- Summary: The first rerun after `#149` created superseding PR `#150` for Dependabot PR `#133`, but still closed it immediately because the repair branch had been created from the stale Dependabot head rather than current `main`, so the branch itself did not contain the new `workflow_dispatch` workflow definitions and GitHub rejected the explicit check dispatch.
- Evidence: Actions run `24198650964`; closed superseding PR `#150`; workflow comment on `#150` cites `HTTP 422: Workflow does not have 'workflow_dispatch' trigger` while `origin/main` already contains the updated `check-branch-names.yml` and `quality-gates.yml`.

### 2026-04-09
- Type: Validation
- Summary: A live manual dispatch of the weekly TASK-116 repair lane against Dependabot PR `#133` proved the workflow fails safely, but not yet successfully: the Copilot step could not find the prepared prompt file and fell back to the defer/manual-review path instead of producing a superseding PR or machine-readable result.
- Evidence: Actions run `24163757088`; original PR `#133` received a defer comment from `github-actions`; repair job logs show `cat: /home/runner/work/_temp/dependabot-repair/prompt.md: No such file or directory` immediately before the Copilot step exited.

### 2026-04-09
- Type: Execution
- Summary: TASK-116 live follow-up isolated and patched the weekly repair-lane orchestration bugs on branch `fix/task-116-repair-lane-followup`, including stale-script execution after Dependabot checkout, repo-root resolution from a copied orchestrator, targeted force-reruns for already-marked PR heads, finalize support for already-committed repair branches, and bounded replacement-PR bodies after a verbose Copilot summary broke `gh pr create`.
- Evidence: Branch `fix/task-116-repair-lane-followup`; validation runs `24164472211`, `24164505684`, and `24164768702`; updated `.github/workflows/dependabot-repair-agent.yml`, `scripts/dependabot_repair_agent.py`, `tasks/current.md`, and `tasks/task-116-ci-maintenance-and-workflow-hygiene.md`; branch run `24164505684` reached Copilot end to end on PR `#133`, and branch run `24164768702` successfully synthesized and pushed repo-owned repair branch `chore/task-116-repair-pr-133-9d4d38f` before failing late on replacement PR creation.

### 2026-04-08
- Type: Execution
- Summary: TASK-116 moved the bounded Dependabot repair lane from weekly-primary to event-driven-primary so failing/manual-review bot PRs can be triaged as their CI workflows complete, while keeping the scheduled/manual run as a backstop.
- Evidence: Updated `.github/workflows/dependabot-repair-agent.yml` to trigger on completed `Quality Gates`, `E2E Smoke`, and `Container Image` runs for `dependabot/*` pull requests; updated `scripts/dependabot_repair_agent.py` to target the exact triggering PR, no-op on green/safe bot PRs, and retain bounded batch scanning only for scheduled/manual runs.

### 2026-04-09
- Type: Execution
- Summary: TASK-116 replaced the earlier event-driven red-PR repair idea with the final weekly GitHub Copilot CLI repair lane so Dependabot maintenance stays separate from feature CI while still producing repo-owned superseding PRs for repaired updates.
- Evidence: Replaced `.github/workflows/dependabot-repair-agent.yml` with a weekly scanner plus Copilot repair workflow; added repository custom agent profile `.github/agents/dependabot-repair.agent.md`; rewrote `scripts/dependabot_repair_agent.py` to scan red/manual-review Dependabot PRs, prepare Copilot prompts, and deterministically create superseding PRs plus close original Dependabot PRs after successful repair.

### 2026-04-07
- Type: Validation
- Summary: TASK-116 needed a fourth live follow-up after the safe-lane merge job was counting its own skipped bookkeeping checks as incomplete status signals on PR `#137`.
- Evidence: Patched `.github/workflows/dependabot-auto-triage.yml` so the merge gate evaluates only the repository's required checks instead of every entry in `statusCheckRollup`.

### 2026-04-07
- Type: Validation
- Summary: TASK-116 needed a third live follow-up after the safe-lane merge job still exited early on PR `#137` because GitHub's status rollup lag briefly reported pending checks right after `Quality Gates` completed.
- Evidence: Patched `.github/workflows/dependabot-auto-triage.yml` so only `Quality Gates` completion triggers the merge lane and the merge job now retries the PR rollup for a short consistency window before giving up.

### 2026-04-07
- Type: Validation
- Summary: TASK-116 needed a second live follow-up after the safe-lane merge job rejected PR `#137` because the GitHub CLI surfaced the PR author as `app/dependabot` rather than `dependabot[bot]`.
- Evidence: Patched `.github/workflows/dependabot-auto-triage.yml` so the merge guard accepts both Dependabot author identifiers.

### 2026-04-07
- Type: Validation
- Summary: TASK-116 needed a post-merge workflow follow-up after live Dependabot PRs showed the new auto-triage job was failing because `gh pr edit` was running without a checked-out repository context.
- Evidence: Patched `.github/workflows/dependabot-auto-triage.yml` to check out the base repository before labeling and approving Dependabot PRs.

### 2026-04-07
- Type: Execution
- Summary: TASK-116 moved from deferred hygiene into the active execution queue and gained a bounded scheduled Dependabot repair agent that works only on failing/manual-review PRs through repo-owned superseding branches.
- Evidence: Added `.github/workflows/dependabot-repair-agent.yml` and `scripts/dependabot_repair_agent.py`; updated `tasks/backlog.md`, `tasks/current.md`, `tasks/task-116-ci-maintenance-and-workflow-hygiene.md`, and `README.md`.

### 2026-04-07
- Type: Governance
- Summary: TASK-116 narrowed the Dependabot operating model to grouped safe lanes with auto-approval/auto-merge after green CI, while explicitly keeping majors and high-churn packages in manual review.
- Evidence: Updated `.github/dependabot.yml` with grouped safe npm/GitHub Actions lanes; added `.github/workflows/dependabot-auto-triage.yml`; updated `README.md`, `tasks/current.md`, and `tasks/task-116-ci-maintenance-and-workflow-hygiene.md`.

### 2026-04-07
- Type: Planning
- Summary: TASK-116 now explicitly tracks a second automation tier for failing/manual-review Dependabot PRs: a bounded scheduled repair agent that works only through repo-owned superseding branches and final human review.
- Evidence: Expanded `tasks/current.md` and `tasks/task-116-ci-maintenance-and-workflow-hygiene.md` to distinguish the safe auto-merge lane from the future red-PR repair-agent lane.

### 2026-04-06
- Type: Governance
- Summary: TASK-116 closed the last open Dependabot maintenance queue by treating PR `#123` (ESLint 10) as a deliberate defer and codifying that decision so the next scheduled Dependabot run does not reopen the same blocked major update.
- Evidence: Commented `@dependabot ignore this major version` on PR `#123`; updated `.github/dependabot.yml` to ignore only `eslint` semver-major updates; recorded the compatibility rationale in `tasks/current.md` and `tasks/task-116-ci-maintenance-and-workflow-hygiene.md`.

### 2026-04-06
- Type: Validation
- Summary: TASK-116 Next 16 compatibility follow-through for failing Dependabot PR `#121` reached a locally buildable state after upgrading Next.js, migrating linting to the ESLint CLI, and renaming `middleware.ts` to `proxy.ts` to clear the framework deprecation warning.
- Evidence: `npm install next@^16.2.2`; `npm run lint`; `npx vitest run tests/middleware.test.ts`; `$env:DATABASE_URL='postgresql://user:pass@localhost:5432/postgres'; $env:DIRECT_URL='postgresql://user:pass@127.0.0.1:5433/postgres'; $env:VERCEL_ENV='preview'; $env:RESEND_API_KEY='test-resend-key'; $env:GOOGLE_TOKEN_ENCRYPTION_KEY='0123456789abcdef0123456789abcdef'; $env:AGENT_TOKEN_SIGNING_SECRET='0123456789abcdef0123456789abcdef'; npm run build`; `npm test`.

### 2026-04-06
- Type: Execution
- Summary: TASK-116 started the repo-owned replacement for Dependabot PR `#121` by upgrading Next.js to `16.2.2`, replacing the removed `next lint` command with the ESLint CLI, and migrating the API request-id hook from `middleware.ts` to the Next 16 `proxy.ts` convention.
- Evidence: Updated `package.json`, `package-lock.json`, `proxy.ts`, `tests/middleware.test.ts`, `tsconfig.json`, `tasks/current.md`, and `tasks/task-116-ci-maintenance-and-workflow-hygiene.md` on branch `chore/task-116-next-16-compat`.

### 2026-04-05
- Type: Execution
- Summary: TASK-116 updated the branch-name gate so Dependabot maintenance PRs can pass CI without weakening the stricter naming contract used for human task branches.
- Evidence: Updated `.github/workflows/check-branch-names.yml`, `agent.md`, `README.md`, `tasks/current.md`, and `tasks/task-116-ci-maintenance-and-workflow-hygiene.md`.

### 2026-04-06
- Type: Validation
- Summary: TASK-116 React 19 compatibility follow-through for failing Dependabot PR `#120` reached a locally buildable state after upgrading the React runtime/types plus `@hello-pangea/dnd`, with the only remaining local red signal coming from the existing `jsdom@29.0.1` worker startup issue on Node `20.17.0`.
- Evidence: `npm install react@^19.2.4 react-dom@^19.2.4 @types/react@^19 @types/react-dom@^19 @hello-pangea/dnd@^18.0.1`; `npm run lint`; `$env:DATABASE_URL='postgresql://user:pass@localhost:5432/postgres'; $env:DIRECT_URL='postgresql://user:pass@127.0.0.1:5433/postgres'; $env:VERCEL_ENV='preview'; $env:RESEND_API_KEY='test-resend-key'; $env:GOOGLE_TOKEN_ENCRYPTION_KEY='0123456789abcdef0123456789abcdef'; $env:AGENT_TOKEN_SIGNING_SECRET='0123456789abcdef0123456789abcdef'; npm run build`; `npm test`.

### 2026-04-06
- Type: Execution
- Summary: TASK-116 started the repo-owned replacement for Dependabot PR `#120` by upgrading the app to a coherent React 19 stack, moving `@hello-pangea/dnd` onto its React-19-compatible line, and fixing the first surfaced React-19 typing mismatch in the projects grid options menu.
- Evidence: Updated `package.json`, `package-lock.json`, `app/projects/projects-grid-client.tsx`, `tasks/current.md`, and `tasks/task-116-ci-maintenance-and-workflow-hygiene.md` on branch `chore/task-116-react-19-compat`.

### 2026-04-05
- Type: Governance
- Summary: TASK-049 was refreshed after `TASK-061` / PR `#116` was confirmed merged into `main`; the branch base was corrected and the security assessment remained valid without a full rerun.
- Evidence: Fast-forwarded local `main` to merged `origin/main`; refreshed `fix/task-049-security-assessment` onto that baseline; rechecked the report against the merged dependency/workflow updates in `package.json`, `.github/dependabot.yml`, `.github/workflows/dependency-security.yml`, `lib/services/session-service.ts`, and `lib/auth/api-guard.ts`.

### 2026-04-05
- Type: Execution
- Summary: TASK-049 completed an OWASP-focused security assessment and threat model against the implemented NexusDash surface, confirming strong core tenant/auth controls while ranking the main remaining remediation targets for TASK-050.
- Evidence: Added `tasks/task-049-security-assessment-and-threat-model.md`; updated `tasks/current.md`; primary remediation candidates identified were perimeter abuse controls for public auth/token exchange, hashed session tokens at rest, and immediate-effect agent bearer-token revocation semantics.

### 2026-04-04
- Type: Governance
- Summary: TASK-061 PR follow-through completed with Copilot review addressed and resolved, plus a final CI-only Playwright helper stabilization after the follow-up commit exposed a transient project-creation toast dependency.
- Evidence: PR `#116` (`fix/task-061-dependency-security` -> `main`); addressed Copilot feedback in commit `dd5ba2a`; replied to and resolved review threads `PRRT_kwDORPDIrs542mdj` and `PRRT_kwDORPDIrs542mdn`; stabilized `tests/e2e/helpers/project-helpers.ts` in commit `dede8c9`; final green checks on workflow run `23983234193` (`Quality Core`, `E2E Smoke`, `Container Image`) plus branch-name run `23983234190`.

### 2026-04-04
- Type: Blocker
- Summary: TASK-061 local Playwright reruns remained environment-blocked after the dependency upgrade because Prisma could not reach the expected PostgreSQL fixture service on loopback.
- Evidence: `npx playwright install chromium`; `$env:DATABASE_URL='postgresql://user:pass@127.0.0.1:5432/postgres'; $env:DIRECT_URL='postgresql://user:pass@127.0.0.1:5433/postgres'; $env:VERCEL_ENV='preview'; $env:RESEND_API_KEY='test-resend-key'; $env:GOOGLE_TOKEN_ENCRYPTION_KEY='0123456789abcdef0123456789abcdef'; $env:AGENT_TOKEN_SIGNING_SECRET='0123456789abcdef0123456789abcdef'; npm run test:e2e` rebuilt successfully, then failed because Prisma could not reach `127.0.0.1:5432`.

### 2026-04-04
- Type: Validation
- Summary: TASK-061 dependency-security remediation validated cleanly with zero remaining npm audit findings plus green lint, unit, coverage, and production-build checks after the required framework/toolchain upgrades.
- Evidence: `npm audit --json`; `npm run security:audit`; `npm run lint`; `npm test`; `npm run test:coverage`; `$env:DATABASE_URL='postgresql://user:pass@localhost:5432/postgres'; $env:DIRECT_URL='postgresql://user:pass@127.0.0.1:5433/postgres'; $env:VERCEL_ENV='preview'; $env:RESEND_API_KEY='test-resend-key'; $env:GOOGLE_TOKEN_ENCRYPTION_KEY='0123456789abcdef0123456789abcdef'; $env:AGENT_TOKEN_SIGNING_SECRET='0123456789abcdef0123456789abcdef'; npm run build`.

### 2026-04-04
- Type: Execution
- Summary: TASK-061 remediated the repo's actionable dependency vulnerabilities by upgrading patched direct dependencies, pinning high-risk transitives with overrides, adding scheduled dependency-security automation, and carrying the required Next.js 15 compatibility migration through affected routes/pages/tests.
- Evidence: Updated `package.json`, `package-lock.json`, `.github/dependabot.yml`, `.github/workflows/dependency-security.yml`, `README.md`, `vitest.config.mts`, and the Next.js async-request compatibility changes under `app/**`, `app/api/**`, `lib/auth/**`, and `tests/**`.

### 2026-04-04
- Type: Validation
- Summary: TASK-048 local validation passed after auth hardening and regression expansion, including focused auth suites, full lint/test/coverage, and a production build with safe preview env overrides.
- Evidence: `npx vitest run tests/api/auth-verify-email.route.test.ts tests/lib/email-verification-service.test.ts tests/lib/api-guard.test.ts`; `npx vitest run tests/app/home-auth-actions.test.ts tests/app/verify-email-actions.test.ts tests/api/auth-logout.route.test.ts`; `npm run lint`; `npm test`; `npm run test:coverage`; `$env:DATABASE_URL='postgresql://user:pass@localhost:5432/postgres'; $env:DIRECT_URL='postgresql://user:pass@127.0.0.1:5433/postgres'; $env:VERCEL_ENV='preview'; $env:RESEND_API_KEY='test-resend-key'; $env:GOOGLE_TOKEN_ENCRYPTION_KEY='0123456789abcdef0123456789abcdef'; $env:AGENT_TOKEN_SIGNING_SECRET='0123456789abcdef0123456789abcdef'; npm run build`.

### 2026-04-04
- Type: Execution
- Summary: TASK-048 hardened the auth surface by preventing signed-in verification-link account mismatches from consuming tokens, then expanded regression coverage around auth redirect normalization and production-only verification enforcement failure handling.
- Evidence: Updated `app/api/auth/verify-email/route.ts` and `lib/services/email-verification-service.ts`; expanded auth regressions in `tests/api/auth-verify-email.route.test.ts`, `tests/lib/email-verification-service.test.ts`, `tests/lib/api-guard.test.ts`, `tests/app/home-auth-actions.test.ts`, `tests/app/verify-email-actions.test.ts`, and `tests/api/auth-logout.route.test.ts`; updated task tracking in `tasks/current.md` and `tasks/task-048-auth-tests-and-hardening.md`.

### 2026-04-04
- Type: Validation
- Summary: TASK-059 merge-refresh validation passed locally after folding the latest `origin/main` into the agent-access branch and refreshing the generated Prisma client in this checkout.
- Evidence: `npx prisma generate`; `npm run lint`; `npm test`; `$env:DATABASE_URL='postgresql://user:pass@localhost:5432/postgres'; $env:DIRECT_URL='postgresql://user:pass@127.0.0.1:5433/postgres'; $env:VERCEL_ENV='preview'; $env:RESEND_API_KEY='test-resend-key'; $env:GOOGLE_TOKEN_ENCRYPTION_KEY='0123456789abcdef0123456789abcdef'; $env:AGENT_TOKEN_SIGNING_SECRET='0123456789abcdef0123456789abcdef'; npm run build`.

### 2026-04-04
- Type: Governance
- Summary: TASK-059 was rebased in practice through a merge-refresh with the latest `main` after TASK-115 had already been folded into the branch, resolving task-tracking conflicts and restoring a clean branch state for mergeability assessment.
- Evidence: Merged `origin/main` into `feature/task-059-agent-access`; resolved conflicts in `tasks/backlog.md`, `tasks/current.md`, and `journal.md`; retained TASK-059 as the active branch task while recording TASK-115 as completed and included in the rollout envelope.

### 2026-04-01
- Type: Validation
- Summary: TASK-115 local validation passed for lint, unit tests, coverage, and production build after adding the hosted agent docs surface, OpenAPI JSON route, account-level developer onboarding, and project-level quickstart UX.
- Evidence: `npm run lint`; `npm test`; `npm run test:coverage`; `npx vitest run tests/api/agent-openapi.route.test.ts tests/components/agent-onboarding-guide.test.ts`; `$env:DATABASE_URL='postgresql://user:pass@localhost:5432/postgres'; $env:DIRECT_URL='postgresql://user:pass@127.0.0.1:5433/postgres'; $env:VERCEL_ENV='preview'; $env:RESEND_API_KEY='test-resend-key'; $env:GOOGLE_TOKEN_ENCRYPTION_KEY='0123456789abcdef0123456789abcdef'; $env:AGENT_TOKEN_SIGNING_SECRET='0123456789abcdef0123456789abcdef'; npm run build`.

### 2026-04-01
- Type: Execution
- Summary: TASK-115 delivered agent onboarding v1 with a hosted docs page, machine-readable OpenAPI contract, account-level developer entry, and project-level bootstrap guidance layered directly onto the existing agent credential model.
- Evidence: Added onboarding contract helpers in `lib/agent-onboarding.ts`; added docs surfaces in `app/docs/agent/v1/page.tsx`, `app/api/docs/agent/v1/openapi.json/route.ts`, and `components/agent-onboarding/agent-onboarding-guide.tsx`; added account developer entry in `components/account/account-settings-shell.tsx`, `app/account/settings/page.tsx`, and `app/account/settings/developers/page.tsx`; extended project onboarding in `components/project-dashboard/project-dashboard-owner-agent-access-panel.tsx` and `components/project-dashboard/project-dashboard-owner-actions.tsx`; added regression coverage in `tests/api/agent-openapi.route.test.ts` and `tests/components/agent-onboarding-guide.test.ts`; updated task docs in `project.md` and `tasks/task-115-agent-onboarding-v1.md`.

### 2026-03-31
- Type: Validation
- Summary: TASK-059 preview validation passed end to end on the branch-scoped preview after fixing both the missing runtime signing secret path and the token-exchange owner lookup, and the disposable validation data was cleaned up afterward.
- Evidence: `npx vercel curl / --deployment https://nexus-dash-dorianagaesse-3732-dorian-agaesses-projects.vercel.app -- --include`; `npx vercel curl /api/health/live --deployment https://nexus-dash-dorianagaesse-3732-dorian-agaesses-projects.vercel.app -- --include`; preview deploy workflow run `23811221988`; live assertions captured in `docs/runbooks/task-059-agent-access-preview-validation.md`; preview validation covered owner credential create/list/rotate/revoke, token exchange, project read, task create/read/update with delete denial, context create/read/update with delete denial, and audit visibility; corrected the context-card test payload to use a valid color from `lib/context-card-colors.ts` (`#DFF3F9`); removed disposable preview users matching `task059-preview-*@nexusdash.local` after sign-off.

### 2026-03-31
- Type: Governance
- Summary: The repo's task execution contract now requires auth/deploy/integration work to spell out local prerequisites, runtime secrets, and deploy/review assumptions directly in the active task brief before deep implementation.
- Evidence: Updated `agent.md`, `tasks/task-059-agent-access-implementation.md`, `tasks/current.md`, and `docs/runbooks/task-059-agent-access-preview-validation.md`.

### 2026-03-31
- Type: Governance
- Summary: TASK-059 PR review and deploy follow-through completed on the latest feature-branch head: Copilot's three review comments were assessed, addressed, replied to, and resolved; the refreshed PR checks are green; and a branch-scoped preview deployment was created successfully from the final task branch ref.
- Evidence: PR `#112` (`feature/task-059-agent-access` -> `main`); addressed Copilot feedback in commits `fcbd615` and `1939839`; replied to and resolved review threads `PRRT_kwDORPDIrs5394bk`, `PRRT_kwDORPDIrs5394ch`, and `PRRT_kwDORPDIrs5394c7`; green latest-head checks on run `23801288613` (`check-name`, `Quality Core`, `E2E Smoke`, `Container Image`); preview deploy workflow run `23801489971` dispatched with `--ref feature/task-059-agent-access -f action=deploy-preview -f git_ref=feature/task-059-agent-access` and produced preview URL `https://nexus-dash-7cs7imdfe-dorian-agaesses-projects.vercel.app`.

### 2026-03-31
- Type: Governance
- Summary: TASK-059 preview-runtime follow-up fixed the missing agent signing secret path that caused Vercel preview aliases to return `500` on `/`.
- Evidence: Confirmed Vercel Preview was missing `AGENT_TOKEN_SIGNING_SECRET` via `npx vercel env ls preview`; updated `.github/workflows/deploy-vercel.yml` so manual preview deploys pass `RESEND_API_KEY` and `AGENT_TOKEN_SIGNING_SECRET` as deployment runtime env values; clarified the requirement in `docs/runbooks/vercel-env-contract-and-secrets.md` and `README.md`.

### 2026-03-31
- Type: Blocker
- Summary: TASK-059 Playwright end-to-end validation is still blocked in this environment because the local PostgreSQL service required by the test fixtures is unreachable at the configured loopback address.
- Evidence: `$env:DATABASE_URL='postgresql://user:pass@127.0.0.1:5432/postgres'; $env:DIRECT_URL='postgresql://user:pass@127.0.0.1:5433/postgres'; $env:VERCEL_ENV='preview'; $env:RESEND_API_KEY='test-resend-key'; $env:GOOGLE_TOKEN_ENCRYPTION_KEY='0123456789abcdef0123456789abcdef'; $env:AGENT_TOKEN_SIGNING_SECRET='0123456789abcdef0123456789abcdef'; npm run test:e2e` rebuilt successfully, then all 6 Playwright specs failed with `PrismaClientInitializationError: Can't reach database server at 127.0.0.1:5432` from `tests/e2e/password-recovery.spec.ts` and `tests/e2e/helpers/auth-helpers.ts`.

### 2026-03-31
- Type: Validation
- Summary: TASK-059 local validation baseline passed for lint, unit tests, coverage, and production build after adding the agent-token signing configuration and using safe env overrides for deploy-sensitive settings.
- Evidence: `npm run lint`; `npm test`; `npm run test:coverage`; `$env:DATABASE_URL='postgresql://user:pass@localhost:5432/postgres'; $env:DIRECT_URL='postgresql://user:pass@127.0.0.1:5433/postgres'; $env:VERCEL_ENV='preview'; $env:RESEND_API_KEY='test-resend-key'; $env:GOOGLE_TOKEN_ENCRYPTION_KEY='0123456789abcdef0123456789abcdef'; $env:AGENT_TOKEN_SIGNING_SECRET='0123456789abcdef0123456789abcdef'; npm run build`.

### 2026-03-31
- Type: Execution
- Summary: TASK-059 agent access v1 was implemented end-to-end with owner-managed project credentials, short-lived bearer-token exchange, scoped API authorization, audit logging, owner UI controls, workflow/env wiring, and task-aligned regression coverage.
- Evidence: Added agent auth persistence in `prisma/schema.prisma` and `prisma/migrations/20260331153000_task059_agent_access_v1/migration.sql`; added token exchange and project agent-access routes in `app/api/auth/agent/token/route.ts` and `app/api/projects/[projectId]/agent-access/**`; extended bearer-aware guards and scoped service enforcement in `lib/auth/api-guard.ts`, `lib/auth/agent-token-service.ts`, `lib/services/project-agent-access-service.ts`, `lib/services/project-access-service.ts`, `lib/services/project-task-service.ts`, `lib/services/context-card-service.ts`, and `lib/services/project-service.ts`; shipped owner controls in `components/project-dashboard/project-dashboard-owner-actions.tsx` and `components/project-dashboard/project-dashboard-owner-agent-access-panel.tsx`; updated workflow/env/docs coverage in `.github/workflows/quality-gates.yml`, `.github/workflows/deploy-vercel.yml`, `.env.example`, `README.md`, `project.md`, `adr/decisions.md`, `tasks/backlog.md`, and `tasks/current.md`; added regressions in `tests/api/agent-token.route.test.ts`, `tests/api/project-agent-access.route.test.ts`, `tests/api/agent-project-routes.test.ts`, `tests/lib/agent-token-service.test.ts`, `tests/lib/project-access-service.test.ts`, and `tests/components/project-dashboard-owner-agent-access-panel.test.tsx`.

### 2026-03-31
- Type: Validation
- Summary: TASK-113 token widget hardening validated after making the editor-only token shell non-editable and preserving toolbar toggle behavior for a focused token input.
- Evidence: `npm run lint`; `npm test`; `npm run build` with temporary `DIRECT_URL` + `GOOGLE_TOKEN_ENCRYPTION_KEY` overrides; expanded `tests/components/rich-text-editor.test.ts` with atomic-token-shell and focused-toggle coverage.

### 2026-03-31
- Type: Execution
- Summary: TASK-113 follow-up fixed the remaining token re-entry regression by marking the editor-only token shell as non-editable while letting the input remain the sole editable surface inside it.
- Evidence: Updated `components/rich-text-editor.tsx` to set token shells `contenteditable=false`, resolve active structured blocks from the focused token input for toolbar toggle behavior, and keep token re-entry routed to the input caret instead of an editable wrapper.

### 2026-03-31
- Type: Validation
- Summary: TASK-113 token editor rebuild validated after replacing the masked contentEditable token surface with a real single-line input in edit mode.
- Evidence: `npm run lint`; `npm test`; `npm run build` with temporary `DIRECT_URL` + `GOOGLE_TOKEN_ENCRYPTION_KEY` overrides; refreshed `tests/components/rich-text-editor.test.ts` token-caret and recovery coverage against the input-based shell.

### 2026-03-31
- Type: Execution
- Summary: TASK-113 token-block follow-up replaced the editor-only masked token row with an input-backed shell after screenshots confirmed Chromium was still rewriting the contentEditable token row and dropping its action buttons.
- Evidence: Updated `components/rich-text-editor.tsx` so token blocks render as single-line input controls with reveal/copy actions, serialize through the live input value, and re-enter at the input caret instead of a masked code node; refreshed `tests/components/rich-text-editor.test.ts`.

### 2026-03-30
- Type: Validation
- Summary: TASK-113 token re-entry hardening validated after extending the structured-block navigation guard across the browser's delayed input phase.
- Evidence: `npm run lint`; `npm test`; `npm run build` with temporary `DIRECT_URL` + `GOOGLE_TOKEN_ENCRYPTION_KEY` overrides; added token-specific recovery coverage in `tests/components/rich-text-editor.test.ts`.

### 2026-03-30
- Type: Execution
- Summary: TASK-113 follow-up fixed the token-only trailing-block regression by extending the caret-navigation guard across the browser's delayed input phase instead of only the initial keydown.
- Evidence: Updated `components/rich-text-editor.tsx` to keep a short-lived structured-block navigation lock, prevent `beforeinput` while that lock is active, and restore canonical token shells if a transient input mutation still fires; added token-specific regression coverage in `tests/components/rich-text-editor.test.ts`.

### 2026-03-29
- Type: Validation
- Summary: TASK-113 token-block Enter-navigation fix validated after removing the custom undo shortcut experiment and guarding against transient browser DOM edits during caret-only navigation.
- Evidence: `npm run lint`; `npx vitest run tests/components/rich-text-editor.test.ts tests/components/rich-text-content.test.ts tests/lib/rich-text.test.ts`; `npm test`; `npm run build` with temporary `DIRECT_URL` + `GOOGLE_TOKEN_ENCRYPTION_KEY` overrides.

### 2026-03-29
- Type: Execution
- Summary: TASK-113 follow-up removed the unstable custom undo/redo shortcut layer and hardened trailing token-block Enter navigation so Chrome-only transient mutations cannot strip token actions.
- Evidence: Updated `components/rich-text-editor.tsx` to treat Enter-from-below as deferred caret navigation back into the trailing structured block, ignore/reset transient DOM mutations during that navigation, and remove custom `Ctrl+Z` / redo handling; updated `tests/components/rich-text-editor.test.ts` to assert caret movement into block ends with controls preserved.

### 2026-03-28
- Type: Validation
- Summary: TASK-113 rich-text control-layer hardening validated after preserving browser undo/selection state for semantically unchanged editor content.
- Evidence: `npm run lint`; `npm test`; `npm run build` with temporary `DIRECT_URL` + `GOOGLE_TOKEN_ENCRYPTION_KEY` overrides; expanded `tests/components/rich-text-editor.test.ts` with caret-anchor assertions and undo shortcut coverage.

### 2026-03-28
- Type: Execution
- Summary: TASK-113 follow-up fixed the long-running block-exit regression by stopping unnecessary controlled-editor DOM rewrites and adding native undo/redo shortcut handling.
- Evidence: Updated `components/rich-text-editor.tsx` to keep hidden caret anchors in editor-only trailing paragraphs, compare incoming prop updates semantically before resetting `innerHTML`, and support `Ctrl+Z` / `Ctrl+Shift+Z` / `Ctrl+Y`; refreshed `tests/components/rich-text-editor.test.ts` with caret-anchor and shortcut coverage.

### 2026-03-28
- Type: Validation
- Summary: TASK-113 caret-anchor hardening validated after replacing editor-only empty trailing paragraphs with stable hidden cursor anchors below structured blocks.
- Evidence: `npm run lint`; `npm test`; `npm run build` with temporary `DIRECT_URL` + `GOOGLE_TOKEN_ENCRYPTION_KEY` overrides; editor regressions remained green in `tests/components/rich-text-editor.test.ts`.

### 2026-03-28
- Type: Execution
- Summary: TASK-113 follow-up replaced fragile empty `<p><br></p>` editor-only trailing lines with hidden caret anchors to stop real-browser Enter flows from jumping back to the start of earlier code/token blocks.
- Evidence: Updated `components/rich-text-editor.tsx` so editor-only trailing paragraphs use a zero-width caret anchor that is stripped during serialization/build normalization; kept token overflow styling discreet in both `components/rich-text-editor.tsx` and `components/rich-text-content.tsx`.

### 2026-03-28
- Type: Validation
- Summary: TASK-113 block-navigation fix validated after removing navigation-only rich-text resyncs and softening token overflow chrome.
- Evidence: `npm run lint`; `npm test`; `npm run build` with temporary `DIRECT_URL` + `GOOGLE_TOKEN_ENCRYPTION_KEY` overrides; expanded `tests/components/rich-text-editor.test.ts` to cover Enter-from-below behavior for both token and code blocks.

### 2026-03-28
- Type: Execution
- Summary: TASK-113 follow-up fixed the remaining structured-block caret regression by separating caret navigation from content persistence inside the controlled editor.
- Evidence: Updated `components/rich-text-editor.tsx` so Enter exits from token/code and blank trailing paragraphs no longer call `onChange` unless content actually changes; refreshed token overflow styling in `components/rich-text-editor.tsx` and `components/rich-text-content.tsx`; expanded regression coverage in `tests/components/rich-text-editor.test.ts`.

### 2026-03-28
- Type: Validation
- Summary: TASK-113 rich-text editor line-scoping and caret-flow fixes validated after tightening current-line code transforms and post-block cursor placement.
- Evidence: `npm run lint`; `npm test`; `npm run build` with temporary `DIRECT_URL` + `GOOGLE_TOKEN_ENCRYPTION_KEY` overrides; added regression coverage in `tests/components/rich-text-editor.test.ts`.

### 2026-03-28
- Type: Execution
- Summary: TASK-113 follow-up corrected code wrapping and block-exit ergonomics so structured blocks stay contained and line-local in the editor.
- Evidence: Updated `components/rich-text-editor.tsx` to wrap long code lines, scope no-selection `Code` transforms to the current visual line, and place the caret in the writable paragraph below code/token blocks; updated `components/rich-text-content.tsx` to wrap code content in read mode; added component-level regression coverage in `tests/components/rich-text-editor.test.ts`.

### 2026-03-28
- Type: Validation
- Summary: TASK-113 second UX correction pass validated after tightening structured-block toggling, editor overflow handling, and confidential token rendering behavior.
- Evidence: `npm run lint`; `npm test`; `npm run build` with temporary `DIRECT_URL` + `GOOGLE_TOKEN_ENCRYPTION_KEY` overrides.

### 2026-03-28
- Type: Execution
- Summary: TASK-113 second UX correction pass aligned code/token editing with the intended block-toggle interaction model inside the rich-text editor.
- Evidence: Reworked `components/rich-text-editor.tsx` so code/token blocks render with editor-only chrome, copy/reveal actions, toggle-on/off behavior, and Enter/Shift+Enter block flow; refreshed `components/rich-text-content.tsx` to use the same neutral block styling with icon-only controls; updated `lib/rich-text.ts` so new token blocks store value-only markup by default; refreshed renderer and rich-text tests accordingly.

### 2026-03-28
- Type: Validation
- Summary: TASK-113 follow-up rich-content UX pass validated locally after replacing prompt-based code/token insertion with selection-aware formatting and confidential token rendering.
- Evidence: `npm run lint`; `npm test`; `npm run build` with temporary `DIRECT_URL` + `GOOGLE_TOKEN_ENCRYPTION_KEY` overrides.

### 2026-03-28
- Type: Execution
- Summary: TASK-113 follow-up aligned code/token behavior with the intended editor and read-surface UX.
- Evidence: Updated `components/rich-text-editor.tsx` so `Code` and `Token` transform the current line or current selection without browser prompts, refreshed `components/rich-text-content.tsx` with Consolas-styled code surfaces plus hidden-by-default token blocks with reveal/copy actions, and redacted token values from preview summaries in `lib/rich-text.ts` with supporting test updates.

### 2026-03-27
- Type: Validation
- Summary: TASK-113 follow-up validation passed after addressing Copilot review feedback and adding renderer-focused component coverage.
- Evidence: Re-ran `npm run lint`; `npm test`; `npm run test:coverage`; `npm run build` with temporary `DIRECT_URL` + `GOOGLE_TOKEN_ENCRYPTION_KEY` overrides; `npx playwright test` against a production `next start` server using the real `.env` `DATABASE_URL` plus the same minimal overrides.

### 2026-03-27
- Type: Execution
- Summary: TASK-113 follow-up changes addressed Copilot feedback around renderer overhead, clipboard fallbacks, and missing tests.
- Evidence: Updated `components/rich-text-content.tsx` to short-circuit plain content and omit copy controls when clipboard support is unavailable; added renderer coverage in `tests/components/rich-text-content.test.ts`; added `jsdom` dev support in `package.json` / `package-lock.json` so the new component tests run inside Vitest.

### 2026-03-27
- Type: Validation
- Summary: TASK-113 local validation baseline passed, including browser smoke coverage against the real runtime database with minimal safe env overrides for the local production-build contract.
- Evidence: `npm run lint`; `npm test`; `npm run test:coverage`; `npm run build` with temporary `DIRECT_URL` + `GOOGLE_TOKEN_ENCRYPTION_KEY` overrides; `npx playwright test` against a production `next start` server using the real `.env` `DATABASE_URL` plus the same minimal overrides.

### 2026-03-27
- Type: Execution
- Summary: TASK-113 implemented rich-content readability upgrades across task/context authoring, rendering, and Kanban previews.
- Evidence: Extended `lib/rich-text.ts` with lightweight code/token block support plus richer preview summarization, added shared copyable rich-content rendering in `components/rich-text-content.tsx`, updated `components/rich-text-editor.tsx` for code/token authoring, hid emoji field controls until focus in `components/ui/emoji-field.tsx`, and wired the richer renderer/preview flow through task detail plus context card surfaces.

### 2026-03-27
- Type: Validation
- Summary: TASK-112 local validation baseline passed for the attachment-link interaction polish after updating the smoke flow to exercise Enter-to-add with the new add affordance.
- Evidence: `npm run lint`; `npm test`; `npm run test:coverage`; `$env:DIRECT_URL='postgresql://localhost:5432/nexusdash_validation'; $env:GOOGLE_TOKEN_ENCRYPTION_KEY='codex-temporary-google-token-key'; $env:VERCEL_ENV='preview'; npm run build`; `$env:DIRECT_URL='postgresql://localhost:5432/nexusdash_validation'; $env:GOOGLE_TOKEN_ENCRYPTION_KEY='codex-temporary-google-token-key'; $env:VERCEL_ENV='preview'; npm run test:e2e`.

### 2026-03-27
- Type: Execution
- Summary: TASK-112 was implemented across task and context-card attachment flows by replacing the confirm-link icon with an add-oriented action and restoring Enter-to-add behavior in each link composer.
- Evidence: Updated `components/create-task-dialog.tsx`, `components/kanban/task-detail-modal.tsx`, `components/context-panel/context-create-modal.tsx`, and `components/context-panel/context-edit-modal.tsx`; aligned smoke coverage in `tests/e2e/smoke-project-task-calendar.spec.ts`; rotated `tasks/current.md` to TASK-112.

### 2026-03-27
- Type: Planning
- Summary: Closed TASK-103 in backlog tracking, added deferred follow-up ideas provided by the user, and drafted the first implementation brief for TASK-059 around project-scoped agent credentials, short-lived bearer tokens, scope enforcement, and audit-trail concerns.
- Evidence: Updated `tasks/backlog.md` and replaced `tasks/current.md`; refreshed `project.md` and `README.md` so the merged collaboration/email-auth state and next-priority task view match the repository's actual state.

### 2026-03-25
- Type: Execution
- Summary: Refined the TASK-103 owner email-invite composer so exact verified-user email matches no longer duplicate the raw email row, and newly created direct-email invites now stay inline as copy-on-demand links instead of auto-copying the clipboard.
- Evidence: Updated `components/project-dashboard/project-dashboard-owner-actions.tsx` to retain the latest direct-email invite link in local state and clear it safely on query changes/revoke; updated `components/project-dashboard/project-dashboard-owner-sharing-panel.tsx` to suppress duplicate exact-match email cards and render an inline read-only link row with copy action; expanded render coverage in `tests/components/project-dashboard-owner-sharing-panel.test.tsx`; revalidated with `npm run lint`, `npm test`, `npm run test:coverage`, and safe-override `npm run build`.

### 2026-03-24
- Type: Execution
- Summary: Streamlined the TASK-103 owner email-invite UX so typed email invites create and copy the invite link in one step instead of requiring a second action in the pending list.
- Evidence: Updated `components/project-dashboard/project-dashboard-owner-actions.tsx` to copy the newly created invite link from the API response immediately; updated `components/project-dashboard/project-dashboard-owner-sharing-panel.tsx` CTA copy and Enter-key behavior; added render coverage in `tests/components/project-dashboard-owner-sharing-panel.test.tsx`; revalidated with `npm run lint`, `npm test`, `npm run test:coverage`, and safe-override `npm run build`.

### 2026-03-24
- Type: Governance
- Summary: TASK-103 PR review/deploy follow-through completed: Copilot comments were addressed and resolved, PR checks are green, and a branch preview deployment was created successfully.
- Evidence: PR `#104` (`feature/task-103-email-bound-project-invites` -> `main`); addressed Copilot threads by adding RLS-safe invite landing lookup in commit `41122b0`; resolved both review threads; green checks on latest head (`check-name`, `Quality Core`, `E2E Smoke`, `Container Image`); preview deploy workflow run `23466059292` succeeded with preview URL `https://nexus-dash-8mvbmjmgm-dorian-agaesses-projects.vercel.app`.

### 2026-03-24
- Type: Execution
- Summary: TASK-103 project sharing v2 was implemented end-to-end with email-bound invitations, copyable invite-link delivery, and recipient resume flows across sign-in, sign-up, verification, and wrong-account states.
- Evidence: Reworked invitation persistence in `prisma/schema.prisma` and `prisma/migrations/20260324110000_task103_email_bound_project_invites/migration.sql`; rewrote invite lifecycle handling in `lib/services/project-collaboration-service.ts`; added invite landing/actions in `app/invite/project/[invitationId]/page.tsx` and `app/invite/project/[invitationId]/actions.ts`; updated owner sharing UI in `components/project-dashboard/project-dashboard-owner-actions.tsx` and `components/project-dashboard/project-dashboard-owner-sharing-panel.tsx`; threaded auth/verification return paths through `app/page.tsx`, `app/home-auth-actions.ts`, `app/verify-email/**`, and `app/api/auth/verify-email/route.ts`.

### 2026-03-24
- Type: Validation
- Summary: TASK-103 local validation baseline passed for lint, unit tests, coverage, and production build after using safe env overrides for deploy-sensitive configuration.
- Evidence: `npm run lint`; `npm test`; `npm run test:coverage`; `$env:DATABASE_URL='postgresql://user:pass@127.0.0.1:5432/postgres?sslmode=require'; $env:DIRECT_URL='postgresql://user:pass@127.0.0.1:5433/postgres?sslmode=require'; $env:RESEND_API_KEY='test-resend-key'; $env:GOOGLE_TOKEN_ENCRYPTION_KEY='0123456789abcdef0123456789abcdef'; npm run build`.

### 2026-03-24
- Type: Blocker
- Summary: TASK-103 Playwright e2e validation could not complete in this environment because the local PostgreSQL service required by the test fixtures is unreachable.
- Evidence: `$env:DATABASE_URL='postgresql://user:pass@127.0.0.1:5432/postgres?sslmode=require'; $env:DIRECT_URL='postgresql://user:pass@127.0.0.1:5433/postgres?sslmode=require'; $env:RESEND_API_KEY='test-resend-key'; $env:GOOGLE_TOKEN_ENCRYPTION_KEY='0123456789abcdef0123456789abcdef'; npm run test:e2e` built successfully, then all 5 Playwright specs failed with `PrismaClientInitializationError: Can't reach database server at 127.0.0.1:5432` from `tests/e2e/helpers/auth-helpers.ts` and `tests/e2e/password-recovery.spec.ts`.

### 2026-03-23
- Type: Governance
- Summary: TASK-058 post-implementation cleanup removed preview-only debug scaffolding, split the owner settings surface into smaller modules, and recorded follow-up work for task ownership/provenance plus later collaboration-service modularization.
- Evidence: Removed `app/api/debug/invitation-state/route.ts`; split `components/project-dashboard/project-dashboard-owner-actions.tsx` into dedicated general/sharing/shared modules; updated `tasks/backlog.md` with `TASK-101` and `TASK-102`; validated with `npm run lint`, `npm test`, safe-override `npm run build`, and preview deploy `https://nexus-dash-phbquqj8t-dorian-agaesses-projects.vercel.app`.

### 2026-03-20
- Type: Governance
- Summary: Merged `origin/main` after PR `#100` landed, resolved task-tracking doc conflicts, and addressed Copilot feedback on invitation idempotency and invitation-row update integrity.
- Evidence: Updated `lib/services/project-collaboration-service.ts` to make invitation accept/decline race-safe; tightened invitation update policies in `prisma/migrations/20260320110000_task058_project_invitations/migration.sql`; added regression coverage in `tests/lib/project-collaboration-service.test.ts`; revalidated with `npm run lint`, `npm test`, `npm run test:coverage`, and safe-override `npm run build`.

### 2026-03-20
- Type: Execution
- Summary: TASK-058 collaboration v1 was implemented end-to-end across schema, services, API routes, account/project UI, and role-aware project surfaces.
- Evidence: Added `ProjectInvitation` schema + migration in `prisma/schema.prisma` and `prisma/migrations/20260320110000_task058_project_invitations/migration.sql`; added collaboration service/API flow in `lib/services/project-collaboration-service.ts` and `app/api/projects/[projectId]/sharing/**`; added owner-facing sharing/settings UI in `components/project-dashboard/project-dashboard-owner-actions.tsx`; added recipient invitation visibility/actions in `app/account/page.tsx`, `app/account/actions.ts`, `components/account-menu.tsx`, and `components/pending-project-invitations-banner.tsx`; enforced role-aware edit gating in project dashboard panels and calendar access.

### 2026-03-20
- Type: Validation
- Summary: TASK-058 local unit validation passed after integrating sharing routes, invitation actions, and calendar role gating.
- Evidence: `npm test` (pass, 57 files / 402 tests); added targeted coverage in `tests/api/project-sharing.route.test.ts`, `tests/api/project-sharing-search.route.test.ts`, `tests/app/account-actions.test.ts`, and `tests/components/account-menu.test.ts`.

### 2026-03-20
- Type: Validation
- Summary: TASK-058 validation baseline passed for lint, unit tests, coverage, and production build after using safe env overrides to avoid the local `.env` database hardening mismatch.
- Evidence: `npm run lint`; `npm test`; `npm run test:coverage`; `$env:DATABASE_URL='postgresql://user:pass@127.0.0.1:5432/postgres?sslmode=require'; $env:DIRECT_URL='postgresql://user:pass@127.0.0.1:5433/postgres?sslmode=require'; $env:RESEND_API_KEY='test-resend-key'; $env:GOOGLE_TOKEN_ENCRYPTION_KEY='0123456789abcdef0123456789abcdef'; npm run build`.

### 2026-03-20
- Type: Blocker
- Summary: TASK-058 Playwright e2e validation could not complete in this environment because the local PostgreSQL service required by the test fixtures is unreachable.
- Evidence: `$env:DATABASE_URL='postgresql://user:pass@127.0.0.1:5432/postgres?sslmode=require'; $env:DIRECT_URL='postgresql://user:pass@127.0.0.1:5433/postgres?sslmode=require'; ...; npm run test:e2e` built successfully, then all 5 Playwright specs failed with `PrismaClientInitializationError: Can't reach database server at 127.0.0.1:5432` from `tests/e2e/helpers/auth-helpers.ts` and `tests/e2e/password-recovery.spec.ts`.
### 2026-03-19
- Type: Governance
- Summary: Refreshed repository execution guidance and task tracking after verifying completed work in git history, including closure of TASK-096 and rotation of the active task to TASK-058.
- Evidence: Updated `agent.md`, `tasks/backlog.md`, and `tasks/current.md` after confirming `TASK-096` was integrated through commit `b20d4af` / PR `#97`.

### 2026-03-19
- Type: Governance
- Summary: Added a dedicated mobile UI/UX refinement follow-up task and clarified that PR monitoring continues until Copilot produces its initial review outcome, even when no inline comments are generated.
- Evidence: Updated `tasks/backlog.md` with `TASK-100` and tightened the PR monitoring rule in `agent.md` while PR `#100` remained active.

### 2026-03-19
- Type: Governance
- Summary: Clarified the repository review workflow so a Copilot overview review with no comments is explicitly treated as a clean state with no follow-up work required.
- Evidence: Updated `agent.md` on branch `docs/agent-task-tracking-refresh` while PR `#100` was open.

### 2026-03-09
- Type: Execution
- Summary: TASK-085 Phase 2 implemented with FORCE-RLS migration on the protected table set and branch hygiene update for local preview artifacts.
- Evidence: Added `prisma/migrations/20260309113000_task085_rls_phase2_force/migration.sql`; updated `.gitignore` to ignore `/.tmp/`; committed on branch `feature/task-085-force-rls-preview` in commit `ba03299` (`feat(task-085): force row-level security in preview phase`).

### 2026-03-09
- Type: Validation
- Summary: TASK-085 Phase 2 local validation baseline and preview validation matrix passed with FORCE-RLS enabled.
- Evidence: Local checks passed: `npm run lint`; `npm test`; `npm run test:coverage`; `npm run build` with safe overrides for `DATABASE_URL`, `DIRECT_URL`, `RESEND_API_KEY`, and `GOOGLE_TOKEN_ENCRYPTION_KEY`. Preview deploy workflow run `22864249355` succeeded for `feature/task-085-force-rls-preview`, preview URL `https://nexus-dash-q3ao1evui-dorian-agaesses-projects.vercel.app`. Verified `/api/health/ready`, owner project create/access, contributor (`editor`) task create/update success, contributor delete denied (`403`), non-member denied via not-found boundary, and `GoogleCalendarCredential` remained user-scoped under actor-context queries.

### 2026-03-09
- Type: Governance
- Summary: TASK-085 Phase 2 draft PR opened against `main` for review and later rollout coordination.
- Evidence: PR `#90` (`feature/task-085-force-rls-preview` -> `main`), URL: `https://github.com/dorianagaesse/nexus_dash/pull/90`.

### 2026-03-05
- Type: Execution
- Summary: TASK-085 phase 1 implemented end-to-end in code and migration layer.
- Evidence: Added migration `prisma/migrations/20260305173000_task085_rls_phase1_enable_policies/migration.sql`; added actor-context helper `lib/services/rls-context.ts`; refactored protected services (`lib/services/project-service.ts`, `lib/services/project-task-service.ts`, `lib/services/context-card-service.ts`, `lib/services/project-attachment-service.ts`, `lib/services/project-access-service.ts`, `lib/services/google-calendar-credential-service.ts`) to run RLS-protected queries within transaction-scoped actor context.

### 2026-03-05
- Type: Validation
- Summary: TASK-085 phase 1 validation baseline passed locally after refactor.
- Evidence: `npm run lint`; `npm test`; `npm run test:coverage`; `DATABASE_URL=postgresql://user:pass@127.0.0.1:5432/postgres?sslmode=require DIRECT_URL=postgresql://user:pass@127.0.0.1:5433/postgres?sslmode=require RESEND_API_KEY=test-resend-key npm run build`.

### 2026-03-04
- Type: Execution
- Summary: ISSUE-081 implemented 4-digit numeric username discriminator contract across policy, identity services, schema, and UI preview.
- Evidence: Updated `lib/services/account-security-policy.ts` (numeric generator + discriminator validator), sanitized legacy invalid discriminator values in `lib/services/account-profile-service.ts` and `lib/services/account-identity-service.ts`, updated signup suffix preview in `app/home-signup-live-feedback.tsx`, and added migration `prisma/migrations/20260304221000_task092_username_discriminator_numeric4/migration.sql` plus schema update in `prisma/schema.prisma`.

### 2026-03-04
- Type: Validation
- Summary: ISSUE-081 local validation baseline passed for lint/unit/coverage/build; e2e could not complete due missing local PostgreSQL service.
- Evidence: `npm run lint`; `npm test`; `npm run test:coverage`; `npx prisma generate`; `DATABASE_URL=... DIRECT_URL=... RESEND_API_KEY=... GOOGLE_TOKEN_ENCRYPTION_KEY=... npm run build` (pass). Installed Playwright browser via `npx playwright install chromium`; `npm run test:e2e` failed because Prisma could not reach `localhost:5432` in this environment.

### 2026-03-04
- Type: Governance
- Summary: ISSUE-081 PR opened for review and CI checks.
- Evidence: PR `#85` (`fix/username-discriminator-4-digits` -> `main`), URL: `https://github.com/dorianagaesse/nexus_dash/pull/85`.

### 2026-03-04
- Type: Execution
- Summary: Addressed Copilot review feedback for ISSUE-081 with retry exhaustion handling and shared discriminator constants.
- Evidence: Added shared client-safe constants/helper in `lib/username-discriminator.ts`; updated `lib/services/account-security-policy.ts` and `app/home-signup-live-feedback.tsx` to consume shared discriminator config; updated `signUpWithEmailPassword` in `lib/services/credential-auth-service.ts` to return `username-in-use` when collision retry budget is exhausted; aligned e2e helper formatting to left-padding in `tests/e2e/helpers/auth-helpers.ts`.

### 2026-03-04
- Type: Validation
- Summary: Re-ran validation after Copilot-driven refinements.
- Evidence: `npm run lint`; `npm test`; `npm run test:coverage`; `DATABASE_URL=... DIRECT_URL=... RESEND_API_KEY=... GOOGLE_TOKEN_ENCRYPTION_KEY=... npm run build` (all pass).

### 2026-03-04
- Type: Governance
- Summary: Copilot review comments were addressed/resolved; PR checks and preview deployment are green.
- Evidence: PR `#85` review threads replied + resolved (3/3), Quality Gates run `22690182889` passed (`check-name`, `Quality Core`, `E2E Smoke`, `Container Image`), manual deploy workflow run `22690383465` succeeded with preview URL `https://nexus-dash-6hqyah1di-dorian-agaesses-projects.vercel.app`.

### 2026-03-03
- Type: Execution
- Summary: ISSUE-080 fixed mobile username auto-capitalization friction on signup/account username forms.
- Evidence: Updated username inputs in `app/page.tsx` and `app/account/page.tsx` to disable mobile auto-capitalization/autocorrect (`autoCapitalize="none"`, `autoCorrect="off"`, `spellCheck={false}`) and relaxed client-side pattern to `[A-Za-z0-9._]+` so server-side lowercase normalization can remain authoritative.

### 2026-03-03
- Type: Validation
- Summary: ISSUE-080 validation baseline executed successfully after implementation.
- Evidence: `npm run lint`; `npm test`; `npm run test:coverage`; `npm run build` (first run failed due to existing env contract mismatch in local `.env`, then passed with safe overrides for `DATABASE_URL`, `DIRECT_URL`, and `GOOGLE_TOKEN_ENCRYPTION_KEY`).

### 2026-03-03
- Type: Execution
- Summary: ISSUE-079 fixed mobile auth toggle scroll-reset behavior on home sign-in/sign-up mode switches.
- Evidence: Updated `app/home-auth-mode-toggle-link.tsx` to force scroll-preserving query navigation by setting `scroll={false}` on `Link` and `{ scroll: false }` in `router.push(...)`.

### 2026-03-03
- Type: Validation
- Summary: ISSUE-079 validation baseline executed successfully after implementation.
- Evidence: `npm run lint`; `npm test -- --run tests/app/home-auth-mode-toggle-link.test.ts tests/app/home-page.test.ts`; `npm test`; `npm run test:coverage`; `npm run build` (first run failed due to existing local `.env` `DATABASE_URL`/`DIRECT_URL` production hardening mismatch, then passed with temporary safe overrides for `DATABASE_URL`, `DIRECT_URL`, `GOOGLE_TOKEN_ENCRYPTION_KEY`, and `RESEND_API_KEY`).

### 2026-02-27
- Type: Execution
- Summary: TASK-086 implemented account email-change verification and compact account-page layout.
- Evidence: Added email update flow in `lib/services/account-profile-service.ts` (normalize/validate/unique + `emailVerified` reset + verification-token cleanup), wired `updateAccountEmailAction` in `app/account/actions.ts` to issue verification and redirect to `/verify-email`, redesigned `app/account/page.tsx` for denser identity/security sections with a header `Settings` CTA, and added regression tests in `tests/lib/account-profile-service.test.ts` and `tests/app/account-actions.test.ts`.

### 2026-02-27
- Type: Governance
- Summary: TASK-086 PR/checks/preview deployment completed with no Copilot review comments.
- Evidence: PR `#64`, checks green (`check-name`, `Quality Core`, `E2E Smoke`, `Container Image`), manual preview deploy workflow run `22501955778` succeeded, preview URL: `https://nexus-dash-2iv983hoq-dorian-agaesses-projects.vercel.app`.

### 2026-02-26
- Type: Execution
- Summary: TASK-082 delivered authenticated account profile self-service and user-menu identity UX updates.
- Evidence: Added `/account` page + server actions (`app/account/page.tsx`, `app/account/actions.ts`), implemented `lib/services/account-profile-service.ts` (username mutation + password rotation with revocation of other sessions), centralized account policy rules in `lib/services/account-security-policy.ts`, updated account menu copy/actions, and validated with `npm run lint`, `npm test`, `npm run test:coverage`, and `npm run build` (with safe DB env overrides).

### 2026-02-26
- Type: Governance
- Summary: TASK-082 PR opened and preview deployment validated.
- Evidence: PR `#60` (`feature/task-082-account-profile` -> `main`), deploy workflow run `22444607142` succeeded, preview URL: `https://nexus-dash-r4om5vt99-dorian-agaesses-projects.vercel.app`.

### 2026-02-26
- Type: Execution
- Summary: TASK-081 delivered username onboarding, discriminator identity, and signup confirm-password validation.
- Evidence: Updated auth service/actions/homepage signup UX, added Prisma migration `20260226113000_task081_username_identity`, added identity summary service + account-menu display (`username#suffix`), and validated with `npm run lint`, `npm test`, `npm run test:coverage`, and `npm run build` (with safe DB env overrides).

### 2026-02-26
- Type: Blocker
- Summary: Local migration-apply validation could not be completed in this execution environment.
- Evidence: `npm run db:migrate` failed without `DIRECT_URL`, then failed again with local placeholder URLs due no running Postgres; Docker-based fallback could not run because Docker daemon socket was unavailable.

### 2026-02-24
- Type: Execution
- Summary: TASK-047 delivered signed-out home auth entry + credentials onboarding.
- Evidence: Added server actions in `app/home-auth-actions.ts`, password hash/verify services, `User.passwordHash` migration (`20260224223000_task047_email_password_auth`), and validated with `npx prisma generate`, `npm run lint`, `npm test`, `npm run test:coverage`, `npm run build`.

### 2026-02-24
- Type: Governance
- Summary: TASK-047 PR lifecycle completed and follow-up review comments resolved.
- Evidence: PR `#54`, follow-up commit `145da6e`, green checks (`check-name`, `Quality Core`, `E2E Smoke`, `Container Image`), preview deployment: `https://nexus-dash-d65zx5w61-dorian-agaesses-projects.vercel.app`.

### 2026-02-23
- Type: Execution
- Summary: TASK-046 route/API auth protection implemented.
- Evidence: Added guards (`lib/auth/server-guard.ts`, `lib/auth/api-guard.ts`), protected `/projects/**` and `/account/**`, and added regression tests.

### 2026-02-23
- Type: Governance
- Summary: TASK-046 review/checks/preview deployment completed.
- Evidence: PR `#52`, preview deployment: `https://nexus-dash-2ahst74ap-dorian-agaesses-projects.vercel.app`.

### 2026-02-23
- Type: Execution
- Summary: TASK-080 delivered account menu + settings page + logout flow.
- Evidence: Added `/account/settings`, `/api/auth/logout`, account menu actions, and tests for settings/logout paths. PR `#50`, preview: `https://nexus-dash-7s1tprkyi-dorian-agaesses-projects.vercel.app`.

### 2026-02-23
- Type: Execution
- Summary: TASK-076 principal-scoped multi-user boundary implemented across DB, attachments, and calendar.
- Evidence: Added ownership/membership schema, actor-aware services, user-scoped Google credentials, ownership-aware storage keys (`v1/{userId}/{projectId}/...`), PR `#49`, preview: `https://nexus-dash-n5pw6dlxt-dorian-agaesses-projects.vercel.app`.

### 2026-02-20
- Type: Planning
- Summary: Auth/authz architecture locked and sequenced.
- Evidence: Added `adr/task-020-modern-auth-authorization-adr.md`; split boundary transition as TASK-076 before route protection.

### 2026-02-20
- Type: Execution
- Summary: TASK-062 dashboard decomposition completed.
- Evidence: Split large panels into `components/kanban/*`, `components/context-panel/*`, `components/calendar-panel/*`; validated with lint/test/coverage/build.

### 2026-02-18
- Type: Validation
- Summary: TASK-069 Cloudflare R2 smoke validation completed end-to-end.
- Evidence: Added gated smoke test `tests/lib/r2-smoke.test.ts` (`R2_SMOKE=1`), verified upload/download/delete + DB cleanup behavior.

### 2026-02-18
- Type: Planning
- Summary: Auth UX/sessions scope clarified for TASK-020/TASK-045/TASK-047 and later phases.
- Evidence: Updated backlog sequencing and acceptance criteria in `tasks/current.md` at that time.

## Historical Milestones (Condensed)

### 2026-02-11 to 2026-02-12: MVP foundation and UX iterations
- Docker setup stabilized (`APP_PORT` override, Prisma generation in container).
- Project CRUD and Kanban baseline implemented.
- Task detail/edit/rich-text flows added.
- Blocked task note and done-task auto-archive behavior added.
- Context card panel introduced and refined (collapse, colors, compact headers).
- Theme toggle and modal UX quality improvements shipped.

### 2026-02-13 to 2026-02-17: quality, architecture, and deployment baseline
- Attachment system matured (preview/download, then provider abstraction).
- API and UI regression coverage expanded.
- PostgreSQL migration baseline replaced legacy SQLite runtime.
- Layering enforced via service boundaries + lint restrictions.
- Runtime env hardening + runbooks added.
- CI quality gates + E2E + container build checks added.
- Vercel CD/promotion/rollback workflow established.

## Journal Usefulness

Helpful for development: **Yes**, if kept concise.

Most useful entries are:
- execution milestones tied to task IDs
- validation evidence (commands/checks)
- release evidence (PR + preview URL)

Low-value entries to avoid going forward:
- minor UI tweaks without task linkage
- repetitive step-by-step notes that already exist in PR history

### 2026-04-22
- Type: Execution
- Summary: TASK-107 follow-up added quick epic assignment directly from the task options menu and tightened backlog tracking for API-capability audit plus mobile navigation bug-fix scope.
- Evidence: Updated `components/kanban-board.tsx` and `components/kanban/task-detail-modal.tsx` to patch task epic links from the existing dots menu without entering full edit mode; updated `tasks/current.md` acceptance/scope wording; added `TASK-127` in `tasks/backlog.md` and expanded `TASK-100` to explicitly cover mobile navigation bug fixing.

### 2026-04-22
- Type: Validation
- Summary: TASK-107 quick-epic follow-up passed local lint, targeted epic service/API tests, and production build; targeted Playwright remains blocked by local E2E database fixture state before the new UI path executes.
- Evidence: `npm run lint`; `npx -y -p node@20.19.0 node .\\node_modules\\vitest\\vitest.mjs run tests\\api\\project-epics.route.test.ts tests\\lib\\project-epic-service.test.ts`; `npm run build` with local env overrides; `npx playwright test tests/e2e/smoke-project-task-calendar.spec.ts --grep "task lifecycle and attachment interaction flow"` failed in `tests/e2e/helpers/auth-helpers.ts` during seeded-user creation via Prisma before the browser reached the new epic quick-action flow.

### 2026-03-02
- Type: Execution
- Summary: ISSUE-070 targeted remediation implemented as low-risk performance patch set (no broad architecture rewrite).
- Evidence: Added bounded concurrency (`default=3`) and success callback support in `lib/direct-upload-client.ts`; extended uploader tests in `tests/lib/direct-upload-client.test.ts`; removed duplicate create-flow refreshes in `components/create-task-dialog.tsx` and `components/project-context-panel.tsx`.

### 2026-03-28
- Type: Execution
- Summary: TASK-113 rich-text block layout refined to a simpler single-surface design with contained overflow.
- Evidence: Updated `components/rich-text-editor.tsx` and `components/rich-text-content.tsx` so code blocks keep copy in the top-right corner, token actions stay inline at the end of the block, and token overflow scrolls inside the value field without widening the modal.

### 2026-03-28
- Type: Validation
- Summary: TASK-113 follow-up layout refinement validated locally before preview deployment.
- Evidence: `npm run lint`, `npx vitest run tests/components/rich-text-content.test.ts tests/lib/rich-text.test.ts`, `npm test`, and `npm run build` (with temporary local `DIRECT_URL` and `GOOGLE_TOKEN_ENCRYPTION_KEY` overrides) all passed.

### 2026-03-28
- Type: Execution
- Summary: TASK-113 follow-up refined overflow containment, inline token actions, and modal sizing.
- Evidence: Updated `tasks/task-113-rich-content-readability-polish.md` with the follow-up spec; tightened `components/rich-text-editor.tsx`, `components/rich-text-content.tsx`, and `lib/rich-text.ts` so token values remain single-line and scroll internally; widened task/context modal shells in `components/create-task-dialog.tsx`, `components/kanban/task-detail-modal.tsx`, `components/context-panel/context-modal-frame.tsx`, and `components/context-panel/context-preview-modal.tsx`.

### 2026-03-28
- Type: Execution
- Summary: TASK-113 editor continuation flow refined so structured blocks exit cleanly and keep an editable line below.
- Evidence: Updated `tasks/task-113-rich-content-readability-polish.md` with single-key exit expectations; changed `components/rich-text-editor.tsx` to keep/reuse a trailing paragraph after terminal code/token blocks and move caret below blocks on exit; added regression coverage in `tests/components/rich-text-editor.test.ts`.

### 2026-03-28
- Type: Execution
- Summary: TASK-113 editor state sync hardened so block controls do not disappear after continuing below structured blocks.
- Evidence: Updated `components/rich-text-editor.tsx` to serialize editor-only shells back to canonical rich HTML before state updates and to intercept `Enter` on the empty paragraph directly below a block; extended `tests/components/rich-text-editor.test.ts` with serialization coverage.

### 2026-04-15
- Type: Execution
- Summary: Developer onboarding settings page now keeps long code blocks and endpoint metadata contained on narrow mobile viewports instead of widening the card layout.
- Evidence: Updated `components/agent-onboarding/agent-onboarding-guide.tsx` so cards and endpoint rows use `min-w-0`, code blocks stay scrollable inside the card, and long endpoint paths wrap safely; added regression coverage in `tests/components/agent-onboarding-guide.test.ts`.

### 2026-04-15
- Type: Validation
- Summary: Mobile containment follow-up for the developer onboarding surface passed the targeted local validation slice before preview deployment.
- Evidence: `npm run lint` and `npx vitest run tests/components/agent-onboarding-guide.test.ts tests/app/agent-onboarding-pages.test.ts`.

### 2026-04-22
- Type: Execution
- Summary: TASK-128 added assignee quick assignment in the task options menu so ownership can be reassigned without entering full edit mode.
- Evidence: Updated `components/kanban/task-detail-modal.tsx` to add an assignee submenu in the existing task options flyout; updated `components/kanban-board.tsx` to reuse the existing task PATCH boundary for quick assignee mutations with immediate local state refresh; updated `tests/e2e/smoke-project-task-calendar.spec.ts` for assignee quick-action coverage; updated `tasks/current.md` and `tasks/backlog.md` for the new follow-up task brief.

### 2026-04-22
- Type: Validation
- Summary: TASK-128 passed local lint and production build; targeted Playwright remained blocked by the local E2E database fixture state before the new assignee path executed.
- Evidence: `npm run lint`; `npm run build` with local env overrides; `npx playwright test tests/e2e/smoke-project-task-calendar.spec.ts --grep "task lifecycle and attachment interaction flow"` failed in `tests/e2e/helpers/auth-helpers.ts` during seeded-user creation via Prisma before the browser reached the new assignee quick-action flow.

### 2026-04-22
- Type: Execution
- Summary: TASK-128 task options submenus now open intentionally by click so assignee quick assignment is reliable in the task flyout and no longer depends on hover-only behavior.
- Evidence: Updated `components/kanban/task-detail-modal.tsx` to manage submenu open state explicitly for move and assignee actions, added a stable assignee submenu marker for validation, and aligned `tests/e2e/smoke-project-task-calendar.spec.ts` with the click-open interaction.

### 2026-04-22
- Type: Validation
- Summary: TASK-128 submenu interaction follow-up passed local lint and production build before being republished to the PR branch.
- Evidence: `npm run lint`; `npm run build` with local `DATABASE_URL`, `DIRECT_URL`, `GOOGLE_TOKEN_ENCRYPTION_KEY`, and `AGENT_TOKEN_SIGNING_SECRET` overrides.

### 2026-04-22
- Type: Execution
- Summary: TASK-128 quick assignee updates were hardened after CI exposed that the shared task PATCH endpoint expects a full persisted task payload, not a sparse assignee-only body.
- Evidence: Updated `components/kanban-board.tsx` so quick assignee mutations preserve title, labels, description, deadline, and related-task ids while overriding only the assignee field; tightened `tests/e2e/smoke-project-task-calendar.spec.ts` to assert the task header badge switches from unassigned to an assigned identity.

### 2026-04-23
- Type: Execution
- Summary: TASK-106 added a dedicated `Roadmap` dashboard section with standalone project milestones, new project-scoped roadmap persistence/routes, and distinct desktop/mobile timeline presentations.
- Evidence: Added `RoadmapMilestone` schema + migration, implemented `lib/services/project-roadmap-service.ts` plus human-only roadmap API routes, wired `app/projects/[projectId]/project-roadmap-panel-section.tsx` into the project page, and built the visual milestone UI in `components/project-roadmap-panel.tsx`.

### 2026-04-23
- Type: Validation
- Summary: TASK-106 passed local lint, targeted roadmap coverage, full Vitest coverage, and production build after pinning local validation to the repo-compatible Node `20.19.0` runtime and supplying placeholder env values expected by startup/build validation.
- Evidence: `npx -y -p node@20.19.0 node .\\node_modules\\prisma\\build\\index.js generate`; `npx -y -p node@20.19.0 node .\\node_modules\\eslint\\bin\\eslint.js .`; `npx -y -p node@20.19.0 node .\\node_modules\\vitest\\vitest.mjs run tests\\lib\\project-roadmap-service.test.ts tests\\api\\project-roadmap.route.test.ts tests\\components\\project-roadmap-panel.test.tsx`; `DATABASE_URL=... DIRECT_URL=... AGENT_TOKEN_SIGNING_SECRET=... RESEND_API_KEY=... npx -y -p node@20.19.0 node .\\node_modules\\vitest\\vitest.mjs run`; `DATABASE_URL=... DIRECT_URL=... AGENT_TOKEN_SIGNING_SECRET=... RESEND_API_KEY=... GOOGLE_TOKEN_ENCRYPTION_KEY=... npx -y -p node@20.19.0 node .\\node_modules\\next\\dist\\bin\\next build`.

### 2026-04-24
- Type: Execution
- Summary: TASK-130 roadmap follow-up aligned the event-first UX with the approved interaction model and removed the remaining misleading roadmap chrome.
- Evidence: Updated `components/project-roadmap-panel.tsx` so the roadmap header toggles from the full row, roadmap counts reuse the Epics-style pill badges, the trailing new-milestone lane no longer shows persistent explanatory text, event lanes render without the extra outer shell, drag-over uses shadow/lift feedback instead of border expansion, and roadmap event moves persist through the hardened `lib/services/project-roadmap-service.ts` transaction path.

### 2026-04-24
- Type: Validation
- Summary: TASK-130 follow-up passed targeted lint, roadmap service regression coverage, production build, and deployed-preview Playwright validation after tightening the roadmap smoke to use the shipped drag handle geometry reliably.
- Evidence: `npm run lint -- components/project-roadmap-panel.tsx lib/services/project-roadmap-service.ts tests/lib/project-roadmap-service.test.ts tests/e2e/smoke-project-task-calendar.spec.ts`; `npx vitest run tests/lib/project-roadmap-service.test.ts`; `npm run build` with local `DATABASE_URL`, `DIRECT_URL`, `GOOGLE_TOKEN_ENCRYPTION_KEY`, and `AGENT_TOKEN_SIGNING_SECRET` overrides; `PLAYWRIGHT_BASE_URL=https://nexus-dash-2x8b9ruwh-dorian-agaesses-projects.vercel.app VERCEL_AUTOMATION_BYPASS_SECRET=... npx playwright test tests/e2e/smoke-project-task-calendar.spec.ts --grep "roadmap event-first milestone flow"`.

### 2026-04-24
- Type: Governance
- Summary: Backlog updates for TASK-108 (global UI polish), TASK-127 (API audit), and new TASK-129 (login page UI polish) merged to docs/ branch.
- Evidence: Updated `tasks/backlog.md` and `journal.md` on branch `docs/add-backlog-entries`.

### 2026-04-25
- Type: Execution
- Summary: TASK-130 roadmap connector follow-up simplified desktop branch geometry so milestone connectors originate from the centered left lane, branch cleanly toward right-side event stacks, and no longer render hub dots or overlapping elbow artifacts.
- Evidence: Updated `components/project-roadmap-panel.tsx` to recalibrate connector offsets against the current lane layout, replace the old multi-primitive fork with a single centered trunk + clean right-side branch stems, and remove the rendered hub marker.

### 2026-04-25
- Type: Validation
- Summary: TASK-130 connector follow-up passed focused lint and a production build before preview republish.
- Evidence: `npm run lint -- components/project-roadmap-panel.tsx tests/components/project-roadmap-panel.test.tsx`; `npm run build` with local `DATABASE_URL`, `DIRECT_URL`, `GOOGLE_TOKEN_ENCRYPTION_KEY`, and `AGENT_TOKEN_SIGNING_SECRET` overrides. `npx vitest run tests/components/project-roadmap-panel.test.tsx` did not execute because the repo's current Vitest include pattern still only matches `tests/**/*.test.ts`.

### 2026-04-25
- Type: Execution
- Summary: TASK-130 roadmap modal follow-up replaced the old event form selects with richer task-style pickers and refreshed the dialog shell while removing the last connector junction artifact.
- Evidence: Updated `components/project-roadmap-panel.tsx` so event status and milestone placement use portaled roadmap pickers with richer option summaries, the event dialog now uses a more polished full-surface modal shell, and desktop connectors use butt-capped junctions to avoid the remaining visible dot at branch starts.

### 2026-04-25
- Type: Validation
- Summary: TASK-130 roadmap modal follow-up passed focused lint and a production build before preview redeploy.
- Evidence: `npm run lint -- components/project-roadmap-panel.tsx`; `npm run build` with local `DATABASE_URL`, `DIRECT_URL`, `GOOGLE_TOKEN_ENCRYPTION_KEY`, and `AGENT_TOKEN_SIGNING_SECRET` overrides.

### 2026-04-27
- Type: Governance
- Summary: Added TASK-131 to track the local validation environment repair work across container bootstrap, database availability, and required toolchain/version alignment.
- Evidence: Updated `tasks/backlog.md` and `journal.md`; PR title: `TASK-131 add local testing backlog task`.

### 2026-04-30
- Type: Execution
- Summary: TASK-124 mention autocomplete follow-up fixed the missing dropdown in task comments and task descriptions.
- Evidence: Mounted `MentionAutocomplete` in the task comment composer, added rich-text editor mention autocomplete for task descriptions, replaced selection-based textarea positioning with caret geometry, raised the portaled dropdown above the task modal, and changed empty `@` member search to return the initial project member list.

### 2026-04-30
- Type: Validation
- Summary: TASK-124 autocomplete follow-up passed focused mention/editor/comment validation plus production build with local placeholder environment values.
- Evidence: `npm run lint`; `npm test -- --run tests/lib/mention.test.ts`; `npm test -- --run tests/components/rich-text-editor.test.ts`; `npm test -- --run tests/api/task-comments.route.test.ts tests/components/notification-center-list.test.ts tests/lib/mention.test.ts`; `DATABASE_URL=... DIRECT_URL=... npm test`; `DATABASE_URL=... DIRECT_URL=... AGENT_TOKEN_SIGNING_SECRET=... RESEND_API_KEY=... npm run build`. `npx tsc --noEmit` remains blocked by pre-existing test typing drift around Next async route params and older service signatures, while the build TypeScript phase passes.

### 2026-05-02
- Type: Execution
- Summary: TASK-124 PR #211 follow-up fixed mention caret and tooltip regressions across task descriptions and comments while documenting the required PR worktree workflow.
- Evidence: Added the multi-agent dedicated worktree rule to `agent.md`; made rich-text editor mention spans non-editable so selection markers are not deleted during mention re-highlighting; consumed an existing following whitespace when replacing an active mention; aligned the comment composer mention highlight layer with textarea text metrics; added pointer-move hover checks so mention tooltips close when the pointer leaves the mention in any direction.

### 2026-05-02
- Type: Validation
- Summary: TASK-124 follow-up passed focused mention/editor validation, full local test and coverage suites, production build, and task-modal Playwright smoke using the repo-compatible Node 20.19 runtime shim.
- Evidence: Local default Node is `20.17.0`, so validation was run with `npx -y -p node@20.19.0 -p npm@10.8.2 ...`. Passed: `npm test -- --run tests/lib/mention.test.ts`; `npm test -- --run tests/components/rich-text-editor.test.ts`; `npm test -- --run tests/components/rich-text-content.test.ts`; `npm run lint`; `DATABASE_URL=... DIRECT_URL=... npm test`; `DATABASE_URL=... DIRECT_URL=... npm run test:coverage`; `DATABASE_URL=... DIRECT_URL=... AGENT_TOKEN_SIGNING_SECRET=... RESEND_API_KEY=... GOOGLE_TOKEN_ENCRYPTION_KEY=... npm run build`; root `.env`-backed `npx playwright test tests/e2e/smoke-project-task-calendar.spec.ts --grep "task lifecycle"` passed against the built app.

### 2026-05-02
- Type: Execution
- Summary: TASK-124 second PR #211 follow-up aligned task-description edit-mode mention behavior with comments while adding whole-mention fast delete to both surfaces.
- Evidence: Added reusable `removeMentionBeforeCursor` mention deletion logic for textareas; updated the rich-text editor so selected mentions create a real trailing space, caret movement can cross highlighted mention spans in both directions, and Backspace at a mention boundary removes the whole mention plus separator; wired comment input Backspace to the same fast-delete behavior; added regression coverage for mention selection spacing, whole-mention deletion, and Ctrl+Arrow navigation.

### 2026-05-02
- Type: Execution
- Summary: Added cross-platform task worktree automation and clarified the multi-agent task workflow.
- Evidence: Added `create-worktree.mjs` and `npm run worktree:create -- TASK-XXX <slug-or-branch>`; updated `agent.md` to require `1 issue = 1 task` and `1 task = 1 branch = 1 PR = 1 worktree`, with task worktrees created one directory above the root as `../nexus_dash_taskXXX`.

### 2026-05-02
- Type: Validation
- Summary: TASK-124 second follow-up passed focused mention/editor suites, full local validation, the new worktree script smoke, and task-modal Playwright smoke using the repo-compatible Node 20.19 runtime shim.
- Evidence: Passed: `npm test -- --run tests/lib/mention.test.ts`; `npm test -- --run tests/components/rich-text-editor.test.ts`; `npm run lint`; `npm run worktree:create -- TASK-124 comment-mentions` (reported the branch already checked out in the active PR worktree and the expected future `../nexus_dash_task124` path); `DATABASE_URL=... DIRECT_URL=... npm test`; `DATABASE_URL=... DIRECT_URL=... npm run test:coverage`; `DATABASE_URL=... DIRECT_URL=... AGENT_TOKEN_SIGNING_SECRET=... RESEND_API_KEY=... GOOGLE_TOKEN_ENCRYPTION_KEY=... npm run build`; root `.env`-backed `npx playwright test tests/e2e/smoke-project-task-calendar.spec.ts --grep "task lifecycle"`.

### 2026-05-02
- Type: Execution
- Summary: TASK-124 mention spacing follow-up fixed the remaining task-description edit-mode mismatch after Playwright confirmed the selected mention still rendered with a regular trailing space in the live editor.
- Evidence: Root cause was the rich-text editor using a normal space after a non-editable mention span, which contenteditable can render as an invisible/unhelpful end-of-block separator; the comment textarea did not have that DOM boundary problem. The editor now uses an editor-only non-breaking separator after mention spans, normalizes it back to a regular space during serialization, and keeps loaded mention separators visible when descriptions re-enter edit mode.

### 2026-05-02
- Type: Validation
- Summary: TASK-124 mention spacing follow-up passed focused editor/mention tests, lint, full local tests and coverage, production build, and browser smoke with a real task-description mention selection.
- Evidence: Passed with Node `20.19.0` shim: `npm test -- --run tests/components/rich-text-editor.test.ts`; `npm test -- --run tests/lib/mention.test.ts`; `npm run lint`; `DATABASE_URL=... DIRECT_URL=... npm test`; `DATABASE_URL=... DIRECT_URL=... npm run test:coverage`; `DATABASE_URL=... DIRECT_URL=... AGENT_TOKEN_SIGNING_SECRET=... RESEND_API_KEY=... GOOGLE_TOKEN_ENCRYPTION_KEY=... npm run build`; fresh-port root `.env`-backed `PORT=3012 npx playwright test tests/e2e/smoke-project-task-calendar.spec.ts --grep "task lifecycle"` verified mention selection creates a non-breaking separator and allows typing after it.

### 2026-05-03
- Type: Execution
- Summary: TASK-124 Return-key follow-up fixed task-description mention separators that ignored Enter after a selected mention.
- Evidence: Root cause was native `contenteditable` handling at the boundary between a non-editable mention span and the editor-only non-breaking separator; comments use a textarea and do not hit that DOM boundary. Added an explicit paragraph-break path for Enter at a mention separator, including the root-level inline case created by selecting a mention in an empty description.

### 2026-05-03
- Type: Validation
- Summary: TASK-124 Return-key follow-up passed focused mention/editor tests, lint, full local tests and coverage, production build, and browser smoke that presses Enter after selecting a task-description mention.
- Evidence: Passed with Node `20.19.0` shim: `npm test -- --run tests/components/rich-text-editor.test.ts`; `npm test -- --run tests/lib/mention.test.ts`; `npm run lint`; `DATABASE_URL=... DIRECT_URL=... npm test`; `DATABASE_URL=... DIRECT_URL=... npm run test:coverage`; `DATABASE_URL=... DIRECT_URL=... AGENT_TOKEN_SIGNING_SECRET=... RESEND_API_KEY=... GOOGLE_TOKEN_ENCRYPTION_KEY=... npm run build`; fresh-port root `.env`-backed `PORT=3013 npx playwright test tests/e2e/smoke-project-task-calendar.spec.ts --grep "task lifecycle"`.

### 2026-05-03
- Type: Execution
- Summary: TASK-124 separator-boundary follow-up aligned task-description ArrowLeft/Backspace behavior with plain comment text.
- Evidence: Root cause was `getMentionBeforeCaret` treating the caret after the editor-only mention separator as already being at the mention boundary, so the first ArrowLeft/Backspace skipped across the mention span. The rich-text editor now first moves/deletes back to the separator boundary, then crosses/removes the mention on the next action; the textarea mention helper follows the same two-step deletion behavior.

### 2026-05-03
- Type: Validation
- Summary: TASK-124 separator-boundary follow-up passed focused mention/editor tests, lint, full local tests and coverage, production build, and browser smoke.
- Evidence: Passed with Node `20.19.0` shim: `npm test -- --run tests/components/rich-text-editor.test.ts`; `npm test -- --run tests/lib/mention.test.ts`; `npm run lint`; `DATABASE_URL=... DIRECT_URL=... npm test`; `DATABASE_URL=... DIRECT_URL=... npm run test:coverage`; `DATABASE_URL=... DIRECT_URL=... AGENT_TOKEN_SIGNING_SECRET=... RESEND_API_KEY=... GOOGLE_TOKEN_ENCRYPTION_KEY=... npm run build`; fresh-port root `.env`-backed `PORT=3014 npx playwright test tests/e2e/smoke-project-task-calendar.spec.ts --grep "task lifecycle"`.

### 2026-05-03
- Type: Execution
- Summary: TASK-124 PR #211 Copilot review follow-up tightened mention identity resolution, notification metadata checks, and autocomplete layout behavior.
- Evidence: Preserved full `username#discriminator` mention insertion from autocomplete; made discriminator-less notification resolution skip ambiguous shared usernames; extracted mention-member resolution and notification dispatch helpers from comment creation; cached parsed mention results in rich-text highlighting; added an invitation metadata sentinel guard; stabilized mention member search owner timestamps; debounced autocomplete resize layout; documented the username-only extraction helper limitation.

### 2026-05-03
- Type: Validation
- Summary: TASK-124 Copilot review follow-up passed focused mention/comment validation and lint; broader local validation still needs the repo-compatible env/tooling baseline.
- Evidence: Passed: `npx vitest run tests/components/mention-autocomplete.test.ts tests/api/task-comments.route.test.ts tests/lib/mention.test.ts`; `npm run lint`; `npm run build` with local placeholder `DATABASE_URL`, `DIRECT_URL`, `AGENT_TOKEN_SIGNING_SECRET`, `RESEND_API_KEY`, and `GOOGLE_TOKEN_ENCRYPTION_KEY` values. An unqualified `npm test` is blocked locally by missing `DATABASE_URL` imports in existing Prisma-backed suites and the current jsdom `html-encoding-sniffer` / `@exodus/bytes` CommonJS-ESM worker issue.

### 2026-05-03
- Type: Execution
- Summary: TASK-124 mention regression follow-up fixed task-description tooltip dismissal, comment composer caret alignment, and post-edit description mention highlighting.
- Evidence: Rich-text description hover now clears the tooltip when pointer coordinates leave the actual mention span; the comment textarea highlight mirror can preserve full discriminated mention text so the visible text aligns with the transparent textarea caret; `RichTextContent` now enhances mounted content updates synchronously so a saved plain-text description with `@username#tag` is immediately highlighted.

### 2026-05-06
- Type: Investigation
- Summary: TASK-217 started from scratch in dedicated worktree `../nexus_dash_task217` on branch `fix/task-217-mention-notification-open`.
- Evidence: GitHub issue #217 reports mention notification `Open` links landing on 404 pages. The old `../nexus_dash_issue217` worktree and old `fix/issue-217-*` branches were intentionally left untouched. Initial investigation found task comment mention notifications storing `/projects/:projectId/tasks/:taskId`, while the app only has a dashboard route at `/projects/:projectId` and task APIs under `/api/projects/:projectId/tasks/:taskId`.

### 2026-05-06
- Type: Execution
- Summary: TASK-217 fixed mention notification navigation at the generated target and added stale-link compatibility.
- Evidence: Task comment mention notifications now target `/projects/:projectId?taskId=:taskId&commentId=:commentId`; the project dashboard passes `taskId` into the Kanban board and opens the matching task modal once board data is loaded; `/projects/:projectId/tasks/:taskId` now redirects to the dashboard task target for existing notifications that already stored the stale nested route.

### 2026-05-06
- Type: Validation
- Summary: TASK-217 passed focused regression tests, lint, full unit/API tests, coverage, build, migrations, and Playwright smoke validation.
- Evidence: Passed: `npx vitest run tests/api/task-comments.route.test.ts tests/app/project-task-redirect-page.test.ts`; `npm run lint`; placeholder-env `npm test` (93 files passed, 1 skipped; 719 passed, 1 skipped); placeholder-env `npm run test:coverage` (91.23% statements, 81.2% branches, 93.42% functions, 91.75% lines); placeholder-env `npm run build`; Compose Postgres `npm run db:local:up`; `npm run db:migrate` after using the documented local `postgres:postgres` connection; `NODE_ENV=test` `npm run test:e2e` (7 passed). A first plain `npm test` failed because the clean worktree had no `DATABASE_URL`; a first E2E retry without `NODE_ENV=test` failed because local password-reset smoke attempted real Resend delivery with a placeholder key.

### 2026-05-03
- Type: Validation
- Summary: TASK-124 mention regression follow-up passed focused mention/comment/rich-text validation, lint, and production build.
- Evidence: Passed: `npx vitest run tests/lib/mention.test.ts tests/api/task-comments.route.test.ts`; Node 20.19 shim `npm exec -- vitest run tests/components/rich-text-content.test.ts`; `npm run lint`; `npm run build` with local placeholder `DATABASE_URL`, `DIRECT_URL`, `AGENT_TOKEN_SIGNING_SECRET`, `RESEND_API_KEY`, and `GOOGLE_TOKEN_ENCRYPTION_KEY` values.

### 2026-05-03
- Type: Execution
- Summary: TASK-124 read-mode description follow-up fixed the still-reproducible vertical tooltip dismissal gap and added regression coverage for edited plain-text descriptions retaining highlighted discriminator mentions.
- Evidence: Root cause was the read-only rich-text mention hover relying on task-description React mouse transitions, while inline mention boxes could keep stale hover state when the pointer left vertically without a reliable mention-to-container transition. Rich mentions now render as tight inline-block targets, track the active mention element, and clear via a document-level pointermove guard when the pointer is no longer over that exact mention. Added coverage for the screenshot-shaped description text `test @dorian2#6425 dedede\nedit 1`, plus editor serialization coverage proving an existing `@dorian2#6425` mention keeps its raw discriminator while later edits add another mention.

### 2026-05-03
- Type: Investigation
- Summary: TASK-124 has required unusual back-and-forth because the PR grew from comment mention notifications into a cross-surface mention/editor overhaul with 27 commits and broad UI/API/test ownership.
- Evidence: PR #211 currently has 27 commits. The branch touches comment creation and notification resolution, member search, mention parsing, autocomplete layout, comment textarea highlighting, task-description rich-text rendering, a custom contenteditable editor, E2E smoke coverage, and task/worktree docs. The highest-churn area is `components/rich-text-editor.tsx`, where browser-native `contenteditable` behavior around non-editable mention spans, hidden discriminators, separators, Backspace/Arrow/Enter navigation, and serialization produced several follow-up-only edge cases that comments did not hit because comments use a plain textarea.

### 2026-05-03
- Type: Validation
- Summary: TASK-124 read-mode description follow-up passed focused mention/editor suites, lint, full tests, coverage, and production build.
- Evidence: Passed with Node `20.19.0` shim: `npm exec -- vitest run tests/components/rich-text-content.test.ts`; `npm exec -- vitest run tests/components/rich-text-editor.test.ts`; `npm exec -- vitest run tests/lib/mention.test.ts tests/api/task-comments.route.test.ts tests/components/rich-text-content.test.ts tests/components/rich-text-editor.test.ts`; `npm run lint`; `DATABASE_URL=... DIRECT_URL=... AGENT_TOKEN_SIGNING_SECRET=... RESEND_API_KEY=... GOOGLE_TOKEN_ENCRYPTION_KEY=... npm exec -- vitest run`; same env `npm exec -- vitest run --coverage`; same env `npm run build`.

### 2026-05-04
- Type: Execution
- Summary: TASK-124 comment composer caret follow-up removed the hidden-discriminator model mismatch from comment input.
- Evidence: Root cause was the plain textarea storing `@username#discriminator` while the overlay rendered only `@username`; the browser painted the native caret from the longer hidden value, so it appeared offset after visible text. Comment autocomplete now inserts display-only `@username` into the textarea, while selected-member metadata is submitted separately for unambiguous notification resolution.

### 2026-05-04
- Type: Validation
- Summary: TASK-124 comment composer caret follow-up passed focused mention/comment validation, lint, and production build.
- Evidence: Passed with Node `20.19.0` shim: `npx -p node@20.19.0 node node_modules/vitest/vitest.mjs run tests/components/mention-autocomplete.test.ts tests/api/task-comments.route.test.ts tests/components/rich-text-content.test.ts tests/components/rich-text-editor.test.ts tests/lib/mention.test.ts`; `npm run lint`; `DATABASE_URL=... DIRECT_URL=... VERCEL_ENV=preview RESEND_API_KEY=... GOOGLE_TOKEN_ENCRYPTION_KEY=... AGENT_TOKEN_SIGNING_SECRET=... npx -p node@20.19.0 node node_modules/next/dist/bin/next build`.

### 2026-05-04
- Type: Execution
- Summary: TASK-124 view-mode description follow-up made mention parsing resilient to invisible editor format characters.
- Evidence: Root cause was a visually contiguous task-description mention being saved with an invisible contenteditable format/caret character inside the mention token, so view-mode text-node parsing saw raw `@username#discriminator` text but did not match it as one mention. Shared mention parsing now tolerates zero-width format characters around `@`, username, `#`, and discriminator text, while editor serialization strips those characters before persisting.

### 2026-05-04
- Type: Validation
- Summary: TASK-124 view-mode description follow-up passed focused mention/rich-text validation, lint, and production build.
- Evidence: Passed with Node `20.19.0` shim: `npx -p node@20.19.0 node node_modules/vitest/vitest.mjs run tests/lib/mention.test.ts tests/components/rich-text-content.test.ts tests/components/rich-text-editor.test.ts tests/api/task-comments.route.test.ts tests/components/mention-autocomplete.test.ts`; `npm run lint`; `DATABASE_URL=... DIRECT_URL=... VERCEL_ENV=preview RESEND_API_KEY=... GOOGLE_TOKEN_ENCRYPTION_KEY=... AGENT_TOKEN_SIGNING_SECRET=... npx -p node@20.19.0 node node_modules/next/dist/bin/next build`.

### 2026-05-04
- Type: Investigation
- Summary: TASK-131 local validation baseline repair started in dedicated worktree `../nexus_dash_task131` on branch `feature/task-131-local-validation-baseline`.
- Evidence: Root checkout kept untouched despite unrelated TASK-124 local edits. `npm run worktree:create -- TASK-131 local-validation-baseline` created the task worktree from `origin/main`. Local shell reports Node `v20.17.0` and npm `10.8.2`; `npm ci` fails at Prisma preinstall because Prisma requires Node `20.19+`, `22.12+`, or `24+`. Docker is available (`28.4.0`, Compose `v2.39.4-desktop.1`), but `docker compose config` fails because `DATABASE_URL` and `DIRECT_URL` are required shell variables and the compose file does not provide a local Postgres service.

### 2026-05-04
- Type: Execution
- Summary: TASK-131 added a repo-owned local validation baseline with a pinned Node contract, Docker Compose Postgres, local validation scripts, and documentation.
- Evidence: Added `.node-version` (`20.19.0`), package `engines`, `db:local:*` scripts, `validate:local`, `scripts/local-validation.mjs`, a Compose `postgres:16-alpine` service, app-container DB defaults, Dockerfile Node pin, README updates, `.env.example` local DB hints, and `docs/runbooks/local-validation.md`. The supported Node contract is now `20.19+`, `22.13+`, or `24+` because the current dependency tree includes transitive packages that require `22.13+` on the Node 22 lane.

### 2026-05-04
- Type: Validation
- Summary: TASK-131 local validation repair passed install/generate/lint/test/coverage/build checks under a Node `20.19.0` shim; full DB migration and Playwright smoke remain blocked until Docker Desktop is running.
- Evidence: Passed: `docker compose config`; `npx -y -p node@20.19.0 -p npm@10 npm ci`; `npx -y -p node@20.19.0 -p npm@10 npx prisma generate`; placeholder-env `npm run lint`; placeholder-env `npm test` (92 files passed, 1 skipped; 718 passed, 1 skipped); placeholder-env `npm run test:coverage` (91.23% statements, 81.2% branches, 93.42% functions, 91.75% lines); placeholder-env `npm run build`. Expected blockers: plain `npm run validate:local` fails early on global Node `20.17.0`; Node-shimmed `node scripts/local-validation.mjs` reaches `Start local PostgreSQL` and fails because Docker Desktop Linux engine pipe `//./pipe/dockerDesktopLinuxEngine` is unavailable.

### 2026-05-08
- Type: Execution
- Summary: TASK-225 implemented project notification email digests and delayed invitation reminders from a dedicated worktree.
- Evidence: Created worktree `../nexus_dash_task225` on `feature/task-225-project-notification-email-digests` from `origin/main`. Added durable `ProjectNotificationEmail` and `ProjectNotificationEmailItem` tracking tables; added `project_notification_digest` email template support; added a service-layer dispatcher that scans verified users, groups unread/unresolved mention and assignment notifications by recipient/project after a 30-minute quiet window, collapses repetitive task activity, sends via `sendOutboundEmail`, and leaves notification read/resolution state unchanged. Added a 6-hour unresolved/unread project invitation reminder path using the existing project invitation email foundation. Added protected `GET /api/cron/notification-emails` plus `CRON_SECRET`/`NOTIFICATION_EMAIL_DISPATCH_SECRET` env handling.

### 2026-05-08
- Type: Validation
- Summary: TASK-225 local validation passed through focused tests, lint, full unit/API tests, coverage, and production build.
- Evidence: `npm ci`; `npx prisma generate`; `npm run db:local:up`; local PostgreSQL `npm run db:migrate` applied all 34 migrations including `20260508110000_task225_project_notification_email_digests`; focused tests passed with `npm test -- --run tests/lib/project-notification-email-service.test.ts tests/api/notification-email-dispatch.route.test.ts tests/lib/outbound-email-templates.test.ts tests/lib/env.server.test.ts` (4 files, 76 tests); `npm run lint` passed; local DB `NODE_ENV=test npm test` passed (107 files passed, 2 skipped; 795 passed, 2 skipped); local DB `NODE_ENV=test npm run test:coverage` passed (91.23% statements, 81.2% branches, 93.42% functions, 91.75% lines); production-guarded `npm run build` passed with local PostgreSQL, disabled outbound delivery mode, localhost trusted origins, local agent signing secret, and local NextAuth secret. A prior build attempt failed because the local shell set `NEXTAUTH_URL` without `NEXTAUTH_SECRET`; rerunning with both configured passed.

### 2026-05-08
- Type: Execution
- Summary: TASK-225 addressed Copilot PR #246 review comments before preview deployment.
- Evidence: Made failed and stale pending project notification email attempts retryable instead of permanently covering notifications; changed coverage lookup so only sent/skipped/fresh pending attempts suppress future dispatch; removed the fixed first-250 verified-user scan cap; and batched project invitation reminder lookups with one `findMany` call per recipient.

### 2026-05-08
- Type: Validation
- Summary: TASK-225 Copilot follow-up passed focused tests, lint, full unit/API tests, coverage, and production build.
- Evidence: Focused tests passed with `npm test -- --run tests/lib/project-notification-email-service.test.ts tests/api/notification-email-dispatch.route.test.ts tests/lib/outbound-email-templates.test.ts tests/lib/env.server.test.ts` (4 files, 77 tests); `npm run lint` passed; local DB `NODE_ENV=test npm test` passed (107 files passed, 2 skipped; 796 passed, 2 skipped); local DB `NODE_ENV=test npm run test:coverage` passed (91.23% statements, 81.2% branches, 93.42% functions, 91.75% lines); production-guarded `npm run build` passed with local PostgreSQL, disabled outbound delivery mode, localhost trusted origins, local agent signing secret, and local NextAuth secret. Standalone `npx tsc --noEmit` still reports pre-existing test typing issues unrelated to TASK-225, so the repo's established lint/test/coverage/build validation path remains the authoritative gate.

### 2026-05-08
- Type: Execution
- Summary: TASK-225 replaced Vercel Cron wiring with a GitHub Actions scheduler after preview deployment exposed the Vercel Hobby cron limit.
- Evidence: Explicit-ref preview workflow run `25583050495` checked out `feature/task-225-project-notification-email-digests`, generated Prisma, applied migrations, and built the app, then failed during `vercel deploy` with Vercel's Hobby-plan error for the `*/15` cron in `vercel.json`. Removed `vercel.json` and added `.github/workflows/notification-email-dispatch.yml`, which calls the protected dispatch endpoint every 15 minutes using repository variable `NOTIFICATION_EMAIL_DISPATCH_URL` plus repository secret `NOTIFICATION_EMAIL_DISPATCH_SECRET` or `CRON_SECRET`.

### 2026-05-08
- Type: Execution
- Summary: TASK-225 added Prisma generation to `postinstall` so direct Vercel preview deploys are self-sufficient.
- Evidence: Workflow preview deploys run `npx prisma generate` explicitly before `vercel build`, but direct `vercel deploy` remote builds only ran install/build and failed because `@prisma/client` had not been generated. Added `postinstall: prisma generate` to align direct Vercel preview deploys with the workflow build path.

### 2026-05-08
- Type: Execution
- Summary: TASK-225 updated the Docker image build order for the Prisma `postinstall` hook.
- Evidence: The container-image check showed `npm ci` running before `prisma/schema.prisma` was copied into `/app`, so the new `postinstall` hook could not find the Prisma schema. `Dockerfile` now copies `prisma/` and `prisma.config.ts` before `npm ci`, preserving the existing explicit `npx prisma generate` step after the full source copy.

### 2026-05-08
- Type: Validation
- Summary: TASK-225 PR checks and preview deployments passed after scheduler and Docker follow-ups.
- Evidence: PR #246 final head `793a0ea` passed Check Branch Name, Quality Core, E2E Smoke, and Container Image. Explicit-ref workflow preview run `25583379928` checked out `feature/task-225-project-notification-email-digests` and deployed `https://nexus-dash-55krfi0nt-dorian-agaesses-projects.vercel.app`. A separate live-email smoke preview was deployed from the same branch with real Resend delivery mode at `https://nexus-dash-lpkmzden2-dorian-agaesses-projects.vercel.app`.

### 2026-05-08
- Type: Validation
- Summary: TASK-225 real preview email smoke sent a project digest to `dorian.agaesse@gmail.com`.
- Evidence: Agent API smoke against the live-email preview passed through Vercel protection using `vercel curl`, created a persistent TASK-225 smoke task, assigned it to the configured Dorian user, and added a mention comment. After the 30-minute quiet window elapsed, `GET /api/cron/notification-emails` returned `ok: true` with `usersScanned: 1`, `digestsAttempted: 1`, `digestsSent: 1`, `digestsSkipped: 0`, `digestsFailed: 0`, `invitationRemindersAttempted: 0`, and `errors: 0`. Invitation reminder behavior remains covered by local automated tests; no live 6-hour reminder was forced.

### 2026-05-04
- Type: Validation
- Summary: TASK-131 full local validation baseline passed after Node was upgraded to `v24.15.0` and Docker Desktop was running.
- Evidence: `npm run validate:local` passed end to end: Docker Compose Postgres started and became healthy; `npm ci` installed dependencies; Prisma Client generated; `npm run db:migrate` applied or confirmed 31 migrations; `npm run lint` passed; `npm test` passed (92 files passed, 1 skipped; 718 passed, 1 skipped); `npm run test:coverage` passed with 91.23% statements, 81.2% branches, 93.42% functions, 91.75% lines; `npm run build` passed; Playwright Chromium install completed; `npm run test:e2e` passed all 7 Playwright tests.

### 2026-05-04
- Type: Validation
- Summary: TASK-131 Docker Compose app runtime path passed against the local Compose database.
- Evidence: `APP_PORT=3131 docker compose up --build -d app` built the Node `20.19.0` app image, started app + Postgres containers, and `Invoke-WebRequest` checks returned HTTP 200 from `http://127.0.0.1:3131/api/health/live` and `http://127.0.0.1:3131/api/health/ready` with the database check reporting `ok`.

### 2026-05-04
- Type: Validation
- Summary: TASK-131 full local validation baseline passed again after rebasing onto current `origin/main`.
- Evidence: Rebased over `e7f513c` (`fix: show user avatars in project invitation search results`). `npm run validate:local` passed end to end again with Docker Compose Postgres healthy, no pending migrations, lint green, `npm test` green (92 files passed, 1 skipped; 718 passed, 1 skipped), coverage green (91.23% statements, 81.2% branches, 93.42% functions, 91.75% lines), production build green, and all 7 Playwright E2E tests passing.

### 2026-05-04
- Type: Execution
- Summary: TASK-131 addressed Copilot PR #235 review comments on Compose health checks, DB reset scope, and Playwright dependency installation.
- Evidence: Changed the Postgres healthcheck to use container `POSTGRES_USER`/`POSTGRES_DB`; changed `db:local:down` to stop only Postgres; added `scripts/local-db-reset.mjs` so `db:local:reset` removes only the Postgres container/volume and starts a fresh healthy DB; made the validation script install Playwright browser dependencies with `--with-deps` on Linux.

### 2026-05-04
- Type: Validation
- Summary: TASK-131 Copilot follow-up passed DB reset and full local validation from a fresh database volume.
- Evidence: `node scripts/local-db-reset.mjs` removed only `nexus_dash_task131_postgres_data` and started a fresh healthy Postgres service. `npm run validate:local` then passed end to end, including reapplying all 31 migrations, lint, `npm test` (92 files passed, 1 skipped; 718 passed, 1 skipped), coverage (91.23% statements, 81.2% branches, 93.42% functions, 91.75% lines), production build, and all 7 Playwright E2E tests.

### 2026-05-06
- Type: Execution
- Summary: TASK-214 fixed task creation focus-border inconsistency from a fresh worktree and branch.
- Evidence: Created fresh worktree `../nexus_dash_issue214_codex` on `fix/issue-214-task-creation-focus-border` from `origin/main`, leaving the prior TASK-214 worktree/branch untouched. Root cause was the task creation form mixing native input focus paint, border-only rich text focus, ring-based custom selects, and mostly unstyled picker/search inputs inside overflow-constrained modal content. The title field now uses an internal wrapper border instead of native external focus paint, and the task creation fields share the scoped `task-create-focus-*` border treatment so focused borders stay inside the field box in light and dark themes.

### 2026-05-06
- Type: Validation
- Summary: TASK-214 passed local lint, unit/API tests, coverage, production build, and Playwright smoke validation.
- Evidence: Node `v24.15.0`; `npm ci`; `npx prisma generate`; `npm run db:local:up`; `DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/nexusdash?schema=public DIRECT_URL=... npm run db:migrate`; `npm run lint`; same DB env `npm test` (92 files passed, 1 skipped; 718 passed, 1 skipped); same DB env `npm run test:coverage` (91.23% statements, 81.2% branches, 93.42% functions, 91.75% lines); preview-style build env (`VERCEL_ENV=preview`, local `AGENT_TOKEN_SIGNING_SECRET`, `TRUSTED_ORIGINS`, `NEXTAUTH_URL`, `NEXTAUTH_SECRET`) `npm run build`; same env `npm run test:e2e` passed all 7 Playwright tests.

### 2026-05-06
- Type: Execution
- Summary: TASK-214 follow-up generalized the focus-border treatment across task edit and context-card create/edit authoring surfaces.
- Evidence: Replaced the task-create-only CSS hooks with shared opt-in `form-focus-border-*` hooks and reused them for task edit title, labels, description, deadline, epic, assignee, blocked follow-up entry, related-task search, and attachment-link entry. Context-card create/edit title, rich content, and attachment-link entry now use the same border-focused treatment.

### 2026-05-06
- Type: Validation
- Summary: TASK-214 follow-up passed lint, unit/API tests, coverage, production build, and Playwright smoke validation.
- Evidence: `npm run lint`; local DB env `npm test` (92 files passed, 1 skipped; 718 passed, 1 skipped); local DB env `npm run test:coverage` (91.23% statements, 81.2% branches, 93.42% functions, 91.75% lines); preview-style env `npm run build`; preview-style env `npm run test:e2e` passed all 7 Playwright tests.

### 2026-05-06
- Type: Validation
- Summary: TASK-214 branch merged current `origin/main` without force-pushing and passed the full local validation suite again.
- Evidence: Merged over `b60c983` (`TASK-217 Fix mention notification open route (#238)`) because branch rules disallow force-push. Passed `npm run lint`; local DB env `npm test` (93 files passed, 1 skipped; 719 passed, 1 skipped); local DB env `npm run test:coverage` (91.23% statements, 81.2% branches, 93.42% functions, 91.75% lines); preview-style env `npm run build`; preview-style env `npm run test:e2e` passed all 7 Playwright tests.

### 2026-05-06
- Type: Execution
- Summary: TASK-214 edit task modal follow-up restored full-width title input alignment.
- Evidence: Root cause was edit mode rendering the title input in the horizontal modal header beside the close/action area, while Labels renders in the full-width modal body. Edit mode now uses a stacked full-width header layout with the close action positioned independently, so the title input receives the same content width as Labels.

### 2026-05-06
- Type: Validation
- Summary: TASK-214 edit title alignment follow-up passed lint, unit/API tests, coverage, and production build; task lifecycle E2E passed, while the unrelated roadmap drag smoke timed out locally.
- Evidence: `npm run lint`; local DB env `npm test` (93 files passed, 1 skipped; 719 passed, 1 skipped); local DB env `npm run test:coverage` (91.23% statements, 81.2% branches, 93.42% functions, 91.75% lines); preview-style env `npm run build`; preview-style env `npm run test:e2e` passed 6 of 7 tests including `task lifecycle and attachment interaction flow`, then failed in `roadmap event-first milestone flow` waiting for `/roadmap/events/move` after Playwright dropped the roadmap card outside the drop area. Targeted rerun of that roadmap smoke reproduced the same drag/drop timeout; no task modal regression was observed.

### 2026-05-07
- Type: Execution
- Summary: TASK-127 audited current app/API parity and implemented the missing session-user API routes for shipped app workflows that were still server-action-only.
- Evidence: Added `tasks/task-127-api-capability-audit.md` with the parity matrix. Implemented `GET`/`POST /api/projects`; `GET`/`PATCH /api/account/profile`; `POST /api/account/profile/avatar`; `PATCH /api/account/password`; `GET`/`PATCH`/`DELETE /api/account/settings/google-calendar`; `GET`/`PATCH /api/account/notifications`; `POST /api/account/notifications/mark-all-read`; `GET /api/account/invitations`; and `POST /api/account/invitations/:invitationId/respond`. The new account/notification/invitation/settings routes intentionally remain session-user APIs and do not expand the project-scoped agent v1 OpenAPI contract.

### 2026-05-07
- Type: Validation
- Summary: TASK-127 passed focused API tests, lint, full unit/API tests, coverage, production build, and Playwright E2E against the local PostgreSQL baseline.
- Evidence: Focused route tests passed: `npm test -- --run tests/api/projects.route.test.ts tests/api/account-profile.route.test.ts tests/api/account-settings.route.test.ts tests/api/account-notifications.route.test.ts` (23 passed initially; 26 passed after Copilot review fixes). `npm run lint` passed before and after review fixes. With `DATABASE_URL`/`DIRECT_URL=postgresql://postgres:postgres@127.0.0.1:5432/nexusdash?schema=public`, `npm test` passed (97 files passed, 1 skipped; 742 passed, 1 skipped) and `npm run test:coverage` passed (91.23% statements, 81.2% branches, 93.42% functions, 91.75% lines). `npm run build` passed after `npx prisma generate` and local runtime guard env, then passed again after Copilot review fixes. `npm run test:e2e` passed all 8 Playwright tests, including the new `tests/e2e/api-projects.spec.ts` API-backed project create/list parity flow. PR #241 was opened, Copilot's actionable review threads were resolved, and GitHub branch-name/Quality Gates checks were green on the implementation head.

### 2026-05-07
- Type: Execution
- Summary: TASK-127 follow-up fixed notification gaps found during real agent smoke review: agent mentions of the credential owner now notify, and task assignment now emits in-app notifications.
- Evidence: Updated `lib/services/project-task-comment-service.ts` so agent-authored mentions are not treated as human self-mentions; added `task_assignment` notification support in `lib/services/notification-service.ts`; wired create/update assignment notifications and reassignment resolution in `lib/services/project-task-service.ts`; kept the credential owner visible to agent callers in `searchProjectMembersForMention`; added RLS policy migration `prisma/migrations/20260507120000_task_assignment_notification_rls/migration.sql`; added regression coverage in `tests/api/task-comments.route.test.ts`, `tests/api/task-update.route.test.ts`, and `tests/lib/project-collaboration-service.test.ts`. Roadmap remains session-user API because its handlers use `requireAuthenticatedApiUser` and the agent v1 scope model has no roadmap scopes.

### 2026-05-07
- Type: Validation
- Summary: TASK-127 notification follow-up passed focused regression tests, lint, full unit/API tests, build, and local Playwright smoke coverage.
- Evidence: `npm test -- tests/api/task-comments.route.test.ts tests/api/task-update.route.test.ts tests/lib/notification-service.test.ts` passed (41 tests); `npm test -- tests/lib/project-collaboration-service.test.ts tests/api/project-members-search.route.test.ts` passed (10 tests); `npm run lint` passed; local DB env with `NODE_ENV=test` `npm test` passed (97 files passed, 1 skipped; 748 passed, 1 skipped); local PostgreSQL env `npm run build` passed. Local Playwright with migrated DB passed 7 of 8 specs in the first `npm run test:e2e`; the only failure was password-reset email delivery because `NODE_ENV=production` without `VERCEL_ENV=preview` attempted Resend with a placeholder key. Rerunning `npx playwright test tests/e2e/password-recovery.spec.ts` with `VERCEL_ENV=preview` passed both password recovery specs.

### 2026-05-26
- Type: Planning
- Summary: Refreshed backlog state after TASK-269 and TASK-266 were merged, and captured a new deferred performance investigation for app-wide slowness.
- Evidence: Moved TASK-269 to Completed after PR #292 and TASK-266 to Completed after PR #293. Added TASK-275 as a deferred measurement-first performance investigation/report for slow creation, update, and refresh flows, including backend latency, database/query timing, route refresh behavior, hydration/bundle cost, cache invalidation, optimistic UI opportunities, and ranked implementation recommendations. Promoted TASK-270, TASK-118, and TASK-129 from Deferred into the execution queue after TASK-274 and TASK-133.

### 2026-05-31
- Type: Execution
- Summary: TASK-276 implemented the first performance remediation batch for project dashboard mutation flows.
- Evidence: Task creation now returns a board-ready task payload; task create, task update/save, quick assignee/epic updates, comment create, context-card create/update/delete, archive/delete, and kanban movement paths update local state without normal success-path dashboard refreshes. Optimistic task/comment/context-card state now reconciles or rolls back locally, task creation preserves an opened optimistic task when the canonical server payload arrives, kanban reorder skips unchanged rows server-side, and targeted mutation/list routes emit production-safe `Server-Timing` headers.

### 2026-05-31
- Type: Validation
- Summary: TASK-276 local validation passed after the performance remediation batch.
- Evidence: `npm run lint` passed. Local PostgreSQL env `npm test` passed (113 files passed, 2 skipped; 849 passed, 2 skipped). Local PostgreSQL env `npm run test:coverage` passed with 91.32% statements, 81.33% branches, 92.2% functions, and 91.83% lines. Local-safe production build env `npm run build` passed. Patched build Playwright smoke `npx playwright test tests/e2e/smoke-project-task-calendar.spec.ts` passed all 5 critical UI smoke flows on `PORT=3101`.

### 2026-05-31
- Type: Validation
- Summary: TASK-276 branch-ref preview deployment and deployed API smoke passed.
- Evidence: Workflow run `26718308463` deployed preview `https://nexus-dash-7amtvjh4y-dorian-agaesses-projects.vercel.app` from `feature/task-276-performance-remediation` at `5bee1f0`. Agent API smoke passed health, OpenAPI, token exchange, project read, member search, epic create/update/cleanup, task create/list/update/comment/list/cleanup, and context-card create/list/update/cleanup. Preview timing probe showed the app-owned timing header: task create `x-nexusdash-server-timing=task-create;dur=1896.6`, task update `task-update;dur=1774.5`, comment create `task-comment-create;dur=1156.7`, tasks list `tasks-list;dur=1354.3`, reorder no-op `task-reorder;dur=706.1`, context create `context-create;dur=939.5`, context update `context-update;dur=847.1`, and context list `context-list;dur=637.2`. The standard `Server-Timing` header was not exposed by the Vercel response path, so the app-owned header is retained for preview/prod evidence. Preview Playwright browser smoke was attempted but redirected to sign-in because local session seeding did not target the deployed runtime database; it was not counted as a valid pass.

### 2026-06-01
- Type: Execution
- Summary: TASK-308 started from fresh `origin/main` on `feature/task-308-smart-live-refresh` and implemented source-aware live project refresh semantics.
- Evidence: Added a project activity acknowledgement event and mutation response version header, wired high-frequency task/comment/context-card mutation surfaces to acknowledge local writes, and updated `ProjectLiveRefresh` so deferred remote updates auto-apply as soon as edit locks clear while the manual prompt remains available during active editing.

### 2026-06-01
- Type: Validation
- Summary: TASK-308 local validation passed after live-refresh implementation.
- Evidence: `npm test -- --run tests/components/project-live-refresh.test.tsx` passed 5 tests covering idle auto-refresh, locked prompt behavior, local acknowledgement suppression, in-flight local mutation suppression, and automatic pending refresh after lock release. `npm run lint` passed. Local PostgreSQL env `npm test` passed (113 files passed, 2 skipped; 852 passed, 2 skipped). Local PostgreSQL env `npm run test:coverage` passed with 91.32% statements, 81.33% branches, 92.2% functions, and 91.83% lines. Preview-style env `npm run build` passed. Fresh-port local Playwright `npm run test:e2e` on `PORT=3120` passed all 8 E2E tests after the smoke test waited for canonical task creation before server-backed quick edits.

### 2026-06-01
- Type: Validation
- Summary: TASK-308 PR checks and branch-ref preview deployment passed.
- Evidence: PR #315 opened from `feature/task-308-smart-live-refresh` at `9d150a9`. GitHub checks passed: branch-name, Quality Core, E2E Smoke, and Container Image. Preview workflow run `26727186276` used `git_ref=feature/task-308-smart-live-refresh`; logs show checkout fetched and checked out `refs/remotes/origin/feature/task-308-smart-live-refresh`. Preview artifact URL: `https://nexus-dash-q4cso7uob-dorian-agaesses-projects.vercel.app`.

### 2026-06-02
- Type: Execution
- Summary: TASK-308 follow-up tightened remote-collaborator latency after preview feedback.
- Evidence: Replaced the fixed 5-second project activity poll with adaptive activity checks: active visible dashboards now use a 2-second default cadence, focus/visibility changes request an immediate check, and hidden tabs back off to reduce background traffic. Updated TASK-263 wording so live invitation visibility remains tracked as notification freshness rather than dashboard refresh.

### 2026-06-02
- Type: Validation
- Summary: TASK-308 focused live-refresh controller tests passed after adaptive polling changes.
- Evidence: `npm test -- --run tests/components/project-live-refresh.test.tsx` passed 7 tests covering idle auto-refresh, default active polling cadence, focus-triggered activity checks, locked prompt behavior, local acknowledgement suppression, in-flight local mutation suppression, and automatic pending refresh after lock release.

### 2026-06-02
- Type: Validation
- Summary: TASK-308 adaptive polling follow-up passed the local quality baseline.
- Evidence: `npm run lint` passed. Local PostgreSQL env `npm test` passed (113 files passed, 2 skipped; 854 passed, 2 skipped). Local PostgreSQL env `npm run test:coverage` passed with 91.32% statements, 81.33% branches, 92.2% functions, and 91.83% lines. Preview-style env `npm run build` passed after supplying the local-safe Google token encryption placeholder required by the current `.env` OAuth group. Local-safe preview env `npm run test:e2e` with `VERCEL_ENV=preview` passed all 8 Playwright specs; an earlier run without `VERCEL_ENV=preview` failed the password-reset smoke because the placeholder Resend key was treated as live delivery.

### 2026-06-03
- Type: Execution
- Summary: TASK-309 started after TASK-308 / PR #315 merged and chose SSE as the first durable realtime transport.
- Evidence: PR #315 merged as `7ac91ad`. Created `feature/task-309-realtime-event-stream`, added TASK-309 to the execution queue, rewrote `tasks/current.md`, and recorded the architecture decision to prefer authenticated server-sent events for project activity while keeping adaptive polling for unsupported browsers, stream failures, and agent/API clients.

### 2026-06-03
- Type: Execution
- Summary: TASK-309 implemented the project activity SSE foundation.
- Evidence: Added `/api/projects/:projectId/activity/stream` with `text/event-stream` project-activity events carrying the existing `{ projectId, version, serverTime }` contract, heartbeat support, and bounded Vercel function duration. Updated `ProjectLiveRefresh` to prefer `EventSource`, retain local mutation acknowledgement/edit-lock behavior, and fall back to adaptive polling when the stream cannot open.

### 2026-06-03
- Type: Validation
- Summary: TASK-309 focused realtime stream tests passed.
- Evidence: `npm test -- --run tests/components/project-live-refresh.test.tsx tests/api/project-activity-stream.route.test.ts` passed 2 files / 11 tests covering stream selection, stream fallback, existing polling behavior, and SSE route formatting/authorization failure handling.

### 2026-06-03
- Type: Validation
- Summary: TASK-309 local validation baseline passed.
- Evidence: `npm run lint` passed. Local PostgreSQL env `npm test` passed (114 files passed, 2 skipped; 858 passed, 2 skipped). Local PostgreSQL env `npm run test:coverage` passed with 91.32% statements, 81.33% branches, 92.2% functions, and 91.83% lines. Preview-style env `npm run build` passed and included `/api/projects/[projectId]/activity/stream` in the route manifest. Local-safe preview env `npm run test:e2e` with `VERCEL_ENV=preview` passed all 8 Playwright specs.

### 2026-06-03
- Type: Validation
- Summary: TASK-309 Copilot review fix passed focused and broad local validation.
- Evidence: Copilot identified that `sleepWithAbort` removed no abort listener after normal timeout resolution. Fixed the listener cleanup and added `tests/lib/server-sent-events.test.ts`. Focused `npm test -- --run tests/lib/server-sent-events.test.ts tests/components/project-live-refresh.test.tsx tests/api/project-activity-stream.route.test.ts` passed 3 files / 14 tests. `npm run lint` passed. Local PostgreSQL env `npm test` passed (115 files passed, 2 skipped; 861 passed, 2 skipped).

### 2026-06-04
- Type: Investigation
- Summary: TASK-310 started after TASK-309 / PR #316 was merged unexpectedly, with TASK-309 marked complete and a new full-stack performance investigation opened on `docs/task-310-performance-investigation`.
- Evidence: Updated `tasks/backlog.md` and `tasks/current.md` so TASK-310 owns the report deliverable, covers browser interaction, React/route refresh behavior, API/service timing, database/runtime behavior, Vercel/serverless constraints, and realtime propagation, and explicitly requires a follow-up implementation task after the report PR is merged.

### 2026-06-04
- Type: Investigation
- Summary: TASK-310 reproduced the remaining collaboration latency as an observer-side reconciliation problem rather than a local mutation problem.
- Evidence: Local Docker Postgres was healthy and had no pending migrations. `npm run build` passed with preview-safe local env. A local `next start` server on `127.0.0.1:3150` showed seeded API reads in tens of milliseconds (`tasks-list;dur=25.4`, `context-list;dur=7.7`) and actor UI task creation visible in 140 ms (`task-create;dur=86.4`). A remote/API task create while an observer dashboard was open took 72 ms wall-clock (`task-create;dur=63.0`), but the observer saw the task after 4513 ms, isolating the remaining delay to realtime propagation plus full dashboard refresh. An instrumented EventSource probe showed a post-mutation activity event arriving about 836 ms after the mutation marker, consistent with the current 1000 ms stream-side DB poll.

### 2026-06-04
- Type: Planning
- Summary: TASK-310 report PR #317 merged and TASK-311 started as the follow-up implementation task.
- Evidence: PR #317 merged as `d8f2626` after Quality Core, E2E Smoke, Container Image, and branch-name checks passed; Copilot's two stale-status wording comments were addressed in `e3d92e0` and the review threads were resolved. Created `feature/task-311-product-latency-remediation`, moved TASK-310 and the stale TASK-308 queue entry to Completed, and drafted `tasks/current.md` around typed project activity events, targeted dashboard reconciliation, timing marks, and the TASK-310 observer-latency target.

### 2026-06-04
- Type: Execution
- Summary: TASK-311 implemented typed project activity events and targeted dashboard reconciliation.
- Evidence: Added `ProjectActivityEvent` with RLS policies, event recording helpers, and typed stream payloads. Task create/update/delete/reorder, task comment create, and context card create/update/delete now record typed project activity events. `ProjectLiveRefresh` dispatches typed remote events before falling back to full route refresh. The kanban board applies safe task/comment/reorder patches locally, and the project context panel applies safe context-card create/update/delete patches locally.

### 2026-06-04
- Type: Validation
- Summary: TASK-311 local validation and observer-latency probe passed.
- Evidence: `npm run lint` passed. Focused `npm test -- tests/api/project-activity-stream.route.test.ts tests/components/project-live-refresh.test.tsx tests/lib/project-activity-service.test.ts` passed 3 files / 16 tests. Local PostgreSQL env `npm test` passed 115 files with 864 tests passed and 2 skipped. Local-safe production env `npm run build` passed. Local-safe `npm run test:e2e` passed all 8 Playwright specs with `OUTBOUND_EMAIL_DELIVERY_MODE=disabled`; a previous run without that local email mode failed only because the placeholder Resend key produced a provider 401 during the password-reset smoke. A local production-mode two-user probe measured task create API 119 ms, observer visibility 825 ms after API completion and 944 ms after mutation start; observer marks showed `received` then `patched` 3 ms apart with no console errors.

### 2026-06-04
- Type: Execution
- Summary: TASK-311 hardened typed event recording for deployed runtime behavior.
- Evidence: Preview browser smoke initially showed observer updates falling back to route refresh with no `nexusdash:project-activity-remote` events. Added `app.record_project_activity_event(...)` as a SECURITY DEFINER database function so typed event writes and the project activity marker update happen atomically inside the database, then corrected the function return casts for varchar columns. Direct local function call returned a typed event row, and the local production-mode two-user probe passed again with task create API 54 ms, observer visibility 849 ms after API completion and 904 ms after mutation start, plus a typed `task/created` remote event and `received` -> `patched` marks.

### 2026-06-04
- Type: Execution
- Summary: TASK-311 addressed Copilot review feedback on stream cursor safety and fallback activity durability.
- Evidence: Replaced timestamp-only event stream progress with a composite `version`/`createdAt`/`id` cursor, added a monotonic database event function replacement that advances per-project event versions under row lock, consolidated activity domain/action union types, and made event response fallback touch the durable project marker before falling back to an unpersisted timestamp. Validation passed with `npm run lint`, local PostgreSQL env `npm test` (116 files passed, 2 skipped; 866 tests passed, 2 skipped), `npm run test:coverage`, and local-safe `npm run test:e2e` (8/8 specs). Local production probe on `127.0.0.1:3154` measured task create API 66 ms, observer visibility 1345 ms after API completion and 1411 ms after mutation start with a typed `task/created` event and `received` -> `patched` marks.

### 2026-06-04
- Type: Debugging
- Summary: TASK-311 preview validation isolated the deployed fallback path to split database role access for typed activity events.
- Evidence: Branch preview run `26921567621` deployed from `git_ref=feature/task-311-product-latency-remediation` and applied `20260604020500_task311_monotonic_activity_events`, but browser validation on `https://nexus-dash-e5c4j5r6o-dorian-agaesses-projects.vercel.app` still measured task create API 2608 ms, observer visibility 2912 ms after API completion, `received` -> `fallback-refresh-start`, and no typed remote events. Added `20260604023000_task311_project_activity_event_runtime_grants` to grant `SELECT, INSERT` on `ProjectActivityEvent` to the runtime role while preserving RLS as the authorization boundary.

### 2026-06-04
- Type: Execution
- Summary: TASK-311 changed typed event persistence to the Prisma/RLS service path for runtime consistency.
- Evidence: After runtime grants, preview still fell back without typed events, indicating the custom SECURITY DEFINER function path was not the right primary runtime contract. Updated `recordProjectActivityEvent` to touch the project activity marker and create `ProjectActivityEvent` through Prisma inside the existing actor RLS transaction, leaving the database function only as a fallback when the delegate is unavailable. Focused activity stream/service/response tests passed and `npm run lint` passed.

### 2026-06-04
- Type: Validation
- Summary: TASK-311 final branch preview validated typed observer reconciliation on Vercel.
- Evidence: Preview workflow run `26922436935` used `git_ref=feature/task-311-product-latency-remediation`, logs showed checkout of `refs/remotes/origin/feature/task-311-product-latency-remediation`, and deployed `https://nexus-dash-gztb6x1zo-dorian-agaesses-projects.vercel.app`. Browser probe created two preview accounts, created a project, invited/accepted the observer, opened the observer dashboard, and created a task as the actor. The task create API took 2691 ms, but observer visibility was 98 ms after API completion and 2789 ms after mutation start with a typed `task/created` event and `received` -> `patched` marks. This confirms the deployed 4-5s cross-user delay was the fallback refresh path; the remaining latency is now in the mutation/API path.

### 2026-06-08
- Type: Execution
- Summary: TASK-098 delivered a first-class Meeting Notes manager for project dashboards.
- Evidence: Created worktree `nexus_dash_task98` on `feature/task-98-meeting-notes-manager` and opened PR #331. Added `ProjectMeetingNote` and `ProjectMeetingNoteAction` persistence with project-scoped RLS, service-layer CRUD/search, session-user API routes, a dashboard Meeting Notes panel with search/list/detail/editor states, participant/input/output/decision/action fields, project summary counts, activity typing, docs, changelog, and tests. Bumped the product version to `0.19.0`.

### 2026-06-08
- Type: Validation
- Summary: TASK-098 passed local validation, CI, Copilot review handling, and branch-ref preview validation.
- Evidence: Local validation passed with `npm run lint`, local PostgreSQL `npm test` (122 passed, 2 skipped; 905 passed, 2 skipped), `npm run test:coverage` (91.37% statements, 81.33% branches, 92.2% functions, 91.88% lines), preview-env `npm run build`, and local `npm run test:e2e` (9/9). Copilot reviewed PR #331 and generated three actionable comments; commit `5547655` acknowledged meeting-note remote events before reload, switched meeting-note mutations to `fetchProjectActivityMutation`, and renamed the dashboard stat to `Meeting notes`, making the review threads outdated. GitHub checks passed on `5547655731e5e371cc4edcbe79670644d1075e6d` (branch name, Quality Core, E2E Smoke, Container Image). Preview workflow run `27170848710` was dispatched with `git_ref=feature/task-98-meeting-notes-manager`, logs showed checkout of `refs/remotes/origin/feature/task-98-meeting-notes-manager` and `git log -1 --format=%H` = `5547655731e5e371cc4edcbe79670644d1075e6d`, and deployed `https://nexus-dash-3bk1wylcj-dorian-agaesses-projects.vercel.app`. Preview Playwright passed with `PLAYWRIGHT_BASE_URL=https://nexus-dash-3bk1wylcj-dorian-agaesses-projects.vercel.app npx playwright test tests/e2e/smoke-project-task-calendar.spec.ts` (6/6), including the meeting-notes preparation, output, follow-up action, and search flow.

### 2026-06-09
- Type: Execution
- Summary: TASK-098 feedback pass reshaped Meeting Notes around preparation first, note-taking later.
- Evidence: Added meeting-note `labelsJson` and `status` via migration `20260609100000_task098_meeting_note_feedback`, reusing the task label normalization/color model. Replaced inline editing with modal flows: a Prepare meeting modal captures title, shared date picker value, participant chips, labels, and inputs; opening a note later captures outputs, todos, and state. Done notes are shown only in the Archived list, no note is selected by default, clicking the selected note closes it, and the Decisions UI was removed. Added a reusable `TokenInput` for participant/label chips and updated the shared calendar icon to use theme-aware coloring.

### 2026-06-09
- Type: Validation
- Summary: TASK-098 feedback pass passed local validation.
- Evidence: Applied the new migration to local PostgreSQL with `npx prisma migrate deploy`. `npm run lint` passed. Focused meeting-note/API/calendar tests passed (3 files / 16 tests). Full local PostgreSQL `npm test` passed (122 files passed, 2 skipped; 905 passed, 2 skipped). `npm run test:coverage` passed with 91.37% statements, 81.33% branches, 92.2% functions, and 91.88% lines. Preview-style `npm run build` passed. Targeted meeting-note Playwright passed. Full local Playwright `npm run test:e2e` passed 9/9 after setting local production-mode `NEXTAUTH_URL`, `NEXTAUTH_SECRET`, and `TRUSTED_ORIGINS`; an earlier full e2e run without those trusted-origin values failed only in the password-recovery smoke while the meeting-note smoke passed.

### 2026-06-09
- Type: Validation
- Summary: TASK-098 feedback pass passed branch-ref preview deployment and preview Playwright.
- Evidence: Pushed feedback commit `c7ac74164f41077d97ce244b1c76cebeb2b8a97f` to `feature/task-98-meeting-notes-manager`. Preview workflow run `27204436282` was dispatched with `git_ref=feature/task-98-meeting-notes-manager`, logs showed checkout of `refs/remotes/origin/feature/task-98-meeting-notes-manager` and `git log -1 --format=%H` = `c7ac74164f41077d97ce244b1c76cebeb2b8a97f`, and deployed `https://nexus-dash-4ansd69jm-dorian-agaesses-projects.vercel.app`. Preview Playwright passed with `PLAYWRIGHT_BASE_URL=https://nexus-dash-4ansd69jm-dorian-agaesses-projects.vercel.app npx playwright test tests/e2e/smoke-project-task-calendar.spec.ts` (6/6), including the modal meeting preparation, output/todo capture, archive, and search flow.

### 2026-06-10
- Type: Execution
- Summary: TASK-098 incorporated follow-up UX corrections for state selection, label filtering, and overdue todos.
- Evidence: Replaced the native meeting State select with an app-styled popover listbox, added explicit meeting-label filter chips, and added seven-day overdue todo highlighting at the Meeting Notes section and note-card level. Added TASK-314 for durable overdue reminder notifications/email and TASK-316 for a project-side panel aggregating open meeting todos.

### 2026-06-10
- Type: Validation
- Summary: TASK-098 follow-up UX corrections passed local validation.
- Evidence: `npm run lint` passed. Focused meeting-note/API/calendar tests passed (3 files / 16 tests). Full local PostgreSQL `npm test` passed (122 files passed, 2 skipped; 905 passed, 2 skipped). `npm run test:coverage` passed with 91.37% statements, 81.33% branches, 92.2% functions, and 91.88% lines. Targeted meeting-note Playwright passed after scoping the overdue assertion to the Meeting Notes header. Full local Playwright `npm run test:e2e` passed 9/9 with local production-mode `NEXTAUTH_URL`, `NEXTAUTH_SECRET`, and `TRUSTED_ORIGINS`.

### 2026-06-10
- Type: Validation
- Summary: TASK-098 follow-up UX corrections passed branch-ref preview deployment and preview Playwright.
- Evidence: Pushed commit `7bcdae7c2c82b2e3066bde42a0703591094817d6` to `feature/task-98-meeting-notes-manager`. Preview workflow run `27280585844` was dispatched with `git_ref=feature/task-98-meeting-notes-manager`, logs showed checkout of `refs/remotes/origin/feature/task-98-meeting-notes-manager` and `git log -1 --format=%H` = `7bcdae7c2c82b2e3066bde42a0703591094817d6`, and deployed `https://nexus-dash-eb4r57ftj-dorian-agaesses-projects.vercel.app`. Preview Playwright first passed 4/6 and failed twice in the shared project-creation helper before reaching the changed meeting-note UI; rerunning `PLAYWRIGHT_BASE_URL=https://nexus-dash-eb4r57ftj-dorian-agaesses-projects.vercel.app npx playwright test tests/e2e/smoke-project-task-calendar.spec.ts` passed 6/6, including label filtering, overdue todo highlighting, and the app-styled State picker flow.

### 2026-06-18
- Type: Review
- Summary: TASK-098 addressed the refreshed Copilot review's legacy data-preservation finding.
- Evidence: Copilot found that meeting preparation and note-taking updates sent `decisions: ""`, erasing values created before the Decisions UI was removed. Updated the shared payload and preparation save path to retain the stored `decisions` value, and extended the meeting-notes Playwright flow to seed legacy data and verify it survives both update paths. `npm run lint`, the Playwright-triggered `npm run build`, and focused meeting-note API/service tests (2 files / 10 tests) passed. Local PostgreSQL-backed validation was blocked because Docker Desktop's Linux engine returned HTTP 500. Commit `13f2d63ccfee484e3c57bcec18e708fb56edf75d` was deployed by branch-ref preview workflow run `27726221721` with `git_ref=feature/task-98-meeting-notes-manager` to `https://nexus-dash-39lkz815n-dorian-agaesses-projects.vercel.app`; preview Playwright passed all 6 project smoke specs, including preservation of a seeded legacy decision after preparation and note-taking saves.
### 2026-06-19
- Type: Implementation
- Summary: TASK-318 added a complete Prisma RLS inventory, forced policy coverage for previously unclassified project-derived tables, and a least-privilege PostgreSQL tenant-isolation CI lane.
- Evidence: `prisma/rls-inventory.json` classifies all 33 Prisma models with an enforcement owner and rationale. Migration `20260619120000_task318_rls_coverage` enables and forces RLS for `TaskCommentReaction`, `ApiCredential`, `ApiCredentialScopeGrant`, and `AuthAuditEvent`, and replaces pre-authentication credential table reads with an exact-public-ID security-definer function. `npm run rls:check`, focused agent-access/inventory tests, the full 911-test unit suite, lint, version policy, Prisma validation, and the production build passed locally.

### 2026-06-19
- Type: Validation
- Summary: TASK-318 local real-PostgreSQL validation was deferred to the new branch CI lane because the workstation Docker Desktop Linux engine was unavailable.
- Evidence: Docker Desktop returned HTTP 500 for engine API requests, `127.0.0.1:5432` refused connections, and no local PostgreSQL service was installed. The repository now provisions a non-superuser `NOBYPASSRLS` role in the `Tenant Isolation (PostgreSQL RLS)` GitHub Actions job, keeps migration and runtime URLs separate, and runs the cross-project CRUD/role/child-row/credential matrix there.

### 2026-06-19
- Type: Review
- Summary: TASK-318 opened ready-for-review PR #344 and completed CI plus Copilot review without findings.
- Evidence: Commit `4f4b58696fb36f892990595b87054231a3a43712` was pushed to `feature/task-318-rls-coverage-tenant-isolation`. Quality Gates run `27850744706` passed Quality Core, the new PostgreSQL Tenant Isolation job, E2E Smoke, and Container Image. Copilot reviewed 22 of 23 changed files and generated no comments or unresolved review threads.

### 2026-06-21
- Type: Integration
- Summary: TASK-318 resolved its merge conflict against TASK-319 and reconciled post-merge task tracking.
- Evidence: Merged `origin/main` at `401fef055d914002154c478492e23ce17ceb3d7d`, preserved TASK-319's patched Hono `4.12.26` dependency resolution and `v0.19.2` changelog entry, retained TASK-318's `v0.20.0` feature release, moved TASK-319 and TASK-318 to one completed backlog entry each, and advanced TASK-316 to the current queue position. `npm ci`, `npm run security:audit`, `npm run rls:check`, feature version-policy validation, `npm run lint`, the full unit suite (123 files passed, 2 skipped; 909 tests passed, 2 skipped), and `npm run build` passed after resolution.

### 2026-06-21
- Type: Implementation
- Summary: TASK-316 added a project-wide floating Meeting Todos panel and focused todo mutation boundary.
- Evidence: Added a responsive floating table that is visible across the project dashboard, can collapse to a compact control, aggregates open meeting todos overdue-first, includes source meeting dates and labels, keeps completed items available for reopening, and opens the source meeting note directly. Added an atomic action-completion API/service path with editor authorization and activity updates so todo toggles do not replace every action in the meeting note; reopening a todo from an archived meeting returns the note to `actions_in_progress`. Bumped the feature release to `v0.21.0`.

### 2026-06-21
- Type: Validation
- Summary: TASK-316 passed the available non-Docker local validation baseline.
- Evidence: Docker was intentionally not used because the workstation WSL engine is unavailable. `npm run lint`, the full Vitest suite (124 files passed, 2 skipped; 917 tests passed, 2 skipped), `npm run test:coverage` (91.37% statements, 81.33% branches, 92.2% functions, 91.88% lines), `npm run security:audit`, `npm run rls:check`, and a production Next.js build with local-safe placeholder connection/secrets passed. Playwright passed all 9 repository E2E flows against the branch dev server, including the new meeting-todo aggregation, complete, reopen, overdue metadata, and source-meeting navigation workflow.

### 2026-06-21
- Type: Review
- Summary: TASK-316 completed CI and Copilot review handling on PR #345.
- Evidence: Initial commit `9902fe8b90d83a72b6216ab540a7ca8ad6968c8e` opened the ready-for-review PR. Quality Core caught stale `v0.20.0` expectations in the app-metadata fallback tests; commit `088adda11f408cc925039250df8aa6bda62d40c9` aligned them with the `v0.21.0` feature release. Refreshed Quality Core, E2E Smoke, Tenant Isolation, Container Image, and branch-name checks passed. Copilot reviewed 16 of 17 files and generated no comments or unresolved threads.

### 2026-06-21
- Type: Validation
- Summary: TASK-316 passed final branch-ref preview deployment and preview Playwright.
- Evidence: Manual preview workflow run `27918545154` used `git_ref=feature/task-316-meeting-todo-side-panel`; logs showed checkout of `refs/remotes/origin/feature/task-316-meeting-todo-side-panel`, commit `088adda11f408cc925039250df8aa6bda62d40c9`, and app version `0.21.0`. The workflow deployed `https://nexus-dash-4bzwscs5j-dorian-agaesses-projects.vercel.app`, where the targeted meeting-notes Playwright flow passed, including todo aggregation, overdue metadata, complete/reopen, and source-meeting navigation.

### 2026-06-23
- Type: Iteration
- Summary: TASK-316 follow-up changed the todos surface from a meeting-notes-area launcher/drawer into a project-wide floating table.
- Evidence: Removed the Meeting Notes header Todos button, kept the aggregation and atomic mutation boundary, and made the floating Meeting Todos panel visible across the project dashboard with a compact collapsed state. The panel now sits mid-right, uses a smaller card layout, drops table headers, labels, dates, and explanatory copy, and keeps only todo text, source meeting context, overdue/count state, and completion/reopen controls. The panel stays out of the DOM when there are no open or recently completed meeting todos, avoiding empty-state overlap with unrelated dashboard interactions. Updated the Playwright smoke flow to assert the floating region is visible without a launcher, collapses/expands, still completes/reopens todos, and still opens the source meeting note. `npm run lint`, full Vitest with `NODE_ENV=test` (124 files passed, 2 skipped; 917 tests passed, 2 skipped), `npm run test:coverage`, production `npm run build` with local-safe placeholder connection/secrets, and targeted Playwright meeting-notes plus roadmap drag/drop flows against `localhost:3016` passed. Docker remained intentionally unused because the workstation WSL engine is unavailable.

### 2026-06-25
- Type: Implementation
- Summary: TASK-314 added durable meeting-todo overdue reminders to the existing notification dispatcher.
- Evidence: Added `meeting_todo_overdue_reminder` notification metadata, email digest rendering, dispatcher reconciliation, idempotent source IDs, project-access checks, and workflow summary fields. The reminder scan selects incomplete `ProjectMeetingNoteAction` rows whose parent meeting note is at least seven local calendar days old, targets the meeting-note creator while they still own or belong to the project, and reuses the existing `Notification` uniqueness plus email item coverage for durable per-window idempotency. Updated the notification dispatch runbook, workflow summary parsing, `v0.22.0` changelog/version metadata, and focused service/API tests. Initial implementation commit: `c6dae7fe5104f6fcb0ee9dc50802ba878e0a154f`.

### 2026-06-25
- Type: Review
- Summary: TASK-314 opened PR #346 and addressed Copilot review feedback.
- Evidence: PR #346 (`https://github.com/dorianagaesse/nexus_dash/pull/346`) was opened from `feature/task-314-meeting-todo-overdue-reminders`. Copilot flagged stale current-task status and brittle `$queryRaw.mock.calls[index]` assertions. Commit `2dc291ef164f656b624f92b2d916e398f1035764` updated task status, replaced the brittle assertions with query-signature helpers, added the missing preview dispatch summary field coverage, and resolved all Copilot review threads. Commit `39f80f2da44419fa37c3cb7ec9114f673879204b` fixed the manual preview deploy environment so `NOTIFICATION_EMAIL_DISPATCH_SECRET` is injected for protected dispatch validation.

### 2026-06-25
- Type: Validation
- Summary: TASK-314 passed local, CI, and guarded preview dispatcher validation.
- Evidence: Local validation passed with `npm run lint`, `npm run rls:check`, focused notification/API tests, local PostgreSQL `npm test` (124 files passed, 2 skipped; 922 tests passed, 2 skipped), `npm run test:coverage` (91.37% statements, 81.33% branches, 92.2% functions, 91.88% lines), preview-env `npm run build`, and `git diff --check`. PR #346 checks passed on `39f80f2da44419fa37c3cb7ec9114f673879204b` for branch name, Quality Core, E2E Smoke, Tenant Isolation, and Container Image. Preview workflow run `28135528412` checked out `feature/task-314-meeting-todo-overdue-reminders` at `39f80f2da44419fa37c3cb7ec9114f673879204b`, deployed app version `0.22.0` to `https://nexus-dash-hyp9z5w0q-dorian-agaesses-projects.vercel.app`, and showed `NOTIFICATION_EMAIL_DISPATCH_SECRET` available to the deploy. Notification dispatch workflow run `28135630372` against that preview succeeded with `ok: true`, `meetingTodoOverdueRemindersReconciled: 0`, all delivery counts at `0`, and `errors: 0`, proving the protected reminder path can run safely without sending unintended external email.

### 2026-06-25
- Type: Implementation
- Summary: TASK-119 added project dashboard collaborator presence.
- Evidence: Replaced the completed TASK-314 active brief with a TASK-119 brief, branched from `origin/main` as `feature/task-119-project-collaboration-presence-ux`, and implemented a server-rendered `ProjectCollaborationPresence` block in the project header. The block reuses the existing viewer-authorized `listProjectCollaborators(...)` service path, generated `UserAvatar` identities, role labels, screen-reader-only full member context, and compact overflow behavior while leaving owner-only sharing/settings management unchanged. Added optional `UserAvatar` title support and protected long project names on mobile with `overflow-wrap:anywhere`. Added `v0.23.0` release metadata and changelog notes for the user-facing collaboration feature.

### 2026-06-25
- Type: Validation
- Summary: TASK-119 passed local validation and visual dashboard checks.
- Evidence: `npm run lint`, `npm run rls:check`, full local PostgreSQL `npm test` (125 files passed, 2 skipped; 925 tests passed, 2 skipped), `npm run test:coverage` (91.37% statements, 81.33% branches, 92.2% functions, 91.88% lines), production `npm run build` with local-safe placeholder secrets, and `PORT=3001 npm run test:e2e` with outbound email disabled passed. Focused presence/project-service tests passed. Local dev server `http://127.0.0.1:3000` rendered a seeded three-member project dashboard; screenshots `.tmp/task119-presence-desktop.png` and `.tmp/task119-presence-mobile.png` confirmed desktop/mobile containment after the title-wrap fix. The visual probe also observed an existing meeting-notes search-input hydration warning unrelated to the new presence component.
