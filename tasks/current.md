# Current Task: TASK-101 Task Ownership And Provenance

## Task ID
TASK-101

## Status
Implementation complete on branch
`feature/task-101-task-ownership-and-provenance`, stacked on top of `TASK-089`
so the avatar baseline can be reused immediately across task ownership
surfaces. Local validation is green aside from Playwright being blocked by the
shared database schema not yet reflecting this branch migration; PR/review and
preview deployment are the remaining release steps.

## Objective
Add first-class task ownership metadata so every task can show who created it,
who is currently assigned to it, and who last touched it, with the data model,
API contracts, and UI all aligned around the same provenance source of truth.

## Why This Task Matters
- Collaboration is already live, but task ownership is still implicit and
  depends on outside context instead of product-visible metadata.
- `TASK-089` established a shared avatar foundation; `TASK-101` is the first
  feature that needs to apply that foundation to real work attribution.
- Assignee and provenance data are prerequisites for later filtering,
  accountability, notification, and richer project-presence work.
- Shipping this cleanly now reduces the risk of inventing multiple incompatible
  identity models across task comments, assignee chips, and future activity
  surfaces.

## Current Baseline Confirmed In Repo
- `Task` currently has no creator, updater, or assignee relationship fields in
  `prisma/schema.prisma`.
- Kanban task reads come from `listProjectKanbanTasks` and the task routes, so
  provenance data needs to be added at the service/API layer rather than only
  in the UI.
- Task comments already resolve avatar-backed author identities after
  `TASK-089`.
- The board already has a stable task detail modal, task create dialog, and
  task edit flow, which are the right surfaces to introduce ownership and
  provenance.

## Working Product Assumptions
- A task must always retain a creator and last-updater once the migration is
  applied.
- Assignee is optional and should support explicit clearing back to an
  unassigned state.
- Valid assignees are current project collaborators, including the owner.
- "Last touched" should reflect task mutations that materially change the task
  record or task activity, including comment and attachment writes.
- Existing tasks need a practical backfill path; project owner is the baseline
  provenance fallback for legacy rows.

## Scope
- Extend the task schema with:
  - creator relationship
  - updater relationship
  - optional assignee relationship
- Backfill provenance for existing tasks through a migration.
- Validate assignee changes against current project collaborators.
- Update task create, update, reorder, archive, unarchive, comment, and
  attachment flows so provenance stays accurate.
- Expose provenance and assignee metadata through task list/update API
  responses.
- Add assignee selection to task create/edit flows.
- Render avatar-backed ownership UI on the main task surfaces:
  - board card assignee display
  - task detail assignee display
  - task detail created-by / modified-by display
- Update agent/OpenAPI documentation where task payloads change.
- Add targeted regression coverage for the new task contracts and provenance
  behavior.
- Update tracking docs in the same task branch.

## Out Of Scope
- User-uploaded avatars or alternative avatar rendering systems.
- Project-page collaborator rollups; that remains later work (`TASK-119`).
- Notification delivery, reminders, or ownership-based inbox features.
- Complex assignee filtering/search UX on the board.
- Historic provenance reconstruction beyond a sensible legacy backfill.

## Acceptance Criteria
- New tasks persist creator and updater metadata automatically.
- Tasks can store an optional assignee and reject non-collaborator assignees.
- Task update flows keep updater metadata current.
- Comment and attachment task activity updates the task attribution trail.
- The kanban board can render assignee identity with the avatar baseline.
- The task detail modal shows assignee, created-by, and modified-by metadata.
- Task create/edit flows allow selecting or clearing an assignee.
- Task API and agent docs stay aligned with the new payload shape.
- Required tracking docs are updated consistently in the same PR.

## Definition Of Done
1. `TASK-101` is the active brief in `tasks/current.md`.
2. Schema, services, routes, and UI all support task assignee + provenance end
   to end.
3. Relevant validation is green:
   - `npm run lint`
   - `npm test`
   - `npm run test:coverage`
   - `npm run build`
   - preview validation once the branch is published
4. Tracking docs are updated consistently (`tasks/current.md`, `journal.md`,
   and `adr/decisions.md` only if an architecture-level decision is introduced).
5. The task ships through its own dedicated PR with the normal review and
   preview workflow handled before handoff.

## Dependencies
- `TASK-058`
- `TASK-076`
- `TASK-079`
- `TASK-089`

## Evidence Plan
- Repo source of truth:
  - `agent.md`
  - `tasks/backlog.md`
  - `prisma/schema.prisma`
  - `lib/services/project-service.ts`
  - `lib/services/project-task-service.ts`
  - `lib/services/project-task-comment-service.ts`
  - `lib/services/project-attachment-service.ts`
  - `app/api/projects/[projectId]/tasks/**`
  - `app/projects/[projectId]/kanban-board-section.tsx`
  - `components/kanban-board.tsx`
  - `components/kanban/task-detail-modal.tsx`
  - `components/create-task-dialog.tsx`
- Validation source of truth:
  - local lint/unit/build runs
  - PR review comments and CI checks
  - preview deployment verification

## Outcome Target
- NexusDash gains explicit task ownership and provenance instead of relying on
  chat context or naming conventions.
- The avatar baseline from `TASK-089` becomes visible where ownership actually
  matters: assignee, creator, and last modifier.

---

Last Updated: 2026-04-21
Assigned To: Agent
