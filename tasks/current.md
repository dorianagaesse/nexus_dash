# Current Task: TASK-130 Roadmap V2

## Task ID
TASK-130

## Status
Done.

## Objective
Refine roadmap v2 into an event-first planning surface where users create and
move roadmap events directly, while milestone groupings remain the structural
lane concept rather than the primary authored card.

This follow-up should make the section behave closer to a visual journey map:
new events default into a new milestone lane, users can optionally place a new
event into an existing milestone, stacked events inside the same milestone read
as intentionally grouped, and dragging an event to the far-right drop target
creates a new milestone automatically.

This refinement pass also needs to tighten the shipped UX details:
- the roadmap section should expand/collapse from the whole header row, like
  the other dashboard sections
- roadmap counters in the header should use the same visual treatment as the
  `Epics` section badges
- the roadmap should not show a persistent `New milestone` / `Create the next
  milestone` label in the trailing drop lane
- the extra bordered lane shell around event cards should be removed so the
  cards read as the primary visual object
- roadmap drag/drop must stop failing with `roadmap-event-move-failed`
- drag feedback should use placement shadows and card-lift treatment rather
  than expanding lane borders
- desktop roadmap connector geometry should stay centered on event cards, emit
  a single centered stem from the left milestone, and branch cleanly on the
  right without overlap artifacts, hub dots, or misaligned turns
- roadmap event creation controls should match the visual quality of task
  creation selectors, and the event modal should be polished to the same UI
  standard as the rest of the dashboard
- roadmap modal follow-up polish should keep the edit dialog compact and
  aligned: no overflowing status picker, no redundant `Update event` callout,
  and milestone headers should feel more intentionally highlighted
- desktop connector anchoring should use the real rendered event-card centers,
  not fixed card-height assumptions, so milestones with mixed card content
  still align perfectly
- milestone lane markers should inherit roadmap status tone from their child
  events: any `active` event makes the milestone active, all `reached` makes it
  reached, otherwise it stays planned

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
- Users should create roadmap `events`, not milestone cards.
- Milestones remain visible as grouping levels (`Milestone 1`, `Milestone 2`,
  etc.) that hold one or many event cards.
- New events should default into a new milestone lane at the end unless the
  user explicitly targets an existing milestone during creation.
- Event cards keep `View`, `Edit`, and `Delete` actions.
- Drag handles belong inside event cards, not on milestone chrome.
- Desktop should visually connect event cards between milestones with gray
  connector lines at the event-card level; when one milestone fans into
  multiple stacked events, the connector treatment should curve/branch rather
  than stay as a single straight segment.
- Dragging an event over an existing milestone should darken that destination
  so the grouping outcome is obvious before drop.
- Dragging an event to the far-right drop target should create a new milestone
  and place the event there.
- Mobile should stay clean and intentionally adapted even if the desktop
  connector treatment simplifies on smaller screens.
- Future tracking through epics or tasks is still deferred and should not be
  coupled into this task.

## Scope
- Keep the roadmap persistence model project-scoped around milestone groups plus
  child events, but shift the authored UI model so events are the primary
  created and manipulated entity.
- Preserve current roadmap data while presenting milestones as generic grouping
  labels instead of user-authored milestone cards.
- Allow new roadmap event creation from a `New event` entry point only.
- Let event creation target either:
  - a new milestone lane (default)
  - an existing milestone lane selected from the current milestone list
- Rebuild the `Roadmap` dashboard section so desktop presents milestone lanes
  containing stacked event cards with card-level connectors and drag/drop
  regrouping, while mobile presents the same grouping model in a cleaner
  vertical stack.
- Allow viewers to read the roadmap.
- Allow editors and owners to create, edit, delete, and regroup roadmap events
  directly from the dashboard.
- Add drag-and-drop interactions for roadmap editing:
  - reorder events inside a milestone
  - move an event into another existing milestone
  - move an event into a new milestone by dropping onto the trailing new-lane
    destination
- Remove milestone-level edit/delete controls from the primary roadmap UI.
- Keep milestone numbering derived from visual order (`Milestone 1`, `Milestone 2`, etc.).
- Support event fields:
  - title
  - optional description
  - optional target date
  - visual state
  - explicit order within the milestone lane
- Keep roadmap unrelated to tasks, epics, deadlines, and automatic progress.
- Fix the roadmap modal presentation so dialogs render as real viewport overlays
  rather than appearing clipped or visually anchored inside the roadmap panel.
- Move the `Roadmap` section below `Kanban board` in the project dashboard
  composition.
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
- The `Roadmap` section is rendered below `Kanban board`.
- Project members with viewer access can see milestone lanes with nested roadmap
  event cards.
- Editors and owners can create roadmap events from a `New event` action.
- New event creation defaults to a new milestone lane and can optionally target
  an existing milestone lane.
- Editors and owners can edit and delete roadmap events from event-card actions.
- Editors and owners can reorder events within a milestone via drag-and-drop.
- Editors and owners can move an event between milestones via drag-and-drop.
- Editors and owners can drop an event into a trailing destination that creates
  a new milestone lane automatically.
- The desktop presentation clearly communicates:
  - milestone-to-milestone sequence
  - event grouping inside a milestone
  - visual connection between sibling events at the card level
  - curved/branching connector behavior when one milestone fans into multiple
    stacked events in the next milestone
- The mobile presentation remains intentionally adapted and readable.
- The roadmap modal renders as a usable full overlay and is not clipped or
  visually trapped inside the roadmap section.
- Roadmap remains independent from tasks, deadlines, comments, and epics.
- Existing roadmap data remains usable in the updated event-first UI model.
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
   implemented around milestone groups plus child events without coupling them
   to tasks or epics, with an event-first authored UI.
3. Existing roadmap milestone data remains usable inside the new event-first
   presentation.
4. The UI works intentionally on desktop and mobile, including event-first
   creation, regrouping, drop-to-new-milestone behavior, and corrected modal
   overlay behavior.
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

Last Updated: 2026-04-25
Assigned To: Agent
