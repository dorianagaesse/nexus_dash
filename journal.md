Date: 2026-02-11
Issue: Prisma migrate failed with schema engine error because the SQLite file did not exist.
Resolution: Created `prisma/dev.db` and reran `npx prisma migrate dev --name init` successfully.

Date: 2026-02-11
Issue: `docker compose up --build -d` failed because the Docker daemon was not running.
Resolution: None (requires Docker daemon to be started locally).
Date: 2026-02-11
Issue: Landing page CTA "Start a new project" had no action.
Resolution: Wired CTA to `/projects` and added `app/projects/page.tsx` placeholder route for next milestone.

Date: 2026-02-11
Issue: Docker compose initially failed due daemon unavailability and later host port conflict on `3000`.
Resolution: Started Docker Desktop from CLI and made compose host port configurable via `APP_PORT` (default `3000`); validated container start and hot reload on `APP_PORT=3001`.
Date: 2026-02-12
Issue: `/projects` returned 500 in Docker after introducing Prisma-backed server rendering.
Resolution: Added Prisma generation at compose startup and during Docker image build.

Date: 2026-02-12
Issue: Prisma engine mismatch on Alpine/Bookworm images (`libssl` incompatibility) during build/runtime.
Resolution: Switched Docker base image to `node:18-bullseye`, rebuilt image, and verified `/projects` returns HTTP 200.

Date: 2026-02-12
Validation: Project CRUD end-to-end test completed using live Docker app at `http://localhost:3001/projects`.
Resolution: Created, updated, and deleted a project via server-action multipart POSTs (HTTP 303 responses), then confirmed DB project count = 0.
Date: 2026-02-12
Issue: TypeScript build error in `app/projects/[projectId]/page.tsx` due string `status` not narrowing to `TaskStatus`.
Resolution: Switched to explicit guarded mapping using `isTaskStatus` before pushing tasks into `KanbanTask[]`.

Date: 2026-02-12
Validation: Temporary smoke validation for TASK-003 completed.
Resolution: Seeded a temporary project/tasks, confirmed dashboard route rendering, called reorder API successfully, verified DB status/position updates, then removed smoke data.
Date: 2026-02-12
Feedback update: Task creation was perceived as too large/noisy and newly created task not visible in board state.
Resolution: Added state sync in `components/kanban-board.tsx` for incoming server data and replaced inline create form with compact modal trigger (`components/create-task-dialog.tsx`).
Date: 2026-02-12
Issue: Kanban card drag was limited to a small handle area and long descriptions could produce poor card readability.
Resolution: Applied drag handle props to the full card surface and added safe description preview truncation with ellipsis.

Date: 2026-02-12
Issue: Users needed fast access to full task details without cluttering the board.
Resolution: Added click-to-open task detail modal in `components/kanban-board.tsx` with full title/label/status/description display.
Date: 2026-02-12
Issue: Task descriptions needed formatting support while preserving safe rendering.
Resolution: Added `sanitize-html` based sanitization (`lib/rich-text.ts`), rich-text editor UI, and plain-text preview extraction for board cards.

Date: 2026-02-12
Issue: Users could view card details but not edit existing task content.
Resolution: Added in-modal edit mode and persisted task updates through `PATCH /api/projects/[projectId]/tasks/[taskId]`.
Date: 2026-02-12
Feedback update: Rich-text needed heading presets and task detail long-content handling improvements.
Resolution: Added `Title 1`/`Title 2` formatting actions in the editor, allowed `h1/h2` in sanitization, and constrained detail modal content with overflow-safe wrapping and scroll.

Date: 2026-02-12
Feedback update: Creation modal should close on outside click.
Resolution: Added outside-click dismissal behavior to task creation modal and captured same requirement for project creation in backlog refinement.
Date: 2026-02-12
Feedback update: Task creation control should live under the Kanban title to preserve board space for project context.
Resolution: Added a Kanban header action slot and moved the `New task` modal trigger into that slot; removed the standalone task-create helper card.
Date: 2026-02-12
Feedback update: App needs day/night mode with a clean bright option and persistent preference.
Resolution: Added a global theme toggle, persisted selected mode in localStorage, bootstrapped saved mode at layout load, and adjusted success banner colors for light-mode readability.
Date: 2026-02-12
Feedback update: Projects home should prioritize current projects and use a compact modal for project creation with outside-click dismissal.
Resolution: Added `CreateProjectDialog` modal component and replaced inline project creation form on `/projects` with a top-level trigger.
Date: 2026-02-12
Feedback update: Kanban lists should not display dashed inner borders around task zones.
Resolution: Removed dashed border styling from the Kanban droppable area container while preserving drag-over highlight behavior.
Date: 2026-02-12
Feedback update: Task edit action should be an icon in the modal header next to close.
Resolution: Moved edit trigger to an icon-only button in task detail modal header and removed the older inline "Edit task" button from modal content.
Date: 2026-02-12
Feedback update: Blocked tasks should be visually identifiable in the board list view.
Resolution: Added an orange warning icon on task cards rendered in the `Blocked` column while preserving existing drag-and-open interactions.
Date: 2026-02-12
Feedback update: Expanded blocked tasks should include editable warning follow-up details.
Resolution: Added persisted `blockedNote` support through Prisma schema + migration, task update API, dashboard mapping, and blocked-task modal warning section.
Date: 2026-02-12
Feedback update: In blocked-task edit mode, the blocker area should remain visually highlighted.
Resolution: Styled the blocked follow-up edit panel with amber background and border to match warning semantics.
Date: 2026-02-12
Process update: Backlog readability needed clearer separation between open and completed work.
Resolution: Reorganized `tasks/backlog.md` into `Pending` and `Completed` sections while preserving task history for traceability.
Date: 2026-02-12
Feedback update: Done tasks should auto-archive after one week and remain accessible through a Done-column archive dropdown.
Resolution: Added Done lifecycle fields (`completedAt`, `archivedAt`), auto-archive processing for stale Done tasks on dashboard load, and an `Archive (N)` dropdown in the Done column showing archived task previews.
Date: 2026-02-12
Feature update: Project dashboard needs a dedicated context area above Kanban with user-defined cards.
Resolution: Added project-scoped context card CRUD (create/edit/delete) and a top panel UI with modal add/edit flows, backed by `Resource` entries of type `context-card`.
Date: 2026-02-12
Feedback update: Context panel should be more minimalist when collapsed, clickable across the header line, with pastel card colors and automatic modal close after create.
Resolution: Added a compact header with left-side arrow toggle, full-line click target for expand/collapse, auto-expand when adding a card, pastel color picker with random default, and on-submit modal close behavior.
Date: 2026-02-12
Feedback update: Status success messages should disappear automatically.
Resolution: Added a reusable auto-dismissing alert component and replaced project/project-dashboard success banners with transient alerts.
Date: 2026-02-12
Feedback update: Context panel needs better space handling, compact cards, pastel colors, and modal-close-on-create behavior.
Resolution: Added panel expand/collapse control, compact card layout with pastel background colors, user-selectable card color (random default on create), and explicit modal close on form submit.
Date: 2026-02-12
Feedback update: Dashboard sections should look more uniform with minimal visual noise and shared collapse behavior.
Resolution: Removed the outer border from the Project context panel, increased the Project context heading size, and added an equivalent expand/collapse header interaction for the Kanban section.
Date: 2026-02-12
Feedback update: Project context and Kanban headers needed stronger visual alignment; section collapse preference should be tracked.
Resolution: Normalized Project context header layout/padding to match Kanban alignment and added TASK-024 in backlog for localStorage-based persistence of panel expand/collapse state.
Date: 2026-02-12
Feedback update: Header action buttons should be normalized to the right of section titles and panel state should persist between reloads.
Resolution: Moved `Add card` and `New task` actions to right-aligned header placement, added per-project localStorage persistence for context/kanban expansion state, and reprioritized backlog to move TASK-005 before TASK-022.
Date: 2026-02-12
Feature update: TASK-007, TASK-018, and TASK-019 implemented together as one attachment iteration.
Resolution: Added attachment schema/models and migration, local server-side file storage helpers, task/context attachment CRUD + download APIs, and UI management flows in task detail and context card edit modal.
Date: 2026-02-12
Issue: Build failed because `NextResponse` body typing rejected raw `Buffer` in download routes.
Resolution: Returned `Uint8Array` body payloads in download handlers for task/context attachments.
Date: 2026-02-18
Planning update: Auth product vision clarified around signed-out home entry, persistent modern sessions, and phased provider rollout.
Resolution: Updated backlog scope for TASK-020/TASK-045/TASK-047, added TASK-068 for social provider rollout sequencing, moved TASK-067 to completed, and reset `tasks/current.md` to TASK-062 readiness with explicit acceptance criteria/DoD.
Date: 2026-02-18
Planning update: Auth/session model was locked before implementation work to reduce ambiguity for TASK-020/TASK-045/TASK-059.
Resolution: Confirmed hybrid direction (DB-backed user sessions + JWT-style scoped tokens for agents/API), added TASK-069 as next mandatory Cloudflare R2 validation gate, and updated `tasks/current.md` to run R2 smoke before TASK-062 decomposition.
