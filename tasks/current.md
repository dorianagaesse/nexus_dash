# Current Task

## ND-178 (TASK-337): First-class project actor identity — human and agent assignment/provenance foundation

## Status

In Progress on the Nexus Dash board (card ND-178, feature + P0 labels,
related to the collaboration program TASK-058/098/119/130/319/330/331/338/
340/341/342/343/344/345/346/347/348/356 and ND-382/383/384/385). The card
description was updated on 2026-09-06 with this brief (Rationale preserved);
no GitHub issue exists for this backlog task. Branch
`feature/nd-178-project-actor-identity` was created from `origin/main`
(`2e1722b`, v0.53.0).

Implemented, validated, and open for review as PR
<https://github.com/dorianagaesse/nexus_dash/pull/489> (commits `872d65c`,
`bb681d3`, `95c82a4`, `417db51`, `dadeea4`, pushed). Validation green: lint,
rls:check, release:check (v0.53.0 -> v0.54.0), unit tests 1235 passed / 2
skipped, coverage thresholds, production build, real-PostgreSQL RLS matrix
after migration `20260906100000_task337_project_actor_identity`, and
`git diff --check`. Copilot review outcome handled on 2026-09-06: initial
review completed (20/21 files) with zero inline comments and a "Needs a
closer look" meta verdict on scope, so there were no threads to triage;
CI checks all green (Quality Core, E2E Smoke, Tenant Isolation RLS,
Container Image). Awaiting merge on the board card.

## Context

The multi-user collaboration audit (`docs/audits/task-336-...`) made
first-class project actors its P0 remediation: preserve real human/agent
identity for assignments and mutations. Today the app has three partial
answers: the meeting-todo actor surface (`lib/meeting-todo-actor.ts` +
`lib/services/project-meeting-todo-actor-service.ts`), the context-card
actor surface (`lib/context-card-actor.ts` + `lib/services/context-card-actor-service.ts`)
— near-identical per-module vocabularies and resolution logic built by
TASK-330/TASK-342 — and per-surface agent attribution that exists for task
comments (TASK-307) but not for task rows themselves: agent-executed task
mutations still persist the credential owner's user id as the task author
record. This task replaces the duplicated actor vocabulary with one
project-actor contract and persists task mutation attribution to the acting
agent credential, laying the foundation the ND-382/383/384/385 consumers and
TASK-340 history build on.

## Scope

- Introduce one canonical project-scoped actor contract (kind `human` |
  `agent`, stable reference, current display label, avatar treatment, current
  access state, durable display snapshot) implemented once in the service
  layer and shared by the meeting-todo and context-card actor surfaces;
  remove their duplicated per-module actor vocabulary and resolution logic
  while keeping observable API and UI behavior unchanged.
- Attribute agent-executed task mutations (create and every update path,
  including status, archive, and reorder) to the acting agent credential with
  a durable label snapshot on the task row; keep the credential owner's user
  attribution for authorization/governance and RLS execution.
- Expose the acting agent identity on task author records (createdBy /
  updatedBy) the way task comments expose agent authors, so downstream
  assignments, pickers, mentions, history, and work queries can distinguish
  human from agent actors.

## Out Of Scope

- Agent mention/assignment pickers and agent mentions (ND-382/ND-383), agent
  assignment flows including the task assignee control (ND-384), the agent
  attention API (ND-385), the durable activity/history actor model
  (TASK-340), and capability changes (TASK-331).
- Task comment agent attribution (already delivered by TASK-307), notification
  actor copy (already agent-aware), and meeting-note/context-card/todo
  presentation redesigns.

## Acceptance Criteria

1. Meeting-todo and context-card actor behavior (assignable registry, list,
   assignee/steward resolution, mutation actor, snapshot fallback, historical
   ids) is served by one shared project-actor implementation; the two consumer
   modules contain no duplicated actor kind/status vocabulary, mapping, or
   resolution logic.
2. Existing actor semantics are unchanged: active project members and active
   credentials are selectable; snapshot-only historical actors keep stable
   fallback ids and "Former member"/"Former agent" presentation; revoked or
   expired credentials are not assignable; human assignment and steward
   behavior is not regressed.
3. Agent-executed task create/update operations persist attribution to the
   acting credential (credential id + label snapshot taken at write time);
   human-executed operations keep human-only attribution; existing task rows
   and API responses remain readable (null-safe, additive).
4. Task author records (internal task mapping and the agent API task response
   createdBy/updatedBy) identify agent-created or agent-updated tasks with the
   agent actor (kind agent, credential id, label); renaming or revoking a
   credential later does not rewrite past task attribution.
5. Authorization and RLS posture is unchanged: agent requests keep executing
   under the credential owner principal, attribution columns grant no
   permission, and no credential secret or token material is exposed.

## Definition Of Done

- Prisma migration adds nullable task credential-attribution columns with FKs
  and indexes; canonical project-actor module and task attribution are
  implemented with focused unit/route coverage (human + agent create/update,
  read-back, revocation, snapshot fallback, meeting-todo/context-card parity).
- Validation baseline green (lint, rls:check, tests, coverage, build), the
  real PostgreSQL RLS matrix green after the schema change, release minor
  advanced to v0.54.0 with CHANGELOG entry, `git diff --check` clean.
- `tasks/current.md`, `journal.md`, and the Nexus Dash card ND-178 reflect
  execution; related ND-382/383/384/385 scopes are not absorbed.
- Branch is pushed with an open ready-for-review PR referencing ND-178;
  Copilot review is triaged to a clean state.

## Runtime Assumptions

- Existing PostgreSQL, authentication, and `.env` contracts remain unchanged.
- No UI-flow changes are shipped, so focused component/service/route tests
  plus the real-RLS matrix are sufficient; preview deployment is not an
  acceptance requirement for this foundation work.

## Previous Task Snapshot

The previous `tasks/current.md` brief (ND-397, released in v0.53.0) is
preserved below for history (its own older TASK-381 snapshot is available in
git history).

---

# Current Task

## ND-397: Constrain long task comments with expand/collapse

## Status

Implemented and validated on `feature/nd-397-comment-expand-collapse`
(worktree `../nexus_dash_task397`, branched from `origin/main` at 1daffc0).
The Nexus Dash board card ND-397 (feature label) is the source of truth and
moved to In Progress on 2026-09-05. No GitHub issue exists for this task; the
PR carries the ND-397 reference. Validation is green: lint, `rls:check`,
`release:check`, unit tests (1225 passed / 2 skipped), coverage thresholds,
production build, and the focused Playwright spec. Ready for review.

## Context

Long comments can dominate the task detail modal and make adjacent discussion
difficult to scan. Every task-comment surface should show comment bodies at a
consistent default maximum visible height, clip overflow without breaking
words or horizontal layout, and offer an explicit accessible expand/collapse
control only when a comment actually overflows. Short comments must stay fully
visible with no extra control.

## Scope

- Add a reusable comment-body presentation component
  (`components/kanban/task-comment-body.tsx`) that renders the mention-aware
  body with a consistent collapsed cap, a measured overflow decision, and an
  accessible expand/collapse toggle.
- Use that component in the task detail modal comment thread
  (`components/kanban/task-detail-modal.tsx`), the only surface that renders
  full comment bodies today, so any future comment surface inherits the same
  treatment.
- Add focused component coverage for short, long, expanded, and collapsed
  comments and a focused Playwright spec for real-browser overflow behavior.

## Product Decisions

- The collapsed cap is a fixed height derived from the comment body's own
  line height (six lines of `text-sm`/`leading-5` at the app font baseline:
  `7.5rem`), so the same cap applies on every layout and breakpoint.
- Overflow is measured against the rendered body (scroll height vs. cap)
  rather than estimated from text length, so mention chips and wrapping never
  misclassify a comment.
- The toggle is a text button with clear state copy (`Show more` / `Show
  less`), `aria-expanded`, and `aria-controls` pointing at the body it
  reveals; it appears only for overflowing comments.
- Clipping uses `max-height` + `overflow-hidden` with the existing
  `whitespace-pre-wrap break-words` body classes: lines wrap at word
  boundaries, and an unbroken string wider than the line still wraps instead
  of spilling, so no horizontal layout appears.

## Out Of Scope

- Comment authoring, editing, mention input, reactions, or agent-identity
  surfaces.
- Rich-text comment authoring/rendering (ND-398) and comment attachments
  (ND-399), which will build on the plain-text body presentation later.
- Constraining any non-comment text surface (task descriptions, meeting
  notes, context cards, roadmap notes).
- Board semantics, modal chrome, or lane behavior.

## Acceptance Criteria

1. Comment bodies have a consistent default maximum visible height in every
   task-comment surface, including responsive layouts.
2. Comments that exceed the limit are initially clipped without breaking
   words or horizontal layout.
3. An explicit, accessible expand/collapse control is shown only when a
   comment overflows; it reveals the complete comment and can restore the
   collapsed state.
4. The control has clear state text and is keyboard-operable with appropriate
   accessible semantics.
5. Short comments remain fully visible and do not show an unnecessary
   control.
6. The behavior is covered by automated UI tests for short, long, expanded,
   and collapsed comments.

## Definition Of Done

- The comment body presentation with measured expand/collapse is implemented
  in the task detail modal thread through a shared component.
- Focused component tests cover short (no control), long collapsed (control
  shown, body capped), expanded (full height, `Show less`), and re-collapsed
  states plus `aria-expanded`/`aria-controls` wiring; a focused Playwright
  spec covers real-browser overflow behavior for short and long comments.
- `npm run lint`, `npm run rls:check`, `npm run release:check`, `npm test`,
  `npm run test:coverage`, `npm run build`, and the focused Playwright run are
  green on the final tree.
- `package.json`/`package-lock.json` advance minor to v0.53.0 and the
  CHANGELOG `## Unreleased` entry documents the feature.
- The Nexus Dash board card ND-397 is updated (Done on delivery) and
  `tasks/current.md` + `journal.md` reflect the execution.
- Branch is pushed with an open ready-for-review PR referencing ND-397.

## Runtime Assumptions

- Existing PostgreSQL, authentication, and `.env` contracts remain unchanged;
  this task introduces no schema, service, or route changes.
- Comments are plain text with `@mention` highlighting; real-browser overflow
  behavior is validated by the focused Playwright run against a local
  database, and preview deployment is not an acceptance requirement for this
  presentational change.
