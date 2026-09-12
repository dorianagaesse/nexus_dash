# Current Task

## ND-179: Project ownership continuity and collaborator offboarding

The active implementation brief follows the preserved ND-426, ND-382, and
ND-438 snapshots below.

## Previous Task Snapshot — ND-426

### Zoomable meeting note input and output

## Status

Delivered. Ready-for-review PR #499
(https://github.com/dorianagaesse/nexus_dash/pull/499) is open from
`feature/nd-426-zoomable-meeting-notes` in dedicated worktree
`../nexus_dash_task426`, originally branched from `origin/main` at 2fbc228 and
reconciled with current `origin/main` at a80a33a (v0.63.0), with release
metadata finalized at v0.64.0. The Nexus Dash card ND-426 is the source of
truth and carries the `feature` label. No counterpart GitHub issue exists;
the PR carries the ND-426 reference.

Layout-feedback rounds (2026-09-10 through 2026-09-12): editable Inputs and
Outputs now keep their zoom pills inside the rich-text field at the bottom
right, with reserved content padding and browser geometry assertions. The
temporary outer `SectionBlock` frames introduced during the first feedback
round were removed from both editable surfaces, restoring their pre-ND-426
label/editor presentation while preserving zoom. The existing read-only
Inputs section remains unchanged; read-only Outputs keeps its zoom action in
the label row because it has no editable field.

Post-merge validation passed (2026-09-12): lint, `rls:check`, `release:check`,
and `git diff --check` clean; full Vitest 190 files / 1,398 tests passed (2
files / 2 tests skipped); coverage above thresholds (statements 93.45%,
branches 84%, functions 95.3%, lines 93.75%); production build green; the
meeting-note rich-text and zoom flow green, and the full Playwright suite
green (59 passed / 1 skipped). Copilot's initial review
recommended approval and raised one maintainability comment: the zoom data
attribute used locale-sensitive lowercasing. Commit 4e9da2b switched it to
stable `toLowerCase()` tokens with regression assertions; the review reply
was posted and the sole conversation resolved.

## Context

Meeting preparation inputs and meeting outputs can contain long, dense notes,
but their text is fixed at one size inside the meeting-note panel. Readers
need an accessible way to scale each note body without enlarging the
surrounding application chrome or changing the stored content.

## Product Decisions

- Inputs and Outputs receive separate inline zoom controls so readers can
  scale the two bodies independently while the dialog chrome stays stable.
- Editable Inputs and Outputs retain their pre-ND-426 label/editor styling,
  with the zoom pill anchored inside the field at the bottom right and enough
  bottom padding to prevent content overlap. Read-only note bodies retain
  their established presentation and expose the corresponding zoom action.
- Each control uses familiar zoom-out/percentage/zoom-in affordances, changes
  in 25% steps from 75% through 200%, exposes section-specific accessible
  names and a live percentage, and disables its boundary action.
- Zoom is local presentation state only. It applies to the rich-text input
  read view, the preparation input editor, and the output editor/read view,
  but never enters an API payload or changes stored note content.
- Long content keeps wrapping within the existing vertically scrollable
  dialog/editor surfaces; the feature adds no nested horizontal scroller and
  works identically for editors and viewers.

## Scope

- Add a focused reusable meeting-note zoom control and text-style contract.
- Wire independent input/output zoom state into rich-text read and edit
  surfaces in the note detail and preparation dialogs.
- Preserve the existing rich-text format, note CRUD, status, todo, mention,
  emoji, permission, and responsive-dialog behavior.
- Add focused automated coverage plus real-browser mobile containment checks.

## Out Of Scope

- Browser/page zoom, pinch gesture interception, full-screen note viewing, or
  persisted per-user zoom preferences.
- Changes to the meeting-note rich-text content/storage contract delivered by
  ND-381.
- API, database, service, auth, or meeting-note data-model changes.

## Acceptance Criteria

1. Inputs and Outputs each expose visible zoom-out and zoom-in buttons with
   accessible section-specific names, a live percentage, visible keyboard
   focus, and disabled controls at the 75%/200% limits.
2. Each control changes only its corresponding rich-text note body's rendered
   text size in 25% steps; Inputs and Outputs can hold different zoom levels,
   and the default is 100%.
3. Zooming never changes the draft or persisted rich-text content, the dialog
   chrome stays at its normal scale, and editor/viewer permissions, formatting,
   mentions, emoji insertion, and save behavior are unchanged.
4. The controls and scaled content remain usable at 375px, in mobile
   landscape, and in light/dark themes without horizontal page overflow; long
   content wraps and remains reachable through the existing vertical scroll
   regions.

## Definition Of Done

- A focused reusable meeting-note zoom control and zoom-style contract cover
  the input/output rich-text read and edit surfaces.
- Component/unit coverage verifies labels, boundaries, independent scale
  values, rich-text integration, and presentation-only behavior; Playwright
  covers keyboard/touch-visible controls, scaling, and mobile containment in
  the real meeting-note flow.
- `git diff --check`, `npm run lint`, `npm run rls:check`, `npm run
  release:check`, `npm test`, `npm run test:coverage`, `npm run build`, and
  the relevant Playwright coverage pass.
- `package.json`/`package-lock.json` advance to v0.64.0 over `origin/main`
  v0.63.0 and CHANGELOG carries a dated v0.64.0 entry for ND-426.
- The Nexus Dash board card moves In Progress and then Done on delivery;
  `tasks/current.md` and `journal.md` reflect execution and validation.
- The branch is pushed, a ready-for-review PR referencing ND-426 is open, CI
  is green, and Copilot's initial review outcome is triaged with addressed
  conversations resolved.

## Runtime Assumptions

- Existing PostgreSQL, authentication, and environment contracts remain
  unchanged; zoom is entirely client-side presentation state.
- Preview validation uses the explicit active branch ref and the ignored
  `.tmp/.nd-preview.env` credentials supplied for this task.

## Previous Task Snapshot — ND-382

### Expose active project agents in mention and assignment pickers

## Status

In Progress (2026-09-09; RLS-safe-read fix 2026-09-10). Branch
`feature/nd-382-active-project-agent-pickers` uses the dedicated worktree
`../nexus_dash_nd382_wt`. The branch has been merged forward to `origin/main`
at 6426c1a (v0.62.0), which includes the canonical project-actor foundation
from ND-178 / PR #489. The Nexus Dash board card is In Progress.

Preview validation of the PR #497 head (2026-09-10) found no agents in
@mention autocomplete or task-assignee pickers. Root cause: the ND-382 actor
registry loaders read `ApiCredential` through a direct Prisma include, but
`api_credential_select_policy` exposes credential rows to the project owner
only under forced RLS — so editor/viewer members got zero agent rows in real
least-privilege environments. Local tests masked the gap because the test DB
connection bypasses RLS. Fix on the branch: the registry now loads through a
new `app.list_project_actors(projectId)` SECURITY DEFINER projection (the
established context-card stewardship pattern), the RLS isolation matrix pins
the direct-read-hidden / function-visible contract, actor-search error
responses carry `no-store`, and the ND-382 e2e spec adds a viewer read
assertion. See the 2026-09-10 journal entry for validation evidence.

Retest on 2026-09-11 traced the remaining "no agent in the pickers" report to
preview routing, not the branch: every `deploy-preview` run reassigns the one
stable preview auth alias (the `.tmp/.nd-preview.env` base URL), and a later
run for another branch left it serving that branch's build (revision
`33c8f95`), where the ND-382 routes do not exist at all. The branch was merged
forward to `origin/main` at d64dbb3 (only `journal.md` conflicted), and the
ND-382 preview was redeployed so the alias resolves to the branch head; live
alias verification passed (readiness revision `8e339cd`, agent token
exchange, and `GET /actors/search` returning the active project agent next to
the humans). See the 2026-09-11 journal entry.

Retest on 2026-09-12 narrowed the remaining task-assignee gap (mention
autocomplete showed the agent, the assignee picker did not) to a stale server
payload: task pickers are rendered from the route's actor list, which only
refreshes on navigation/reload, while the mention autocomplete fetches
`/actors/search` live — so an agent credential created from the project's
"Agent access" panel appeared in mentions but not in assignee pickers until a
manual reload. The owner actions now call `router.refresh()` after credential
create/revoke so pickers update in place, and the ND-382 e2e spec covers the
create-then-open-picker flow with no reload in between. The mention-row and
task-assignee disabled treatments remain by design (ND-383/ND-384 own
persistence). Validation on the fix commit `eb7edb0` is green (lint,
`rls:check`, 1,394 Vitest tests, coverage, production build, focused
Playwright spec including the regression flow); the preview was redeployed
(run 34655417001) and the alias serves `eb7edb0` with a live
`GET /actors/search` returning the active agent. See the 2026-09-12 journal
entry.

## Context

Project collaboration controls do not expose one consistent actor set. Meeting
todo and context stewardship already resolve active human members and active
agent credentials, while task-assignee controls and @mention autocomplete use
human-only collaborator/member contracts. This task makes active credential
identities discoverable through one project-scoped actor contract and gives
agent rows the same recognizable, accessible treatment everywhere they appear.

## Scope

- Add an authorized project-actor discovery/search service and route backed by
  the ND-178 actor registry; match humans by username/name/email and agents by
  credential label without returning credential secrets or token material.
- Use the shared actor result contract in supported @mention autocomplete and
  assignment-picker presentation instead of maintaining human-only query and
  rendering paths.
- Present agents with the shared Lucide bot avatar and an explicit `Agent`
  text label, preserving keyboard/listbox behavior, visible focus, compact
  mobile layout, and light/dark token styling.
- Exclude revoked or expired credentials from new-selection results while
  preserving already-stored historical agent identity snapshots.

## Out Of Scope

- Persisting agent-tag events or changing comment notification behavior; that
  is ND-383.
- Adding task/meeting-todo agent assignment persistence, assignment history, or
  assignment audit events; that is ND-384. Existing meeting-todo agent
  assignment behavior remains supported.
- Agent attention/work-queue APIs (ND-385), credential lifecycle changes, or
  new agent permissions.

## Acceptance Criteria

1. Typing `@` in supported comment and rich-text composers queries a
   project-scoped actor endpoint that returns eligible human members and every
   active agent credential matching the query.
2. Assignment-picker option contracts can render the same active project-agent
   identities alongside eligible humans; existing meeting-todo agent choices
   remain selectable and task controls do not silently submit an unsupported
   credential as a human user.
3. Agent rows use the credential label as display identity plus a visible
   `Agent` treatment and shared agent avatar; listbox semantics, arrow-key/
   Enter/Escape interaction, focus visibility, 375px layout, and both themes
   remain coherent.
4. Revoked and expired credentials are omitted from discovery/new-selection
   results, while stored inactive-agent summaries continue to render with their
   durable snapshot and reassignment state.
5. Discovery enforces project access for human and agent callers, applies a
   bounded result limit, and exposes no API-key, token, hash, or credential
   owner secret material.
6. Mention and assignment surfaces consume shared actor mapping/presentation
   helpers rather than implementing incompatible agent identity shapes.

## Definition Of Done

- Shared actor search, route mapping, picker row treatment, and affected
  consumers are implemented with focused service, route, and component tests.
- `npm run lint`, `npm run rls:check`, `npm test`, `npm run test:coverage`,
  `npm run build`, focused/full Playwright UI coverage, and `git diff --check`
  are green.
- The product minor version and CHANGELOG are advanced per release policy;
  `tasks/current.md`, `journal.md`, and the live ND-382 card reflect delivery.
- The branch is pushed and a ready-for-review PR is open; Copilot's initial
  review outcome is triaged and all addressed conversations are resolved.

## Runtime Assumptions

- Production board access uses the gitignored
  `.config/.nd-nexus-dash.env` agent credential contract. Preview UI validation
  uses the gitignored `.tmp/.nd-preview.env` access bundle from the main
  checkout if a deployed preview is required.
- The stable preview auth alias is shared by every branch preview: each
  `deploy-preview` run re-points it to the newest validated deployment.
  Before a preview retest handoff, re-run `deploy-preview` for this branch
  and verify `GET /api/health/ready` reports the expected revision.
- No new database table, model, or RLS policy is introduced by ND-382; the
  2026-09-10 fix adds one SECURITY DEFINER projection function migration
  (`app.list_project_actors`) alongside ND-178's actor schema already present
  on `main`.

## Previous Task Snapshot — ND-438

### Add a task-by-id fetch endpoint (GET task/:id) and open deep-linked tasks missing from the board list

## Status

Delivered (2026-09-08). PR #496
(https://github.com/dorianagaesse/nexus_dash/pull/496) is open
ready-for-review from `feature/nd-438-task-by-id-fetch-deep-link`, branched
from `origin/main` at c676716 and merged forward to `origin/main` at 37f5cd9
(ND-424 landed as v0.61.0 via PR #492 while ND-438 was in flight; the
product code merged cleanly and the overlapping release/doc files were
reconciled). The Nexus Dash board card ND-438 (feature label) is the source
of truth; flipped to In Progress on 2026-09-08 and to Done on delivery via
the agent API. No GitHub issue exists for this task; the PR carries the
ND-438 reference. Release advanced to v0.62.0 over origin/main v0.61.0
(CHANGELOG dated entry).

Local validation passed (2026-09-08): lint, `rls:check`, release version
check, and `git diff --check` clean; full Vitest 185 files / 1,379 tests
passed (2 skipped); coverage above thresholds (statements 93.33%, branches
83.82%, functions 94.63%, lines 93.63%); production build green; the ND-438
Playwright spec (3/3: already-loaded deep link opens with zero by-id
fetches, absent id triggers exactly one by-id fetch and opens, unresolvable
id leaves the board unchanged) and the full e2e suite (58 passed / 1
skipped) green against local Postgres; CI on the head commit green (Quality
Core, E2E Smoke, Tenant Isolation, Container Image).

Copilot review round 1 flagged one issue on PR #496 — the remote-fetch
deep-link path did not clear `shouldOpenTaskInEditModeRef` before opening
the fetched task, unlike the already-loaded path — fixed in a8070f5 with a
reply on the review thread explaining why no dedicated regression test was
added (the stale-ref sequence needs client-side search-param navigation the
app does not expose, and full-board jsdom mounts are a documented OOM dead
end). The round-1 thread was then resolved on the PR (required review-thread
resolution); PR #496 merge state is clean on head a8070f5 with all CI checks
green.

## Context

No Nexus Dash API surface can return a single task by its id today. The
kanban UI holds tasks in memory from the board-list fetch
(`GET /api/projects/{projectId}/tasks`), and the task-scoped route
`app/api/projects/[projectId]/tasks/[taskId]/route.ts` implements only
PATCH/DELETE, so the client board session is the only place that maps a task
id to its data. Two gaps follow:

- A deep link such as `/projects/{projectId}/tasks/{taskId}` (or `?taskId=`
  on the board) silently does nothing when the target task is not among the
  initially loaded board tasks: KanbanBoard's initial-task effect returns
  early when the id is missing from the loaded `taskById` map.
- A project agent that knows only a task id must pull the entire project task
  list to read one card.

A project-scoped task-by-id GET closes both gaps using the existing route,
service, and authorization conventions, purely additively.

## Scope

- Add GET to the existing project-scoped task route
  `app/api/projects/[projectId]/tasks/[taskId]/route.ts`, backed by a
  service-level read in `lib/services/**` that authorizes the requester
  against the project and returns the same task shape the task-list surface
  exposes (title, description, labels, epic, related tasks, assignee,
  attachments).
- Accept both user-session and project-agent bearer credentials exactly like
  the sibling task endpoints; reads never write.
- Expose the GET operation in the agent OpenAPI contract and hosted docs
  alongside the existing PATCH/DELETE operations for the same path, with
  response typing shared with the task-list surface.
- Wire the board deep-link flow so a `?taskId=` target (or the
  `/projects/[projectId]/tasks/[taskId]` page redirect) that is absent from
  the initially loaded list is fetched by id through the new endpoint and
  opened in the detail modal.

## Out Of Scope

- Changing task-list endpoints, counts, board data loading, or archive
  semantics.
- Batch/multi-task reads, search, or any new write capability.
- New task detail UI beyond the deep-link fetch fallback described above.

## Acceptance Criteria

1. `GET /api/projects/{projectId}/tasks/{taskId}` returns the complete single
   task for any requester who can see the project (owner/editor/viewer
   sessions and project agents) and matches the response shape of the task
   list items.
2. Unknown, deleted, or other-project task ids behave exactly like the
   neighboring task endpoints (404/403/401 per existing session and
   credential rules) and never leak a task's existence across projects.
3. The agent OpenAPI document and hosted docs list the GET operation on
   `/api/projects/{projectId}/tasks/{taskId}` with response typing shared
   with the task-list surface.
4. Opening the board with `?taskId=` (including via the
   `tasks/[taskId]` page redirect) opens the detail modal when the task is
   absent from the loaded list by fetching it by id; behavior is unchanged
   when the task is already loaded, and a nonexistent id preserves today's
   no-open behavior with no error regression.
5. Purely additive: task list reads, writes, RLS, and existing board/e2e
   coverage do not regress.

## Definition Of Done

- Route GET handler plus a project-scoped service read with unit and
  route-level coverage for session and agent credential paths (success,
  cross-project 404, non-member denial).
- Component and Playwright coverage for the deep-link fallback
  (missing-from-list task opens after by-id fetch; already-loaded and
  nonexistent ids unchanged) and the focused Kanban e2e specs stay green.
- `npm run lint`, `npm run rls:check`, `npm test`, `npm run test:coverage`,
  and `npm run build` pass; `npm run test:e2e` green for the board flows
  touched.
- `package.json`/`package-lock.json` advance minor over the current
  origin/main release and the CHANGELOG carries a dated entry documenting the
  endpoint; the version number is resolved at implementation time against
  origin/main.
- The Nexus Dash board card ND-438 is updated (In Progress, then Done on
  delivery) and `tasks/current.md` + `journal.md` reflect the execution.
- Branch is pushed with an open ready-for-review PR referencing ND-438; the
  Copilot review outcome is triaged and threads resolved before handoff.

## Runtime Assumptions

- Existing PostgreSQL, authentication, and `.env` contracts remain unchanged;
  this task introduces no schema change.
- Validation runs locally against the repository `.env` contract and a
  reachable PostgreSQL instance when E2E execution requires it; preview
  deployment is not an acceptance requirement.


## Previous Task Snapshot


# Current Task

## ND-424: Allow agents to attach link attachments to existing tasks

## Status

Delivered (2026-09-08): PR #492
(https://github.com/dorianagaesse/nexus_dash/pull/492) is open from
`feature/nd-424-agent-link-attachments` (worktree `../nexus_dash_task424`,
branched from `origin/main`, version base v0.56.0) and closes issue #486.
On 2026-09-08 `origin/main` (c676716, v0.60.0 after ND-427 merged via PR
#494) was merged into the branch: the product code merged cleanly, and the
five overlapping files (CHANGELOG, journal, package metadata,
`tasks/current.md`) were reconciled by hand with the release metadata
retargeted from v0.57.0 to v0.61.0 (`release:version -- feature` over the
merged v0.60.0 base; dated `## v0.61.0 - 2026-09-08` CHANGELOG entry). The
Nexus Dash board card ND-424 (feature label) tracks GitHub issue #486 —
attached to the card at creation as a link attachment — and sits in Done with
a Report section appended. The API shape was confirmed with the user on
2026-09-07: the task-update route gains `attachmentLinks` on
`PATCH /api/projects/{projectId}/tasks/{taskId}` (pure JSON, append-only,
read-back via the existing `attachments` list in the task response) rather
than agent scopes on the UI composer route. Removing attachments was already
agent-capable and stays on
`DELETE /tasks/{taskId}/attachments/{attachmentId}`.

Preview acceptance (2026-09-08) passed 14/14 against the PR #492 head
deployed to nexus-dash-5aifahhbx-dorian-agaesses-projects.vercel.app
(`deploy-vercel.yml` `deploy-preview` run 34234352574 with
`git_ref=feature/nd-424-agent-link-attachments`), plus a status-transition
spot check via POST: token exchange, health, OpenAPI documenting
`TaskUpdateRequest.attachmentLinks`, PATCH append with read-back in the same
response, persistence in the task list, append-only preservation of existing
attachments, hostname-derived default names for unnamed links, 400
`attachment-link-invalid` with nothing written, and creation-time
`attachmentLinks` unchanged. Local validation on the reconciled tree is also
green: lint, `rls:check`, `release:check`, `git diff --check`, 1,374 Vitest
tests passed (2 skipped) across 184 files, coverage above thresholds (93.33%
statements / 83.76% branches / 95.27% functions / 93.64% lines), and a clean
production build.

Copilot review round (2026-09-07/08): one thread on agent.md flagged that the
guidance called attachment removal kanban-UI-only; the claim was stale — the
dedicated attachment DELETE route already serves agents — so the text now
scopes the UI-only claim to in-place link editing (ND-425) and points agents
at the DELETE route. Fixed in 2464a84 with a reply on the thread; the thread
is outdated after the origin/main merge, and a fresh Copilot review round runs
against the reconciled head before handoff.

## Context

Nexus Dash agents manage cards through the project-scoped agent API. When a
task tracks a GitHub issue or other external resource, the canonical practice
is to attach it as a link attachment (`attachmentLinks` as `{ name, url }`
objects) at creation time — the create route accepts the field and the
kanban renders openable link rows. Adding links to a task created earlier
required the kanban UI (user session only): the agent composer is not in
scope of the project-scoped bearer tokens, and the task-update route had no
`attachmentLinks` input. The gap was tracked as ND-424 (GitHub issue #486)
on the Nexus Dash board, with ND-425 auditing the wider agent API for
similar edit gaps. Link attachments are stored on the shared `TaskAttachment`
kind=`link` rows (no file bytes, no storage keys), so adding them needs no
upload flow, MIME/size validation, or storage access.

## Product Decisions

- **`attachmentLinks` on the task-update route (confirmed with the user).**
  `PATCH /api/projects/{projectId}/tasks/{taskId}` accepts an optional
  `attachmentLinks` array of `{ name, url }` objects that mirrors the
  create-task contract: each entry creates a new kind=`link` attachment,
  existing attachments are preserved, and an empty array appends nothing.
  Removal stays on the dedicated attachment DELETE route (already
  agent-capable), so update never destructively replaces attachments.
- **Pure JSON partial update.** The field follows the route's existing
  presence-check (`hasOwnProperty`) partial-update semantics; unknown or
  malformed entries return 400 `attachment-link-invalid` exactly like the
  create route. Names default to the URL hostname and URLs are normalized
  through the shared `parseAttachmentLinksJson` parser, so create and update
  accept the same shapes.
- **Same authorization as any task update.** The field needs no new scope:
  human editors and agents holding `task:write` for the project can append
  links, and the RLS tenant isolation path is unchanged because the write
  happens inside the same actor-scoped transaction as the task update.
- **Read-back in the same response.** The update response already carries
  the full task record; the mapped `attachments` list includes the new link
  rows, so an agent can attach and verify in one round trip (no extra GET).
- **Documentation surfaces stay in sync.** The OpenAPI `TaskUpdateRequest`
  schema (shared by single and bulk task updates) documents the field, the
  agent guide's update example demonstrates a links-only PATCH, and
  `agent.md` / `CLAUDE.md` guidance is updated.

## Scope

- Parse and append `attachmentLinks` in `updateTaskForProject`
  (`lib/services/project-task-service.ts`) through the existing
  `parseAttachmentLinksJson` + `createTaskAttachmentsFromDraft` helpers,
  inside the update transaction and after the task row update.
- `TaskUpdateRequest.attachmentLinks` in the agent OpenAPI document
  (`lib/agent-onboarding.ts`) plus a links-only PATCH block in
  `buildAgentTaskUpdateExample` for the hosted guide.
- Guidance updates in `agent.md` and `CLAUDE.md` (drop the "UI-only today"
  claim, point to the PATCH contract).
- Route-level tests in `tests/api/task-update.route.test.ts` (agent append +
  read-back with `task:write`, agent denial without the scope, human append,
  invalid URL and non-array 400s, empty-array no-op) and schema assertions in
  `tests/api/agent-openapi.route.test.ts`.
- Version bump to v0.61.0 (feature minor over the reconciled v0.60.0 base)
  with a dated CHANGELOG section; board card, `tasks/current.md`, and
  `journal.md` updates.

## Out Of Scope

- Editing or removing existing link attachments through task update: removal
  stays on `DELETE /tasks/{taskId}/attachments/{attachmentId}` (agent-capable
  today), and in-place link editing has no API surface (delete + re-add).
- Link attachments on context cards through update flows (context-card
  attachment upload is agent-capable; link-add on context-card update is not
  part of this card).
- File attachments through task update (still require the upload-url / direct
  finalize flow); the UI composer, comments, status transitions, and create
  route are untouched.
- ND-425 (wider audit of agent API edit gaps) — separate board card.

## Acceptance Criteria

1. An agent credential can attach a `{ name, url }` link to an existing task
   via the agent API (`PATCH` with `attachmentLinks`) and reads it back in
   the task's attachments list of the same response.
2. Existing flows are unchanged: create-with-attachmentLinks, the kanban
   composer, file uploads, comments, and status transitions behave exactly as
   before; existing attachments are preserved when a task update appends
   links.
3. Tenant isolation and RLS semantics are preserved (the append runs inside
   the task-update actor transaction and honors the same role/scope checks),
   and the agent OpenAPI document exposes the capability on task updates.

## Definition Of Done

- `updateTaskForProject` appends validated link attachments and returns 400
  `attachment-link-invalid` for malformed entries; route tests cover the
  agent and human paths, scope denial, validation errors, and read-back.
- `npm run lint`, `npm run rls:check`, `npm test`, `npm run test:coverage`,
  `npm run build`, and `git diff --check` are green.
- `package.json`/`package-lock.json` advance minor to v0.61.0 over
  `origin/main` (v0.60.0) and the CHANGELOG dated `## v0.61.0 - 2026-09-08`
  entry documents the capability.
- The agent OpenAPI document and hosted agent guide show the field; the
  agent.md / CLAUDE.md guidance no longer calls link-add UI-only.
- The Nexus Dash board card ND-424 is updated (In Progress, then Done on
  delivery with a Report section) and issue #486 is closed by the PR;
  `tasks/current.md` + `journal.md` reflect the execution.
- Branch is pushed with an open ready-for-review PR closing #486; the
  Copilot review outcome is triaged and threads resolved before handoff.

## Runtime Assumptions

- Existing PostgreSQL, authentication, `.env`, and agent-token contracts
  remain unchanged; no schema or RLS migration is needed (link rows reuse the
  existing `TaskAttachment` model).
- Local validation follows `docs/runbooks/local-validation.md`; preview
  deployment is not an acceptance requirement for this API-only change.

## Previous Task Snapshot

The previous `tasks/current.md` brief (ND-427, merged into main via PR #494 at
c676716 / v0.60.0) is preserved verbatim below for history.
## ND-179: Project ownership continuity and collaborator offboarding

## Status

Delivered on `feature/nd-179-ownership-offboarding`, based on and reconciled
with `origin/main` at 6426c1a, in PR #498. A preview report exposed an RLS
conflict while preserving meeting-note editor history; the correction adds a
narrowly scoped owner-validated responsibility resolver and regression coverage.
A follow-up preview report found that the server result required a manual page
reload to appear; member removal and agent revocation now invoke the dashboard
refresh path. A second report exposed that context-card projections discarded
their already-computed steward; grid and preview cards now show that current
steward while retaining historical provenance. Browser assertions cover the
immediately visible task, context-card, meeting-note, and meeting-todo state.
The Nexus Dash board card ND-179 is the source of truth; its ND-178
project-actor foundation has landed on `main`.

## Context

Project owners can currently remove collaborators and revoke agent
credentials with a generic browser confirmation. Those actions do not show
the active tasks, context cards, meeting notes, or meeting todos for which the
departing actor remains accountable. Project ownership also cannot be
transferred, so the only owner cannot safely leave without deleting the
project. ND-179 makes ownership handoff and offboarding explicit,
responsibility-aware, and atomic while keeping creator/editor/completer
identity history readable.

## Product Decisions

- Active responsibility means a non-Done, non-archived task assignment; any
  context-card stewardship; a non-Done meeting-note stewardship; or an open
  meeting-todo assignment. Completed work keeps its historical actor.
- Before a member is removed or an agent credential is revoked, the owner sees
  a categorized inventory and must choose one outcome for active
  responsibilities: reassign them to an eligible remaining human collaborator
  or leave them visibly unassigned. The server recomputes the inventory inside
  the mutation transaction so stale UI cannot silently orphan work.
- Ownership transfers only to an existing project collaborator. The new owner
  receives the sole owner role atomically. The previous owner either remains
  an editor or leaves in the same handoff; leaving requires the same explicit
  responsibility resolution.
- Historical creator, last-editor, completer, comment-author, attachment-uploader,
  and audit snapshots are never rewritten by offboarding. Only active
  assignment/stewardship fields are reassigned or cleared.

## Scope

- Add an owner-only responsibility-inventory service/API for human members and
  project agent credentials.
- Make collaborator removal and credential revocation require an explicit
  active-responsibility resolution whenever the inventory is non-empty.
- Add atomic project ownership transfer, with keep-access and leave-project
  outcomes and last-owner protection.
- Replace generic browser confirmations with accessible, responsive dialogs
  that show responsibility counts, resolution choices, pending/error states,
  and clear destructive consequences.
- Add service, route, component, and browser coverage, including cross-project
  denial, stale-inventory recomputation, mobile containment, keyboard access,
  and historical-record preservation.

## Out Of Scope

- Workspace-wide responsibility queues, notifications, conflict-safe editing,
  or new ownership fields for roadmap/epic artifacts.
- Transferring ownership to an invited-but-not-yet-accepted user or directly to
  an agent credential.
- Rewriting historical creator/editor/completer provenance during offboarding.

## Acceptance Criteria

1. Before member removal or active agent revocation, owners see current counts
   for active task assignments, context-card stewardship, meeting-note
   stewardship, and open meeting-todo assignments; non-owners and
   cross-project actor identifiers are rejected.
2. An offboarding mutation with active responsibilities cannot proceed without
   an explicit `reassign` or `unassign` resolution. Reassignment accepts only a
   current human owner/member other than the departing actor; unassignment
   clears every active responsibility in scope.
3. Responsibility resolution and member removal / credential revocation are
   one transaction and use a server-side recomputed inventory. Completed and
   archived work plus historical actor/provenance snapshots remain unchanged.
4. Ownership can transfer only from the current owner to an accepted project
   collaborator. The new owner becomes the sole owner atomically; the previous
   owner either remains an editor or leaves after resolving active
   responsibilities. A project can never be left ownerless.
5. The owner UI uses keyboard-accessible dialogs with visible labels, focus
   management, inline announced errors, loading/disabled feedback, semantic
   danger treatment, 44px primary targets, light/dark parity, and no horizontal
   overflow at 375px.
6. Successful removal, revocation, transfer, and transfer-and-leave flows give
   confirmation feedback and refresh/redirect to a state the acting user may
   still access; failed mutations preserve the dialog state for recovery.

## Definition Of Done

- Services, routes, the owner Contributors/Agent access surfaces, the transfer
  SQL function and migration, and relevant contracts are implemented together.
- Focused tests cover inventories, authorization, replacement validation,
  unassign/reassign behavior, atomic ownership role changes, last-owner
  protection, UI semantics, and the owner-leave redirect.
- `npm run lint`, `npm run rls:check`, `npm test`, `npm run test:coverage`,
  `npm run build`, the real PostgreSQL RLS matrix, and relevant Playwright
  coverage pass; `git diff --check` is clean.
- Product version/release notes, `journal.md`, this brief, and the live ND-179
  board card are consistent. The branch is pushed, a ready-for-review PR is
  open, required checks pass, and initial Copilot review is triaged with every
  addressed thread resolved.
- The active branch is deployed through the manual Preview workflow with an
  explicit `git_ref`; the resulting URL is validated with preview credentials
  from the user-specified `.tmp` env contract and recorded in the handoff.

## Runtime Assumptions

- Local PostgreSQL must be reachable for migration, RLS, and browser
  validation. No new runtime secret is introduced.
- Production Nexus Dash board access uses the documented gitignored
  `.config/.nd-nexus-dash.env`; preview access uses the gitignored `.tmp`
  preview env supplied outside the task worktree.
- ND-178 is the related, merged foundation. ND-179 uses its canonical project
  actor fields and helpers from `main`.

## Previous Task Snapshot

The previous `tasks/current.md` briefs are preserved verbatim below.

---

# Current Task

## ND-427: Replace the mobile Kanban status dock with lane arrows

## Status

Delivered (2026-09-08). Ready-for-review PR #494
(https://github.com/dorianagaesse/nexus_dash/pull/494) is open from
`feature/nd-427-kanban-mobile-list-arrows` in dedicated worktree
`../nexus_dash_nd427_wt`, branched from `origin/main` at 446637f (ND-381
merged / v0.58.0) and updated from `origin/main` at 049d346 after ND-407
merged as v0.59.0. The Nexus Dash board card ND-427 (feature label) is the
source of truth and was moved through In Progress to Done via the agent API.
No GitHub issue exists for this task; PR #494 carries the ND-427 reference.

Post-merge validation passed against the Dockerized PostgreSQL contract on
port 5432: lint, `rls:check`, `release:check`, `git diff --check`, 1,368
Vitest tests passed (2 skipped), coverage above thresholds (93.21% statements
/ 83.58% branches / 94.59% functions / 93.52% lines), production build, and
12 focused Chromium tests across the authenticated-shell, bounded-Kanban, and
ND-407 title-cap specs.

## Context

Below the four-column desktop breakpoint, the Kanban board shows one status
lane at a time and currently relies on a second sticky bottom navigation dock
to switch among Backlog, In Progress, Blocked, and Done. That dock competes
with the authenticated shell's persistent mobile navigation and separates the
lane-switching action from the lane it controls. Product feedback requests a
simpler sequential model: previous and next arrows attached directly to the
visible list.

## Product Decisions

- Each mobile/single-column lane header owns a previous and next arrow button.
  The buttons step through the canonical `TASK_STATUSES` order and name their
  destination (for example, `Next list: In Progress`) for assistive technology.
- Backlog's previous button and Done's next button remain visible but disabled,
  preserving header balance and making the ends of the sequence legible.
- Arrow targets are at least 44 by 44 px with the shared focus-ring treatment.
  After a switch, keyboard focus moves to the reciprocal arrow on the newly
  visible lane so the user can immediately reverse or continue the sequence.
- All four lanes stay mounted and only mobile visibility changes, preserving
  each lane's independent scroll position. The four-column desktop board,
  drag-and-drop behavior, task counts, filtering, and archive behavior remain
  unchanged.

## Scope

- Remove the sticky mobile Kanban status navigation from
  `KanbanColumnsGrid`.
- Add responsive previous/next controls to Kanban lane headers with disabled
  boundary states, destination-aware accessible names, and focus continuity.
- Update the authenticated-shell UI contract and focused component/browser
  coverage for the new interaction.
- Advance the feature release metadata over v0.59.0.

## Out Of Scope

- Swipe gestures, wrapping from Done back to Backlog, or direct arbitrary lane
  selection on mobile.
- Changing the desktop four-column layout, lane order, task drag-and-drop,
  lane heights, filters, or the authenticated shell's global bottom navigation.
- Persisting the selected mobile lane across reloads or routes.

## Acceptance Criteria

1. At viewports below `xl`, exactly one Kanban lane is visible and its header
   provides previous/next arrow controls that traverse Backlog → In Progress →
   Blocked → Done in both directions without wrapping.
2. Backlog's previous control and Done's next control are visibly disabled;
   enabled controls expose destination-specific accessible names, visible focus
   treatment, and a minimum 44 px touch target.
3. The old sticky `Kanban status navigation` dock is absent, so Kanban no
   longer adds a second bottom navigation above the authenticated app shell.
4. Switching lanes preserves each lane's native scroll position, maintains
   keyboard focus on the reciprocal lane control, and causes no horizontal
   overflow at 375 px portrait or phone landscape sizes.
5. At `xl` and wider, all four columns remain visible and the new mobile arrow
   controls are hidden; drag-and-drop and existing lane behavior are unchanged.

## Definition Of Done

- Focused component tests cover sequential traversal, disabled boundaries,
  accessible names, touch-target classes, focus continuity, dock removal, and
  independent lane scroll preservation.
- Playwright coverage exercises the real mobile flow in both directions,
  verifies boundary states and viewport containment, and confirms desktop
  arrows are hidden while all lanes are visible.
- `git diff --check`, `npm run lint`, `npm run rls:check`, `npm run
  release:check`, `npm test`, `npm run test:coverage`, `npm run build`, and the
  focused Kanban Playwright specs are green.
- `package.json`/`package-lock.json` advance minor to v0.60.0 over
  `origin/main` v0.59.0, and the dated CHANGELOG entry documents ND-427.
- The Nexus Dash card is moved to Done on delivery; `tasks/current.md`,
  `journal.md`, and `docs/ui/authenticated-app-shell.md` reflect the outcome.
- The branch is pushed with an open ready-for-review PR referencing ND-427;
  the initial Copilot review outcome is triaged and all addressed threads are
  resolved before handoff.

## Runtime Assumptions

- Existing database, authentication, and environment contracts are unchanged;
  this is a responsive client presentation change with no schema or service
  mutation.
- Local browser validation uses the repository Playwright database/bootstrap
  contract. Preview deployment is not required by this task.

## Previous Task Snapshot

The previous `tasks/current.md` brief (ND-407, merged into main through PR #495
at 049d346 / v0.59.0) is preserved verbatim below for history.

---

# Current Task

## ND-407: Cap task titles at 120 characters and ellipsize overlong titles in the UI

## Status

Delivered (2026-09-08). PR #495
(https://github.com/dorianagaesse/nexus_dash/pull/495) is open
ready-for-review from `feature/nd-407-task-title-cap-and-ellipsis`, branched
from `origin/main` at 446637f (ND-381 merged / v0.58.0). The Nexus Dash
board card ND-407 (feature label, related to ND-387) is the source of truth;
flipped to In Progress on 2026-09-08 and to Done on delivery via the agent
API. No GitHub issue exists for this task; the PR carries the ND-407
reference.

User expectation confirmed on 2026-09-08: on mobile, long titles must be cut
off (ellipsized) so no task title ever wraps to three or more lines in task
surfaces; condensed surfaces keep at most two lines on narrow viewports.

Local validation passed (2026-09-08): lint, `rls:check`, release version
check clean; full Vitest 184 files / 1367 tests passed (2 skipped); coverage
above thresholds (statements 93.21%, branches 83.58%, functions 94.59%,
lines 93.52%); production build green; the ND-407 Playwright spec
(create-dialog cap with live counter, legacy 170-char title clamped to two
lines at 375 px with the full title in the modal, inline-edit overlong-save
rejection) green together with the project-task-calendar smoke suite
(6/6).

## Context

Task titles are stored in an unbounded text column and nothing prevents
arbitrarily long titles. A ZZ-TEST preview fixture with a ~170-character
title rendered unwieldy in condensed surfaces (kanban cards, epic
linked-task lists, related-task summaries), and even titles within any
reasonable cap exceed narrow card widths. Long titles must therefore be
bounded at authoring time and rendered defensively: truncated with an
ellipsis in condensed surfaces, with the full title readable when the task is
opened.

## Scope

- Enforce a 120-character maximum on task titles on every authoring path:
  interactive create/edit forms and API routes.
- Truncate overlong titles with an ellipsis (…) in condensed rendering
  surfaces instead of wrapping or overflowing, keeping at most two rendered
  lines on mobile so titles never take three or more lines.
- Keep the full untruncated title readable in the task detail surface opened
  from a card.
- Epic names are already capped at 80 characters by the database; they are
  out of scope.

## Out Of Scope

- Epic name capping or other artifact title limits.
- Schema changes; the existing text column stays unbounded and the cap is
  enforced at the service/API/form boundary.
- Redesigning task cards, the task detail dialog, or dashboard layout.

## Acceptance Criteria

1. Task create and update APIs reject titles longer than 120 characters with
   a clear validation error and write nothing.
2. Titles of exactly 120 characters and below remain accepted everywhere they
   are today.
3. Task authoring and editing UI enforces the cap: input max length, live
   character feedback near the limit, and an inline validation message on
   submit.
4. Condensed title surfaces (kanban cards, epic registry linked-task lists,
   related-task summaries) truncate overlong titles with an ellipsis instead
   of wrapping, overflowing, or clipping mid-glyph; on mobile viewports a
   title never wraps to three or more lines.
5. Opening a task shows its full untruncated title in the detail modal.
6. The task-authoring quality contract in agent.md is updated to state the
   enforced cap and the truncation behavior.

## Definition Of Done

- Service-level validation with unit coverage for create, update, and bulk
  paths.
- Component coverage for ellipsized titles across condensed surfaces,
  including narrow-width and long-word cases.
- `npm run lint`, `npm run rls:check`, `npm test`, `npm run test:coverage`,
  and `npm run build` pass; kanban Playwright coverage when board flows are
  touched, including a mobile-width title-length check.
- `package.json`/`package-lock.json` advance minor to v0.59.0 over origin/main
  (v0.58.0) and the CHANGELOG dated `## v0.59.0` entry documents the feature.
- agent.md title guidance updated in the same PR.
- The Nexus Dash board card ND-407 is updated (In Progress, then Done on
  delivery) and `tasks/current.md` + `journal.md` reflect the execution.
- Branch is pushed with an open ready-for-review PR referencing ND-407; the
  Copilot review outcome is triaged and threads resolved before handoff.

## Runtime Assumptions

- Existing PostgreSQL, authentication, and `.env` contracts remain unchanged;
  this task introduces no schema change.
- Validation runs locally against the repository `.env` contract and a
  reachable PostgreSQL instance when E2E execution requires it; preview
  deployment is not an acceptance requirement.

## Previous Task Snapshot

The previous `tasks/current.md` brief (ND-381, merged into main via PR #493 at
446637f / v0.58.0) is preserved verbatim below for history.

---

# Current Task

## ND-381: Support rich text in meeting note input and output

## Status

Delivered (2026-09-07). PR #493
(https://github.com/dorianagaesse/nexus_dash/pull/493) is open from
`feature/nd-381-meeting-note-rich-text` (worktree `../nexus_dash_nd381_wt`,
branched from `origin/main` at 2fbc228, ND-376 merged / v0.56.0). The Nexus
Dash board card ND-381 (feature label, related to ND-379) is the source of
truth; flipped to Done on delivery, awaiting the merge. Scope confirmed with the user on 2026-09-07: the
meeting-note editors include @mention autocomplete for project members
(`mentionProjectId`), and read-only surfaces resolve mention hover cards from
the project collaborator list.

Local validation passed (2026-09-07): lint, `rls:check`, `release:check`,
`git diff --check` clean; full Vitest 180 files / 1343 tests passed; coverage
above thresholds (statements 93.21%, rich-text module 92.52%); production
build green; the ND-381 Playwright spec (rich round trip, member mention with
hover card, legacy upgrade) green together with the meeting-todos and
meeting-steward smoke specs. One product fix surfaced during e2e validation:
browser contentEditable keeps text typed before the first Enter as a bare
root text node, so `coerceRichTextHtml` now wraps root-level bare text runs in
paragraphs (jsdom-safe div container), and the meeting-panel save payloads
coerce editor HTML so stored sections stay canonical; the same run uncovered
a preview-helper bug that doubled the list bullet separator (`par. • • item`)
which is fixed with regression coverage.

## Context

Meeting-note inputs and outputs (`inputNotes`, `outputNotes` on
`ProjectMeetingNote`) are plain-text surfaces today: the Prepare meeting /
Edit preparation dialog and the note dialog's Outputs area edit them through
`EmojiTextareaField`, the note dialog renders the Inputs section with
`whitespace-pre-wrap`, and the meeting-note cards preview raw text. Task
descriptions and context-card content already share the `RichTextEditor` /
`RichTextContent` pair with canonical sanitized rich-text HTML storage; ND-379
added Codex-style `* ` / `- ` list shortcuts to that editor. This task rolls
the same enriched-text behavior out to the meeting-note input and output
areas so meeting notes stop being the remaining plain-text island.

## Product Decisions

- **Storage contract.** `inputNotes` and `outputNotes` become canonical
  sanitized rich-text HTML, coerced on write exactly like context-card
  content: `coerceRichTextHtml` accepts both legacy plain text (paragraphs
  for blank-line-separated blocks, `<br />` for single line breaks) and
  editor HTML (sanitized). No schema change; the existing
  `MAX_SECTION_LENGTH` (10000) limit keeps counting plain text via
  `richTextToPlainText`, so HTML markup never counts against the section
  budget.
- **Legacy notes stay readable and searchable.** Rows written before this
  task keep their plain text in the database. Read-only rendering passes
  stored content through `RichTextContent` (which coerces legacy text at
  render time), editing dialogs coerce stored content to canonical HTML when
  the draft is built, and search haystacks convert sections to plain text.
  Re-saving a legacy note upgrades its stored value to canonical HTML.
- **Editors.** The Prepare/Edit-preparation dialog Inputs field and the note
  dialog Outputs field swap `EmojiTextareaField` for the shared
  `RichTextEditor` (same ids, placeholders, and labels; formatting toolbar,
  emoji, list shortcuts, links, and code/token blocks included). The editors
  pass `mentionProjectId` so @mentions of project members autocomplete like
  task descriptions. Viewers never see a disabled editor: the note dialog's
  Outputs area renders read-only with `RichTextContent`.
- **Read-only rendering.** The note dialog Inputs section and the Outputs
  area render through `RichTextContent` with `mentionUsers` resolved from the
  project collaborator list (hover cards); the same empty-state copy is kept.
  Meeting-note cards preview `inputNotes` as plain text (tags stripped) with
  the existing fallback copy, matching how kanban cards preview task
  descriptions.
- **Search stays text-based.** Meeting-note search (client panel filter and
  server-side query filter) indexes plain-text conversions of the sections,
  so queries behave identically for legacy plain and new rich content instead
  of matching raw tag noise. The client converts each note once per notes
  change (memoized), not per keystroke.

## Scope

- Coerce `inputNotes`/`outputNotes` to canonical rich-text HTML in the
  meeting-note service draft build, validate section length on the plain-text
  length, and index plain text in the server query filter.
- Swap the meeting-panel Inputs/Outputs edit fields to `RichTextEditor`
  (mention autocomplete included) and render read-only sections via
  `RichTextContent` with collaborator-derived `mentionUsers`; plain-text card
  previews and memoized client search haystacks.
- Focused service tests (plain→HTML coercion on create/update, sanitization,
  plain-length enforcement with markup, HTML search matching), component
  coverage for the panel surfaces, and a dedicated Playwright spec for a
  real-browser rich-text input/output round trip plus a legacy-note read.
- Version metadata: advance minor to v0.57.0 over origin/main v0.56.0 and add
  a dated CHANGELOG entry.

## Out Of Scope

- `decisions` (not surfaced in the meeting UI), meeting-todo content, titles,
  and participant names stay plain text.
- Mention hover/autocomplete for external participants (they have no Nexus
  Dash account); mentions resolve against project collaborators only.
- Rich text in email/notification content, agent API documentation changes,
  or the project-wide todos page (no note content there).
- Converting stored legacy rows by migration; upgrades happen lazily on
  re-save.

## Acceptance Criteria

1. Meeting-note input uses the shared rich-text behavior: the Inputs field in
   Prepare/Edit-preparation and the Outputs field in the note dialog are the
   shared rich-text editor with formatting, list shortcuts, emoji, and
   project-member @mention autocomplete, and saving persists canonical
   sanitized rich-text HTML.
2. Meeting-note output renders the same supported rich content consistently:
   the note dialog Inputs section and Outputs read-only view render stored
   rich content (formatting, lists, links, code/token blocks, member
   mentions with hover cards) through the shared read-only renderer, and
   meeting-note card previews stay readable plain text.
3. Existing meeting notes remain compatible and readable: legacy plain-text
   notes (single and multi-paragraph) render correctly in the panel, open in
   the editors without content loss, re-save as canonical HTML, and search
   over their content keeps matching.

## Definition Of Done

- Service, panel, and rendering changes above are implemented with focused
  service/component coverage and a dedicated Playwright spec covering a real
  rich-text prepare → output round trip, @mention entry, and legacy plain
  note readability.
- `git diff --check`, `npm run lint`, `npm run rls:check`, `npm run
  release:check`, `npm test`, `npm run test:coverage`, `npm run build`, and
  the focused Playwright run are green; the meeting-note/calendar smoke e2e
  specs stay green.
- `package.json`/`package-lock.json` advance minor to v0.57.0 over origin/main
  (v0.56.0) and the CHANGELOG dated `## v0.57.0` entry documents the feature.
- The Nexus Dash board card ND-381 is updated (In Progress, then Done on
  delivery) and `tasks/current.md` + `journal.md` reflect the execution.
- Branch is pushed with an open ready-for-review PR referencing ND-381; the
  Copilot review outcome is triaged and threads resolved before handoff.

## Runtime Assumptions

- Existing PostgreSQL, authentication, and `.env` contracts remain unchanged;
  no schema change is required.
- Validation runs locally against the dockerized PostgreSQL setup
  (`docs/runbooks/local-validation.md`) with real-browser Playwright
  coverage; preview deployment is not an acceptance requirement for this
  presentational rollout.

## Previous Task Snapshot

The previous `tasks/current.md` brief (ND-376, merged into main via PR #490 at
2fbc228) is preserved verbatim below for history, itself preserving the
ND-379 brief.

---

# Current Task

## ND-376: Allow meeting todo assignees who are external participants

## Status

Delivered: PR #490 (https://github.com/dorianagaesse/nexus_dash/pull/490) is
open from `feature/nd-376-meeting-todo-external-assignees` (worktree
`../nexus_dash_nd376_wt`, branched from `origin/main` at 633278e). The Nexus
Dash board card ND-376 (feature label) is the source of truth; flipped to
Done on delivery, awaiting the merge. No GitHub issue exists for this task;
the PR carries the ND-376 reference. Design aligned with the user: an
external assignee is a new `participant` actor kind, assignable from the
meeting-notes panel and the project-wide todos page.

A user feedback round on the picker (2026-09-06) was incorporated after a
merge of `origin/main` (380ee21, ND-421 #487 / v0.54.1): the assignee
popover now lists members, agents, and external participants in one uniform
list with no group headers or subtitles; the option list is a single
scrollable element that actually scrolls with the app-wide slim scrollbar
styling. Regression coverage updated in the component suite and the e2e
spec selectors.

Local validation passed (2026-09-06) against a dockerized PostgreSQL on port
55432 with app env merged from the main checkout's `.env` and local DB
overrides: lint, `rls:check`, `release:check`, and `git diff --check` clean;
full Vitest 178 files / 1305 tests passed; coverage above thresholds
(statements 92.93%); production build green; full Playwright suite green
including the external-assignee and mobile-navigation specs.

Reconciled with `origin/main` again on 2026-09-06 after ND-379 (PR #491)
merged and took the v0.55.0 minor: the only conflicts were top-of-file docs
collisions — `journal.md` keeps both dated entry sets (ND-376 above ND-379),
and `tasks/current.md` keeps this ND-376 brief active with the ND-379 brief
preserved verbatim as the previous snapshot below. Product code auto-merged
with no overlap. Release metadata was retargeted because main now carries
v0.55.0: `package.json`/`package-lock.json` advance to v0.56.0 and the
CHANGELOG gains a dated v0.56.0 section with the ND-376 entries, while the
v0.55.0 entry stays ND-379's (matching `origin/main`); `release:check` and
lint pass on the reconciled head.

## Context

Meeting-note todos (`ProjectMeetingNoteAction`) carry an assignee that is
today restricted to Nexus Dash project members (`human`) or project API
credentials (`agent`); assignee resolution validates references against the
project member/credential registry. Meeting participants already support
external people (no Nexus Dash user, `userId: null` + `displayName`), but a
todo assignee cannot be one of them. Meeting participants are rewritten on
every note save (`deleteMany` + `create`), so participant rows have no stable
id to reference — an assignee representation must be name-based with the
existing accountability snapshot pattern.

## Product Decisions

- External assignees become a third `participant` value of the shared
  `MeetingTodoActorKind` enum (TS + DB), persisted through the existing
  `assigneeKind`/`assigneeDisplayNameSnapshot` columns with no user or
  credential FK and no new columns. The additive enum migration keeps the
  existing DB CHECK constraints valid (`participant` rows carry both FKs
  null).
- A participant assignee reference is name-keyed: its id is the trimmed
  participant display name, resolved case/whitespace-insensitively against
  the external participants of the *same* meeting note at write time
  (create/update drafts and the dedicated action-assignee endpoint). The
  persisted snapshot keeps the canonical spelling, so the assignee remains
  identifiable after later participant renames or removal.
- A participant assignee renders active/assignable while that name is still
  an external participant of the note; once removed from the note it renders
  inactive with the name preserved and the existing needs-reassignment
  affordance (same semantics as a member who left the project).
- The assignee picker presents every candidate in one uniform list: the
  note's external participants alongside project members and agents with no
  group headers or subtitles (avatar style already distinguishes actor
  kinds), and member participants are not duplicated. The list is available
  in the meeting-notes panel and on the project-wide todos page (options
  derived per meeting note), scrolls when options exceed the viewport, and
  uses the app-wide slim scrollbar styling.
- Assignee presentation (chips, identity rows, quick dialog) shows the name
  with a muted `external` hint for participants, mirroring the existing
  `agent` hint, so same-name humans and externals stay distinguishable in
  todo views and outputs.
- The `participant` kind is valid only in the assignee position; creators,
  completers, and stewards remain human/agent.

## Scope

- Additive `MeetingTodoActorKind` migration (`participant` value) plus TS
  domain types, reference guards, mapping, and avatar/summary handling.
- Service-layer resolution for participant references against note-scoped
  external participants in `createProjectMeetingNote` /
  `updateProjectMeetingNote` draft assignment and
  `setProjectMeetingNoteActionAssignee`.
- Mapping of stored participant assignees to active/inactive summaries in
  the meeting-note panel reads and the project-wide todo list.
- Uniform assignee picker list, external hints, and per-note option sets in
  the meeting-notes panel and project-wide todos page; read-only surfaces
  unchanged in layout.
- Focused service, component, and Playwright coverage, including member
  parity and rejection of unknown/non-participant names.

## Out Of Scope

- Converting existing assignee rows or adding participant ids/columns.
- External stewards, creators, or completers; the participant kind stays
  assignee-only.
- Changing participant authoring UX, reminder email recipients (external
  participants have no account), or notification behavior.
- Task (kanban) assignees: this touches meeting-note todos only.

## Acceptance Criteria

1. External meeting participants can be selected as todo assignees: the
   assignee picker on a meeting-note todo offers the note's external
   participants in one uniform list alongside members and agents, and
   picking one persists the assignment with the participant's display name.
2. Existing Nexus Dash user/member assignment continues to work: member and
   agent options, resolution, display, and `mine`/responsibility filters
   behave exactly as before; member participants are not duplicated in the
   picker.
3. The assignee remains identifiable in meeting-note todo views and outputs:
   the stored name renders in the note panel, the project-wide todos page,
   the todo quick dialog, and assignee identity rows, with an `external`
   hint; unknown or non-participant names are rejected with
   `meeting-note-action-assignee-invalid`.

## Definition Of Done

- The `participant` actor kind is implemented end to end with an additive
  migration, service validation scoped to the note's external participants,
  name-keyed summaries, and picker/read-only presentation on the meeting
  panel and todos page.
- Focused service tests cover participant assignment through drafts and the
  dedicated endpoint (valid external participant, member as participant,
  renamed/removed participant, unknown name rejection); component tests
  cover the uniform option list (no headers/subtitles, scrollable with the
  app-wide scrollbar styling), the external hint, and selection for panel
  and todos rows; the relevant Playwright spec covers a real-browser
  external assignee flow.
- `git diff --check`, `npm run lint`, `npm run rls:check`, `npm run
  release:check`, `npm test`, `npm run test:coverage`, `npm run build`, and
  the focused Playwright run are green; the meeting-notes/todos e2e specs
  stay green.
- `package.json`/`package-lock.json` advance minor to v0.56.0 over `origin/main`
  (v0.55.0 released via ND-379 PR #491) and the CHANGELOG release entry
  documents the feature under a dated v0.56.0 section.
- The Nexus Dash board card ND-376 is updated (In Progress, then Done on
  delivery) and `tasks/current.md` + `journal.md` reflect the execution.
- Branch is pushed with an open ready-for-review PR referencing ND-376.

## Runtime Assumptions

- Existing PostgreSQL, authentication, and `.env` contracts remain unchanged;
  the schema change is an additive enum value with no table/column changes.
- Local validation uses the dockerized PostgreSQL setup from
  `docs/runbooks/local-validation.md`; preview deployment is not an
  acceptance requirement for this task.

## Previous Task Snapshot

The previous `tasks/current.md` brief (ND-379, merged into main via PR #491) is
preserved verbatim below for history, itself preserving the ND-421 brief.

---

# Current Task

## ND-379: Simplify task-description rich text with Codex-style Markdown shortcuts

## Status

Delivered (2026-09-06): PR #491
(https://github.com/dorianagaesse/nexus_dash/pull/491) is open from
`feature/nd-379-rich-text-markdown-shortcuts` (worktree
`../nexus_dash_nd379_wt`, created from `origin/main` at 633278e, v0.54.0).
Commits e6387a2 (implementation) and 630c0ca (v0.55.0 + CHANGELOG
`## Unreleased` entry) are pushed. The Nexus Dash board card ND-379 (feature
label) is Done with a Report section appended on 2026-09-06; no GitHub issue
exists for this task. Related rollout cards ND-380 (project card
descriptions) and ND-381 (meeting note input/output) stay Backlog. Scope and
product semantics were confirmed with the user on 2026-09-06 (whole-line
conversion; shortcuts only, toolbar unchanged).

Reconciled with `origin/main` on 2026-09-06 after the ND-421 merge (PR #487,
v0.54.1): release metadata kept v0.55.0 (feature minor above v0.54.1),
CHANGELOG ordered `## v0.55.0` above `## v0.54.1`, and this brief stays
active with the ND-421 brief preserved verbatim as the previous snapshot
below. Product code (editor, Kanban grid) auto-merged with no overlap.

Validation on the final tree (2026-09-06): lint, rls:check, 1294 unit tests
passed / 2 skipped, coverage 92.93/82.94/93.83/93.25, production build, and
`git diff --check` are green. The focused Playwright spec
`nd-379-rich-text-markdown-shortcuts.spec.ts` passes 2/2 against a real
server: typing `- ` into the empty editor converts, Enter continues the list,
and the saved `<ul><li>` value persists and re-renders; typing `* ` before an
existing paragraph converts the whole line and persists. Real-browser e2e
caught one gap the component suite missed: the editor's post-input caret
restore anchors the caret on the editor element rather than the text node, so
the bare-root conversion now accepts both caret shapes (component test added;
`rich-text-editor.test.ts` suite at 64).

## Context

Task descriptions are edited with the shared `RichTextEditor`
(`components/rich-text-editor.tsx`), a contentEditable surface where
formatting is reachable only through toolbar buttons: typing `* ` or `- ` at
the start of a line stays literal text, so composing a bullet list means
writing plain text first and converting afterwards with the mouse. Codex and
similar text-first composers turn the typed marker into the formatting. This
task makes list entry Codex-style: typing `* ` or `- ` at the start of a line
creates a bullet-list item on the spot, while every existing formatting
capability, content contract, and saved-content rendering stays unchanged.

## Product Decisions

(Confirmed with the user 2026-09-06.)

- **Whole-line conversion.** The shortcut fires at the start of any paragraph,
  empty or not: `- fix typo` converts the entire current paragraph into the
  first item of a new unordered list, preserving content and inline
  formatting, matching the semantics of the existing toolbar Bullet List
  button applied to the current paragraph.
- **Keydown trigger, space consumed.** Conversion happens when Space is typed
  while the current line's text before the caret is exactly `*` or `-`: the
  marker character and the space are consumed and never appear in the saved
  value. No conversion when the prefix is anything else (`** `, `*a`, mid-line
  `x-`), when the caret is inside an existing list, a code/token block, a
  blockquote, or while a mention autocomplete is active. Text after the caret
  stays where it was; typing continues at the same position inside the new
  item.
- **Native list editing afterwards.** Enter inside the new item continues the
  list and Enter on an empty item exits it through the browser's native
  contentEditable list semantics (no new interception code); existing
  paragraph-level Enter/Backspace handling is untouched. The caret anchor is
  the same invisible zero-width character the editor already uses, so
  serialization stays clean.
- **Toolbar unchanged.** The Bullet List toolbar button remains as an explicit
  affordance; no button is removed or relabeled. The editor is shared with the
  context-card surfaces, so the shortcut applies there too without extra
  work — rolling rich text out to further surfaces remains ND-380/ND-381.

## Scope

- Add line-start list-marker handling to `components/rich-text-editor.tsx` for
  `* ` and `- ` (unordered list items), covering both the empty-editor/root
  caret and the paragraph caret cases, with history (undo/redo) integration
  and emitted `onChange` values in canonical serialized rich-text HTML.
- Add focused component coverage in `tests/components/rich-text-editor.test.ts`
  for conversions, non-triggers, undo/redo, and emitted values.
- Add a focused Playwright spec for real-browser typing in the
  task-description editor (bullet creation, Enter continuation, exit,
  save/reopen render).
- Keep content compatibility: serialized `<ul>/<li>` values round-trip
  through `sanitizeRichText`/`RichTextContent` exactly like toolbar-created
  lists.

## Out Of Scope

- Other Markdown shortcuts (numbered `1. ` lists, headings, quotes, task
  checkboxes) — future candidates, not part of this card.
- Toolbar simplification or button removal; reducing or redesigning the
  editor shell.
- Rich text rollout to meeting notes (ND-381), project card descriptions
  (ND-380), comments (ND-398), or any other surface.
- Server/API/schema changes; preview deployment is not an acceptance
  requirement for this presentational change.

## Acceptance Criteria

1. Typing `* ` or `- ` at the start of an empty line — including the first
   line of an empty editor — creates an unordered list item and places the
   caret inside it, ready for text; the marker characters and their space are
   not part of the saved value.
2. Typing `* ` or `- ` at the start of a line that already contains text
   converts that whole line into a list item, preserving the existing content
   and its inline formatting, with the caret remaining at the start of the
   item content.
3. The conversion is a single undo step (Ctrl/Cmd+Z restores the typed
   marker) and is redoable; every emitted value is canonical serialized
   rich-text HTML containing `<ul><li>…</li></ul>`.
4. Non-trigger inputs stay literal: `*`/`-` without a following space,
   doubled markers (`** `), markers typed mid-line or after other content, and
   markers typed inside an existing list, code/token block, or blockquote do
   not convert.
5. Typing works like toolbar-created lists in a real browser: Enter inside an
   item adds the next item, Enter on an empty item exits the list, and a
   saved description with a list reopens and renders identically in edit and
   read-only presentation, with no empty `<ul>` artifacts.
6. Existing editor capabilities do not regress: toolbar formatting (bold,
   headings, italic, underline, numbered lists, code/token blocks), mentions,
   emoji, undo/redo, and the Kanban board/modal behavior covered by the
   TASK-381 and ND-408 specs.

## Definition Of Done

- `components/rich-text-editor.tsx` implements the line-start `* `/`- ` list
  conversion with caret, history, and serialization correctness.
- Component tests cover empty-line and existing-text conversion, both marker
  characters, non-trigger cases, undo/redo, and emitted serialized values; a
  focused Playwright spec covers real-browser typing flows in the
  task-description editor (create and edit surfaces).
- `npm run lint`, `npm run rls:check`, `npm test`, `npm run test:coverage`,
  `npm run build`, and the focused Playwright run are green; `git diff
  --check` is clean.
- `package.json`/`package-lock.json` advance minor to v0.55.0 over the current
  `origin/main` (v0.54.1 after the ND-421 merge) and the CHANGELOG dated
  `## v0.55.0` entry documents the feature.
- The Nexus Dash board card ND-379 is updated (In Progress, then Done on
  delivery) and `tasks/current.md` + `journal.md` reflect the execution.
- Branch is pushed with an open ready-for-review PR referencing ND-379; the
  Copilot review outcome is triaged and threads resolved before handoff.

## Runtime Assumptions

- Existing PostgreSQL, authentication, and `.env` contracts remain unchanged;
  this task introduces no schema, service, or route changes.
- Playwright validates the shortcut against a local database (edit/create
  flows in the task detail modal and create-task dialog); preview deployment
  is not an acceptance requirement.


## Previous Task Snapshot

The previous `tasks/current.md` brief (ND-421, merged in v0.54.1 via PR #487) is
preserved verbatim below for history, itself preserving the ND-408 brief.

## ND-421: Match Kanban lane scrollbars to the app-wide smooth scrollbar styling

## Status

Delivered: PR #487 (https://github.com/dorianagaesse/nexus_dash/pull/487) is
open in ready-for-review state from
`fix/nd-421-kanban-lane-scrollbar-styling` and closes issue #484. Branch
created from `origin/main` (carries TASK-381 via merge 14a41af / PR #459); the
unmerged ND-408 filter-bar branch predates TASK-381 and was not touched. Local
validation is green: lint, rls:check, 1,218 tests passed / 2 skipped,
coverage 91.52/81.57/92.3/92.01, production build, and the full Playwright
suite (39 passed / 1 skipped) including both TASK-381 bounded-lane specs.
Release metadata advances patch to v0.54.1 over the current origin/main base
(v0.54.0 after PR #483/ND-408 merged; earlier bases v0.53.0 after PR
#488/ND-397 and pre-#485) and `npm run release:check` passes. Each upstream
merge was reconciled from a worktree (root checkout hosts other sessions'
in-flight work): the journal.md top-entry collisions, the release-metadata
retargets (v0.52.1 -> v0.53.1 -> v0.54.1), and the tasks/current.md brief
collisions (ND-421 kept active; the preceding brief — ND-408, then ND-397 —
preserved verbatim as the previous snapshot) were resolved with no
product-code conflicts; `kanban-columns-grid.tsx` and its specs auto-merged
against both ND-397 and ND-408. PR checks on each reconciled head were green
(Quality Core, E2E Smoke, Tenant Isolation, Container Image, check-name;
merge state clean); one E2E Smoke failure on the pre-reconciliation docs
commit cbf7f03 (home-entry `data-link-count > 780`) was confirmed as a
one-off environment flake by the fully green re-run. Copilot's initial review
items were applied (changelog/journal dates aligned to the commit UTC date;
scrollbar class list as a joined token array) with replies posted; a
re-review is pending on the GitHub UI side. Nexus Dash board card ND-421 (fix
label, GitHub issue #484) is the source of truth and reflects In Progress
until the PR merges.

## Context

TASK-381 (PR #459) bounded Kanban lane heights and made each lane's task
region independently scrollable; it also introduced the archived Done scroller
inside the Done lane. Those scrollers were left with the default browser
scrollbar, which looks out of place next to the smooth slim scrollbar
treatment used across the rest of the app (task detail modal, create-task
dialog, related-task field, roadmap lanes). This task applies that same
surface to the two TASK-381 scroller kinds.

## Scope

- Apply the app-wide slim scrollbar styling (thin scrollbar, 2px-wide rounded
  thumb over a transparent track, matching light/dark parity) to the Kanban
  lane task regions (`data-kanban-lane-scroll`) and the archived Done
  scroller in `components/kanban/kanban-columns-grid.tsx`.
- Keep the existing focusable scroll-region semantics (`role=region`,
  `tabIndex=0`, focus ring), `overscroll-y-contain`, and
  `[scrollbar-gutter:stable]` intact.
- Add focused component coverage asserting both scroller kinds carry the app
  scrollbar styling tokens.

## Out Of Scope

- Restyling any other default scroll region in the app (pre-existing modal
  comment lists etc.) — only the TASK-381 scrollers are in scope.
- Changes to lane sizing, drag-and-drop, archive behavior, or board semantics.
- The unmerged ND-408 Kanban search/filter work (separate branch/PR).

## Acceptance Criteria

1. Kanban lane scrollers and the archived Done scroller render the same
   scrollbar treatment as other app scroll areas in light and dark themes.
2. No regression in lane scrolling, keyboard focus, drag-and-drop, or
   375px/mobile behavior covered by the TASK-381 specs.

## Definition Of Done

- `components/kanban/kanban-columns-grid.tsx` applies the app scrollbar
  styling to both TASK-381 scroller kinds, with focused component assertions.
- TASK-381 Kanban component and Playwright specs still pass, and `npm run
  lint`, `npm run rls:check`, `npm test`, `npm run test:coverage`, `npm run
  build`, and the focused Kanban Playwright run are green.
- `package.json`/`package-lock.json` advance patch to v0.52.1 and the
  CHANGELOG `## Unreleased` entry documents the fix.
- The Nexus Dash board card ND-421 is updated (In Progress, then Done on
  delivery), keeps its relation to TASK-381, and `tasks/current.md` +
  `journal.md` reflect the execution.
- Branch is pushed with an open ready-for-review PR referencing issue #484.

## Runtime Assumptions

- Existing PostgreSQL, authentication, and `.env` contracts remain unchanged.
- This is a presentational follow-up to a merged behavior change; preview
  deployment is not an acceptance requirement, and local component +
  Playwright coverage is sufficient.

## Previous Task Snapshot

The previous `tasks/current.md` brief (ND-408, released in v0.54.0) is
preserved verbatim below for history.

---

# Current Task

## ND-408: Unified Kanban task search and filter bar

## Status

Delivered: PR #483 (https://github.com/dorianagaesse/nexus_dash/pull/483) is
open from `feature/nd-408-kanban-search-filter`, superseding PR #469 (TASK-382
server-backed task search + label filters) and #470 (TASK-384 epic filter),
which were both commented with pointers and closed. The Nexus Dash board card
(ND-408) reflects In Progress.

Local validation passed against a dockerized PostgreSQL with env overrides
(runbook `docs/runbooks/local-validation.md`): production build green, ND-408
Playwright spec 6/6, focused vitest 50/50 with scoped coverage above
thresholds, lint/rls:check/diff checks clean. Full `npm test` /
`npm run test:coverage` remain red only on a pre-existing main breakage
(`prisma.$transaction is not a function`, reproduced on a pristine tree) that
predates this branch; see the PR body.

Review iteration (2026-09-05): popover anchored directly below the Filter
trigger (flip-above only when under 240px of room below, capped at 520px so it
never stretches to the viewport top), Labels/Epics rendered as compact wrap
chips in the card-label visual language, an in-popover search field that
filters options live, and groups beyond 12 chips collapsing behind a
"Show all N" toggle (auto-expanded while searching). New component tests
added; ND-408 e2e spec stays green. Nexus Dash card ND-408 description
rewritten with a precise Rationale/Scope/Acceptance Criteria/Definition of
Done brief and the `feature` label per the authoring contract in `agent.md`.

Mobile review iteration (2026-09-05, second round): on viewports under 640px
the popover sizes to the Filter trigger's own rect (the button is centered
beneath the search row and narrower than it), so it is pixel-aligned with the
button; the popover footer is now always rendered with an explicit **Done**
button (Check icon) that closes the panel and restores focus to the trigger,
alongside the conditional Clear all filters. Component suite at 15 tests and
the 375px e2e assertion (popover box matches the trigger within 1px, Done
visible) cover both. Committed 49a9227; PR #483 remains open.

Reconciliation + Copilot round (2026-09-06): `origin/main` advanced past the
fork point with TASK-381 (v0.52.0), docs/dependabot merges, and then ND-397
(PR #488, v0.53.0), so main was merged into the branch twice. The
kanban-columns-grid conflict was resolved by keeping the TASK-381
lane-scroller structure and re-applying the ND-408 archive auto-open,
filtered empty copy, and data attributes on it; ND-397's comment
expand/collapse files merged cleanly. Product version advanced to v0.54.0
(both sides claimed v0.53.0 after main released it via ND-397; ND-421
targets v0.52.1), and the CHANGELOG Unreleased keeps only the ND-408
entries. The Copilot review thread on PR #483 was triaged: the Archive
open state is now derived from user intent plus a dismissible filter-driven
auto-open, so clearing filters returns the group to its pre-filter
open/closed state instead of leaving a filter auto-open behind, with three
component regression tests. Thread replied to and resolved on GitHub;
revalidation green.

## Context

PR #469 and PR #470 both add task-filter UI to the same Kanban board area and
share the same merge base; `main` has not touched Kanban files since, so their
changes apply cleanly onto current main except version/docs conflicts. Rather
than merging two visually heavy, overlapping surfaces (stacked toolbar cards
with helper text and result-count pills), this task delivers one united,
self-evident surface: search and filter live on a single compact row.

## Scope

- Port the server-backed search foundation unchanged: `searchProjectTaskIds`
  service, `/api/projects/{projectId}/tasks/search` route, and the
  `useKanbanTaskSearch` hook (200ms debounce, abort, error + retry).
- Unified filter core in `components/kanban/kanban-filter-utils.ts`:
  search IDs AND labels (all selected) AND epics (any selected, "No epic"
  matches tasks without an epic), with an identity short-circuit when nothing
  is active, and filtered drag-drop mapping that keeps hidden tasks in place.
- `KanbanFilterBar`: search input (clear button, loading spinner, error + retry
  only) and one Filter trigger (active count badge) opening a portal popover
  grouping Labels and Epics as multi-select wrap chips (`aria-pressed`, color
  dot when idle, pastel fill + check when selected). A small search field at
  the top of the popover filters label/epic options live, groups larger than
  12 chips collapse behind a "Show all N labels/epics" toggle (auto-expanded
  while searching), and a footer with an always-present **Done** button (closes
  the panel, restores focus to the trigger) plus a "Clear all filters" action
  that appears only while anything is active. The popover opens directly under
  the trigger and only flips above when there is under 240px of room below; on
  narrow viewports it sizes to the trigger so it stays aligned with it.
- Filtered board: empty columns say `No matching <status> tasks`, archived
  Done matches auto-open the Archive group, and the mobile status navigation
  keeps working.
- Viewers keep the filter surface but never get create or drag affordances.

## Out Of Scope

- Reintroducing the superseded stacked toolbar UI, helper/explanation copy, or
  "X / Y tasks" result-count pills (superseding #469/#470 changes them).
- Clickable label chips on task cards as a second filter surface (the popover
  is the only filter surface).
- Server-side filtering/pagination of the board beyond the existing search
  route; label/epic filtering stays client-side over loaded tasks.
- Changing Kanban drag behavior, persistence semantics, or board data loading.

## Acceptance Criteria

1. One search row sits above the board: typing searches server-side across
   titles, descriptions, references, statuses, labels, epics, assignees,
   comments, attachments, and related tasks, with debounced loading feedback,
   a clear button, and an error state offering retry.
2. One Filter button opens a popover directly under it (flipping above only
   when there is under 240px of room below, and never stretching to the top of
   the viewport) grouping Labels and Epics (plus "No epic") as wrap chips with
   `aria-pressed` and check marks. The trigger shows an active-selection count
   (labels + epics only); an in-popover search field narrows label/epic
   options and groups beyond 12 chips hide behind a "Show all N" toggle;
   "Clear all filters" appears only while search or selections are active and
   resets everything.
3. Search, labels (AND), and epics (OR, including "No epic") combine; tasks
   from other projects never appear, and a task detail modal is not required
   to understand any state.
4. Dragging a visible task while filters are active lands relative to visible
   cards only; tasks hidden by the filter keep their relative order after
   persistence and reload.
5. Archived Done tasks matching the active filters surface in an open Archive
   group; clearing filters restores the un-filtered board exactly.
6. The filter surface contains no helper text and no result-count pill; at
   375px, in landscape, and in dark mode the popover stays fully on-screen
   without horizontal page scroll.

## Definition Of Done

- Kanban search route/service, filter utilities, filter bar, board wiring, and
  columns grid are covered by focused unit, component, and Playwright specs
  (combined filter semantics, filtered drag with interleaved hidden tasks,
  viewer read-only affordances, clear-all, popover containment).
- `npm run lint`, `npm run rls:check`, `npm test`, `npm run test:coverage`,
  `npm run build`, and `npm run test:e2e` pass; `git diff --check` is clean.
- `package.json`/`package-lock.json` advance to v0.54.0, `CHANGELOG.md`
  carries the `## Unreleased` entry, and `journal.md` logs the execution.
- The branch is pushed and a ready-for-review PR superseding #469 and #470 is
  open; both superseded PRs are commented and closed; the Nexus Dash board
  card reflects the final status.

## Runtime Assumptions

- Local database-backed validation uses the repository `.env` contract and a
  reachable PostgreSQL instance when migration or E2E execution requires it.
- The Nexus Dash task card exists (ND-408, created via the agent API) and
  drives the branch/PR identity; no secrets leave `.env`/`.config` files.

## Previous Task Snapshot

The previous `tasks/current.md` brief (TASK-342, released in v0.51.0) is
preserved verbatim below for history.

---

# Current Task

## TASK-342: Context Knowledge Stewardship and Attachment Provenance

## Status

In review via PR #459 on `feature/task-381-bounded-kanban-lanes`. On
2026-09-02 the branch was reconciled twice with current `origin/main`: first
against the agent API program, calendar, meeting-stewardship, and dependabot
changes (release advanced from the stale `v0.38.0` to `v0.51.0`), then again
after TASK-342 (PR #451) merged and advanced main itself to `v0.51.0`. Both
rounds resolved PR #459 conflicts without product-code changes; the release
now sits at `v0.52.0` (merge 7293cd6) and revalidation on the final merged
tree was green: lint, rls:check, release:check, 1,216 tests passed / 2
skipped, coverage 91.52/81.57/92.3/92.01, and a production build. Copilot
then completed a review on the reconciled head (2026-09-02/03) and its three
threads were triaged on 2026-09-03: the archived Done scroller received the
same visible focus-visible ring as the lane scrollers, read-only (viewer)
task cards became keyboard-operable with a button role, tab stop, and
Enter/Space activation, and the stale version-description thread was closed
against the reconciled v0.52.0 release notes with rationale (no code change
needed). Regression coverage was added in the component and Playwright
suites; revalidation is green.

## Objective

Keep dense Kanban boards usable by bounding each visible lane to a responsive
viewport-aware height and scrolling each lane's task region independently.
Lane metadata and board actions must remain visible while long task lists are
reviewed or reordered.

## Product Decisions

- Each lane uses `clamp(20rem, 64dvh, 42rem)` so it remains useful on small
  screens without growing indefinitely on large displays.
- The lane header and count stay outside the scroll region. The existing board
  header, create action, archive control, and mobile status dock retain their
  established placement.
- The task region is an explicitly named, keyboard-focusable scroll region
  with contained overscroll and a stable scrollbar gutter.
- All lane components remain mounted while the mobile status dock changes the
  visible lane, preserving their native scroll positions.

## Scope

- Bound active Kanban lane height on mobile and desktop.
- Make every lane's task area vertically scrollable without coupling lane
  scroll positions.
- Preserve pointer and keyboard drag-and-drop, including long-lane auto-scroll
  and movement within or between lanes.
- Preserve archive access, task selection/editing, viewer behavior, live
  refresh, and mobile status navigation.
- Add focused component and Playwright coverage for layout, accessibility,
  scrolling, responsive containment, and drag behavior.

## Out Of Scope

- Task search, label filters, or Epic filters.
- Task virtualization, pagination, persistence changes, or API changes.
- Redesigning task cards, the task detail dialog, the project shell, or other
  dashboard sections.
- URL-backed or persisted lane scroll positions across full navigation.

## Runtime Assumptions

- Existing PostgreSQL, authentication, and `.env` contracts remain unchanged.
- `@hello-pangea/dnd` continues to provide pointer and keyboard sensors and
  recognizes the focusable lane task area as its scroll container.
- The user has explicitly reprioritized TASK-381 ahead of the still-pending
  broad TASK-100 and TASK-133 UX passes.
- Preview validation uses `feature/task-381-bounded-kanban-lanes` as the
  explicit workflow `git_ref`.

## Acceptance Criteria

1. Every visible lane is `clamp(20rem, 64dvh, 42rem)` high and cannot grow with
   its task count.
2. Lane title and visible task count remain fixed while only that lane's task
   region scrolls; scrolling one lane does not move another lane.
3. Each task region has an accessible lane-specific name, keyboard focus, a
   visible focus indicator, contained overscroll, and stable scrollbar space.
4. Pointer and keyboard drag-and-drop continue to work within and across long
   lanes, with destination auto-scroll and no unrelated scroll reset.
5. The Done archive remains reachable outside the Done task-list overflow and
   the global create action remains outside all lane scroll regions.
6. Switching lanes through the mobile status dock preserves each mounted
   lane's scroll position and produces no horizontal viewport overflow at
   375 px or in mobile landscape.
7. Owner/editor and viewer behavior, task modal actions, live refresh, light
   and dark themes, and reduced-motion behavior remain unchanged.

## Definition Of Done

- The bounded independent lane layout and accessibility semantics are
  implemented with focused automated coverage.
- UI/UX Pro Max guidance is applied for `dvh` sizing, keyboard access, visible
  focus, responsive containment, theme parity, and non-jacking scroll behavior.
- `git diff --check`, release validation, `npm run lint`, `npm run rls:check`,
  `npm test`, `npm run test:coverage`, `npm run build`, and `npm run test:e2e`
  pass.
- The explicit-branch Preview workflow succeeds and focused Preview browser
  checks pass at mobile and desktop widths.
- The branch is committed and pushed, a ready-for-review PR is open, required
  checks pass, and review state is recorded. The Copilot review threads on PR
  #459 are addressed and resolved on the updated head.
- `tasks/current.md`, `tasks/backlog.md`, `CHANGELOG.md`, and `journal.md` are
  consistent, and the final handoff records PR, commit, Preview, validation,
  and review evidence without merging the PR.
