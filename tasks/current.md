# Current Task: TASK-130 Roadmap V2

## Task ID
TASK-130

## Status
Done.

## Objective
Evolve the project `Roadmap` section from the shipped flat milestone strip into
an editable milestone-phase timeline where each roadmap phase can contain one
or many child events.

This version should stay intentionally separate from task/epic tracking while
making the roadmap feel more intentional, expressive, and structurally useful:
users should be able to shape a journey such as `Milestone 2 -> event 2, event
3, event 4`, see those related events visually connected, and edit the
structure directly from the dashboard.

## Why This Task Matters
- The current roadmap release proves the section is valuable, but a flat list
  still undersells how projects actually evolve across phases and clusters of
  meaningful events.
- Teams need a roadmap structure that can show one-to-many relationships,
  parallel moments inside the same phase, and editable sequencing without
  forcing direction-setting content into the task board.
- Delivering a richer roadmap now creates a stronger strategic layer above the
  dashboard's execution modules while preserving a clean future path for v3+
  tracking through epics or tasks.

## Current Baseline Confirmed In Repo
- `TASK-106` already shipped a standalone roadmap section with project-scoped
  flat milestones, target dates, visual status, and responsive presentation.
- The dashboard composition pattern, service-layer authorization boundaries,
  and thin route adapters are already established and must be preserved.
- `@hello-pangea/dnd` is already available in the repo through the Kanban
  surface, so roadmap v2 can use the same drag-and-drop family instead of
  introducing another interaction stack.

## Product Direction
- The section name is `Roadmap`.
- The roadmap remains a planning/communication feature, not a task tracker.
- The top-level concept should become a roadmap phase or milestone group.
- Each phase can contain one or many child events.
- Events inside the same phase should read as intentionally connected through
  line treatment and shared visual grouping.
- Desktop should feel like an editable phase journey rather than a flat strip.
- Mobile should stay clean and validated, with grouped events stacking in a way
  that still communicates belonging and order without desktop overflow hacks.
- Future tracking through epics or tasks is still deferred and should not be
  coupled into this task.

## Scope
- Replace the flat roadmap milestone model with a project-scoped hierarchy:
  roadmap phases plus child roadmap events.
- Preserve existing roadmap data by migrating current milestones into phases
  with a single child event rather than discarding shipped user content.
- Add service-layer functions for:
  - listing roadmap phases with nested events
  - creating, updating, deleting roadmap phases
  - creating, updating, deleting roadmap events
  - reordering phases
  - reordering events within a phase
  - moving events between phases
- Add or update project API routes for roadmap reads and mutations while
  keeping transport logic thin.
- Rebuild the `Roadmap` dashboard section so desktop presents milestone phases
  as a connected journey with grouped child events and mobile presents a
  compact grouped vertical flow.
- Allow viewers to read the roadmap.
- Allow editors and owners to edit roadmap phases and events directly from the
  dashboard.
- Add drag-and-drop interactions for roadmap editing:
  - reorder phases
  - reorder events inside phases
  - move an event into another phase
- Support phase fields:
  - title
  - optional description
  - optional target date
  - visual state
  - explicit order
- Support event fields:
  - title
  - optional description
  - optional target date
  - optional visual state override or inherited state behavior, whichever is
    chosen during implementation and documented clearly
  - explicit order within the phase
- Keep roadmap v2 unrelated to tasks, epics, deadlines, and automatic progress.
- Preserve project-scoped authorization and RLS context in all service paths.
- Add targeted unit/API/component coverage, plus Playwright validation against
  the deployed preview for the roadmap interaction flow.
- Update tracking and architecture docs after the feature lands.

## Out Of Scope
- Linking roadmap phases or events to tasks.
- Linking roadmap phases or events to epics.
- Automatic progress rollups.
- Calendar synchronization.
- Reminder or notification behavior.
- Dependency graphs or critical-path planning.
- Multi-project roadmap aggregation.
- Agent/OpenAPI-specific roadmap authoring work unless it falls out naturally
  from the existing authenticated app routes.

## Acceptance Criteria
- A `Roadmap` section appears on the project dashboard.
- Project members with viewer access can see grouped roadmap phases and nested
  roadmap events.
- Editors and owners can create, edit, and delete roadmap phases.
- Editors and owners can create, edit, and delete roadmap events.
- Editors and owners can reorder phases via drag-and-drop.
- Editors and owners can reorder events within a phase via drag-and-drop.
- Editors and owners can move an event between phases via drag-and-drop.
- The desktop presentation clearly communicates:
  - phase-to-phase sequence
  - event grouping inside a phase
  - visual connection between sibling events
- The mobile presentation remains intentionally adapted and readable.
- Roadmap v2 remains independent from tasks, deadlines, comments, and epics.
- Existing roadmap data is preserved through migration into the new structure.
- Service-layer authorization rejects unauthorized reads and mutations.
- API routes remain thin adapters over the roadmap service.
- Prisma access remains limited to `lib/services/**`.
- Relevant automated tests cover service behavior, API contracts, and core UI
  rendering/interactions.
- The roadmap flow is validated against a deployed preview with Playwright
  using the branch ref workflow described in `agent.md`.
- Tracking docs are updated consistently in the same PR.

## Definition Of Done
1. `TASK-130` is the active brief in `tasks/current.md`.
2. The roadmap schema, migration, services, routes, and dashboard section are
   implemented around milestone phases plus child events without coupling them
   to tasks or epics.
3. Existing roadmap milestone data migrates safely into the new structure.
4. The UI works intentionally on desktop and mobile, including drag-and-drop
   editing for the intended roadmap interactions.
5. Relevant validation is green:
   - `npm run lint`
   - targeted roadmap service/API/component tests
   - `npm test`
   - `npm run test:coverage`
   - `npm run build`
   - Playwright preview validation for the roadmap flow
6. Tracking docs are updated consistently:
   - `tasks/current.md`
   - `tasks/backlog.md`
   - `journal.md`
   - `project.md`
   - `README.md` if runtime/test/workflow guidance changes
   - `adr/decisions.md` only if a new architecture-level decision appears
7. The task ships through its own dedicated branch and PR with automated review
   feedback triaged before handoff.

## Dependencies
- `TASK-106`
- `TASK-096`
- `TASK-091`

## Evidence Plan
- Repo source of truth:
  - `agent.md`
  - `project.md`
  - `README.md`
  - `tasks/backlog.md`
  - `prisma/schema.prisma`
  - `app/projects/[projectId]/page.tsx`
  - `components/project-roadmap-panel.tsx`
  - `lib/roadmap-milestone.ts`
  - `lib/services/project-roadmap-service.ts`
- Likely implementation areas:
  - `prisma/migrations/**`
  - `lib/services/project-roadmap-service.ts`
  - `lib/roadmap-milestone.ts`
  - `app/api/projects/[projectId]/roadmap/**`
  - `app/projects/[projectId]/project-roadmap-panel-section.tsx`
  - `components/project-roadmap-panel.tsx`
  - focused tests under `tests/lib`, `tests/api`, `tests/components`, and
    `tests/e2e`
- Validation source of truth:
  - local lint/test/build runs
  - targeted UI/API/service tests
  - PR checks and review comments
  - preview workflow artifact + logs using explicit `git_ref`
  - Playwright run against the preview URL via `PLAYWRIGHT_BASE_URL`

## Outcome Target
- Project dashboards gain a more expressive roadmap that can represent both
  directional phases and clustered events without relying on the task system.
- The roadmap feels closer to an editable planning canvas than a styled list.
- The shipped structure creates a clean foundation for a future tracking layer
  that could map epics or tasks onto roadmap events without reshaping the core
  UI model again.

---

Last Updated: 2026-04-23
Assigned To: Agent
