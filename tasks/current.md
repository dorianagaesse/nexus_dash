# Current Task: TASK-107 Task Epic Flags And Project Epic Registry

## Task ID
TASK-107

## Status
In review.

## Objective
Introduce first-class project epics as a dedicated project-scoped planning
entity, separate from tasks, so work can be grouped under a clear higher-level
 initiative without turning epics into pseudo-tasks or weakening the clarity of
the existing Kanban model.

## Why This Task Matters
- The task system already supports labels, related-task links, comments,
  deadlines, and ownership, but it still lacks a clear way to group several
  execution tasks under one larger initiative.
- Treating epics as tasks would blur the distinction between planning context
  and executable work, which would make the board harder to understand.
- A dedicated epic model gives NexusDash a clearer planning layer now and a
  cleaner foundation for later roadmap/reporting work (`TASK-106`) without
  forcing users to overload task semantics.
- Epics should feel visible and useful in daily workflow, which means the
  feature needs both task-level linking and a project-level epic surface rather
  than a hidden settings-only implementation.

## Current Baseline Confirmed In Repo
- Tasks already support project-scoped metadata and linked relationships
  through the service/API/UI stack:
  - labels
  - related tasks
  - deadlines
  - assignee / provenance
  - comments
  - attachments
- The Kanban board already has stable create/edit/read task flows that can host
  one additional optional task field without inventing a new interaction model.
- Project pages already support multiple section-level panels, so a dedicated
  epic section fits the existing dashboard composition better than a settings
  detour.
- The repo already maintains agent-facing task contracts in
  `lib/agent-onboarding.ts`, so epic-aware API changes must stay aligned there
  too.

## Product Contract
- Epics are not tasks.
- Epics are project-scoped entities with their own CRUD lifecycle.
- Each epic has:
  - a unique project-scoped name / flag
  - a description
  - an automatically derived status
- Each task may link to zero or one epic.
- Tasks never become parents of other tasks through this feature.
- Epic status is derived automatically from linked task states and is never
  edited directly.
- Deleting an epic must clear the linked `epicId` from affected tasks rather
  than deleting or mutating those tasks otherwise.
- Epic names must be unique within a project.

## Automatic Epic Status Rules
- `Ready`
  - epic has zero linked tasks, or
  - every linked task is in `Backlog`
- `In progress`
  - at least one linked task is in `In Progress`, or
  - at least one linked task is in `Blocked`, or
  - linked tasks are mixed between `Backlog` and `Done` / archived with no task
    currently in `In Progress`
- `Completed`
  - every linked task is `Done` or archived

## Progress Bar Rules
- Every epic shown in the dedicated epic section should include a visible
  progress bar.
- Progress is derived automatically from linked tasks.
- Progress percent for v1 is:
  - numerator: linked tasks that are `Done` or archived
  - denominator: all linked tasks currently linked to the epic
- An epic with zero linked tasks shows `0%` progress and still resolves to
  status `Ready`.

## Scope
- Add a dedicated `Epic` persistence model to the Prisma schema with:
  - `id`
  - `projectId`
  - unique project-scoped `name`
  - `description`
  - timestamps
- Add an optional `epicId` relationship on `Task`.
- Ship a migration that:
  - creates the epic table
  - adds the nullable task-to-epic foreign key
  - enforces unique epic names per project
- Add epic-aware service support for:
  - create epic
  - list epics
  - update epic
  - delete epic
  - task create with optional epic link
  - task update with epic assignment or clearing
  - task reads that return epic summary metadata when linked
- Enforce epic/task validation in services:
  - epic must belong to the same project
  - tasks may link to at most one epic
  - clearing epic linkage must be supported explicitly
- Add API routes for epic CRUD under the project scope.
- Extend task APIs so create/update payloads can set or clear a linked epic.
- Add a dedicated project-page epic section that is:
  - visible
  - colorful
  - easy to scan
  - able to show all epics with name, description, derived status, progress,
    and linked-task count
- Add task create/edit support for linking or clearing one epic.
- Render the epic flag/chip on task surfaces where it matters:
  - task card
  - task detail
  - task create/edit flow
- Show linked task rollup inside the epic section so users can understand the
  initiative without turning the epic into a task card.
- Keep agent/OpenAPI documentation aligned with the new epic and task payloads.
- Add targeted regression coverage across schema/service/API/component layers.
- Update task tracking docs in the same branch.

## Out Of Scope
- Turning epics into executable Kanban tasks.
- Nested epics or epic hierarchies.
- Multiple epics per task.
- Board regrouping, lane regrouping, or epic-based board filtering in v1.
- Roadmap/timeline planning beyond the dedicated epic section.
- Notifications, reminders, or epic activity feeds.

## Acceptance Criteria
- A project can create, list, update, and delete epics through the app and API.
- Epic names are unique within a project and duplicate-name writes are rejected.
- Each task can store zero or one linked epic from the same project.
- Task create/edit flows can assign an epic or clear it back to no epic.
- Task cards and task detail surfaces display the linked epic flag when present.
- The project page includes a dedicated epic section showing all epics with:
  - name
  - description
  - derived status
  - linked-task count
  - progress bar
- Epic status is derived automatically using the locked product rules in this
  brief and is never manually edited.
- Epic deletion leaves tasks intact and clears their epic link.
- API and agent docs stay aligned with the new epic-aware contracts.
- Required tracking docs are updated consistently in the same PR.

## Definition Of Done
1. `TASK-107` is the active brief in `tasks/current.md`.
2. Schema, services, routes, task flows, and the new project epic section all
   support epics end to end.
3. Relevant validation is green:
   - `npm run lint`
   - `npm test`
   - `npm run test:coverage`
   - `npm run build`
   - preview validation once the branch is published
4. Tracking docs are updated consistently (`tasks/current.md`, `journal.md`,
   and `adr/decisions.md` only if an architecture-level decision is
   introduced).
5. The task ships through its own dedicated branch and PR with the normal
   review and preview workflow handled before handoff.

## Dependencies
- `TASK-079`
- `TASK-095`

## Evidence Plan
- Repo source of truth:
  - `agent.md`
  - `tasks/backlog.md`
  - `prisma/schema.prisma`
  - `lib/services/project-service.ts`
  - `lib/services/project-task-service.ts`
  - `app/api/projects/[projectId]/**`
  - `app/projects/[projectId]/page.tsx`
  - `app/projects/[projectId]/kanban-board-section.tsx`
  - `components/kanban-board.tsx`
  - `components/kanban/task-detail-modal.tsx`
  - `components/create-task-dialog.tsx`
  - new epic section/components introduced by this task
  - `lib/agent-onboarding.ts`
- Validation source of truth:
  - local lint/unit/build runs
  - PR review comments and CI checks
  - preview deployment verification

## Outcome Target
- NexusDash gains a clear planning layer above tasks without turning epics into
  confusing pseudo-work items.
- Users can understand project initiatives at a glance through a visible epic
  section, while still linking day-to-day tasks to one clear execution context.
- The task model stays simple: tasks remain tasks, epics remain project-scoped
  planning flags with richer meaning.

---

Last Updated: 2026-04-22
Assigned To: Agent
