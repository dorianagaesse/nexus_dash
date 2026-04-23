# Current Task: TASK-106 Project Roadmap

## Task ID
TASK-106

## Status
Done.

## Objective
Add a dedicated `Roadmap` section to each project dashboard where users can
manually create and arrange visual milestones that communicate the intended
direction of the project.

This first version is intentionally a planning-communication surface, not a
task-tracking surface. Milestones should help users see where the project is
heading at a glance, without coupling roadmap items to Kanban tasks, task
deadlines, or epics yet.

## Why This Task Matters
- NexusDash currently gives strong execution visibility through context cards,
  epics, Kanban tasks, deadlines, comments, and calendar events, but it does
  not yet provide a high-level visual story of project direction.
- Teams need a lightweight way to express upcoming phases, target moments,
  launch checkpoints, decision gates, or aspirational milestones without
  forcing those ideas into task status columns.
- A compelling roadmap section can make the project dashboard feel more
  strategic and easier to scan before users dive into execution detail.
- Keeping v1 independent from tasks preserves clarity now while leaving room
  for a future v2 where epics or tasks can power milestone tracking.

## Current Baseline Confirmed In Repo
- The project dashboard is composed from async server sections under
  `app/projects/[projectId]`.
- Existing sections use shared dashboard chrome from
  `components/project-dashboard/project-section-chrome.ts`.
- Project-scoped persistence and authorization belong in `lib/services/**`.
- API routes are thin transport adapters that authenticate principals, parse
  input, call services, and map service results.
- Project roles are already available through the service layer:
  - viewers can read project-scoped content
  - editors and owners can mutate most project execution content
  - owners keep project administration capabilities
- The app already has a first-class `Epic` model, but roadmap v1 should not
  depend on epics or tasks.

## Product Direction
- The section name is `Roadmap`.
- The user experience should be creative, visual, and compelling rather than a
  plain CRUD table.
- Desktop should present milestones as a directional journey or timeline that
  makes sequencing easy to understand at a glance.
- Mobile should feel intentionally designed, likely as a vertical milestone
  journey, stacked timeline, or card path rather than a cramped desktop layout.
- Milestones should be standalone project artifacts in v1.
- Future v2 may use epics as a tracking layer, but that is explicitly deferred.

## Scope
- Add a project-scoped roadmap milestone data model.
- Add service-layer functions for listing, creating, updating, deleting, and
  reordering roadmap milestones.
- Add API routes for roadmap milestone reads and mutations.
- Add a `Roadmap` dashboard section that matches the existing dashboard
  architecture and visual quality bar.
- Allow users with edit permission to create, edit, delete, and reorder
  milestones.
- Allow viewers to read roadmap milestones without mutation controls.
- Support milestone fields that are expressive enough for visual planning:
  - title
  - optional description
  - optional target date
  - visual state or tone for manual planning communication
  - explicit order/position
- Preserve project-scoped authorization and RLS context in all service paths.
- Add targeted unit/API/component coverage for the roadmap service, routes, and
  core UI behavior.
- Update task tracking documentation and the project blueprint after the
  feature lands.

## Out Of Scope
- Linking milestones to tasks.
- Linking milestones to epics.
- Automatic progress calculation.
- Calendar synchronization.
- Reminder or notification behavior.
- Dependency graphs or critical-path planning.
- Multi-project roadmap aggregation.
- Dragging tasks onto roadmap milestones.
- Agent/OpenAPI roadmap management unless intentionally added as a follow-up
  after the human dashboard flow is stable.

## Acceptance Criteria
- A `Roadmap` section appears on the project dashboard.
- Project members with viewer access can see roadmap milestones.
- Editors and owners can create roadmap milestones.
- Editors and owners can update roadmap milestone content and visual state.
- Editors and owners can delete roadmap milestones with an intentional
  confirmation flow.
- Editors and owners can control milestone ordering or sequencing.
- Milestones remain independent from tasks, deadlines, comments, and epics in
  v1.
- The desktop presentation communicates sequence/direction visually and is not
  just a table or unstyled list.
- The mobile presentation is intentionally adapted for narrow screens.
- Service-layer authorization rejects unauthorized reads and mutations.
- API routes remain thin adapters over the roadmap service.
- Prisma access remains limited to `lib/services/**`.
- Relevant automated tests cover service behavior, API contracts, and core UI
  rendering/interactions.
- Tracking docs are updated consistently in the same PR.

## Definition Of Done
1. `TASK-106` is the active brief in `tasks/current.md`.
2. The roadmap milestone model, migration, service, API routes, and dashboard
   section are implemented without coupling milestones to tasks or epics.
3. The UI works intentionally on desktop and mobile.
4. Relevant validation is green:
   - `npm run lint`
   - targeted roadmap service/API/component tests
   - `npm test`
   - `npm run build`
   - Playwright smoke coverage when the dashboard interaction flow is touched
5. Tracking docs are updated consistently:
   - `tasks/current.md`
   - `tasks/backlog.md`
   - `journal.md`
   - `project.md`
   - `adr/decisions.md` only if a new architecture-level decision appears
6. The task ships through its own dedicated branch and PR with automated review
   feedback triaged before handoff.

## Dependencies
- `TASK-076`
- `TASK-079`
- `TASK-096`

## Evidence Plan
- Repo source of truth:
  - `agent.md`
  - `project.md`
  - `README.md`
  - `tasks/backlog.md`
  - `prisma/schema.prisma`
  - `app/projects/[projectId]/page.tsx`
  - `components/project-dashboard/project-section-chrome.ts`
  - `lib/services/project-access-service.ts`
  - `lib/services/rls-context.ts`
- Likely implementation areas:
  - `prisma/migrations/**`
  - `lib/services/project-roadmap-service.ts`
  - `app/api/projects/[projectId]/roadmap-milestones/**`
  - `app/projects/[projectId]/project-roadmap-section.tsx`
  - `components/project-roadmap-panel.tsx`
  - focused tests under `tests/lib`, `tests/api`, and `tests/components`
- Validation source of truth:
  - local lint/test/build runs
  - targeted UI/API/service tests
  - PR checks and review comments
  - preview validation if the branch proceeds to full implementation handoff

## Outcome Target
- Project dashboards gain a high-level visual roadmap that makes project
  direction, sequencing, and upcoming milestones easy to understand.
- Roadmap v1 remains simple, manual, and expressive, setting up a clean future
  path for v2 tracking through epics or tasks without overloading the first
  release.

---

Last Updated: 2026-04-23
Assigned To: Agent
