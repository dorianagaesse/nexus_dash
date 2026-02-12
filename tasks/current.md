# Current Task: Kanban Board With Drag-and-Drop Persistence

## Task ID
TASK-003

## Status
🟢 **Done**

## Priority
🔴 **High** - Core workflow for project execution

## Description
Implement the project dashboard Kanban board with four columns (`Backlog`, `In Progress`, `Blocked`, `Done`) using `@hello-pangea/dnd`, with persisted task status and position in SQLite via Prisma.

## Acceptance Criteria / Definition of Done

### ✅ Dashboard Routing
- [x] Each project can open a dedicated dashboard route (`/projects/[projectId]`)
- [x] Dashboard displays project context and Kanban board

### ✅ Kanban UI
- [x] Four columns rendered in the expected order
- [x] Tasks render as cards with title, description, label badge
- [x] Empty-column states are visible and readable
- [x] Dragging task applies visual feedback (scale/rotation)

### ✅ Persistence
- [x] Dragging within a column persists updated positions
- [x] Dragging across columns persists both status and position
- [x] Persistence updates are scoped to the current project only
- [x] Errors during persistence are handled and surfaced in UI

### ✅ Task Management (Minimum)
- [x] Ability to create tasks in project dashboard
- [x] Newly created tasks appear in Backlog with persisted position

### ✅ Verification
- [x] `npm run lint` passes
- [x] `npm run build` passes
- [x] Temporary smoke checks performed (`/projects/[projectId]` render + reorder API + DB verification)
- [ ] Full real-world test scenarios deferred (requested after TASK-003)

## Implementation Notes
- Added project dashboard route: `app/projects/[projectId]/page.tsx`
- Added task creation server action: `app/projects/[projectId]/actions.ts`
- Added drag-and-drop board component: `components/kanban-board.tsx`
- Added reorder persistence endpoint: `app/api/projects/[projectId]/tasks/reorder/route.ts`
- Added shared task status constants/types: `lib/task-status.ts`
- Updated projects list cards to open dashboard routes: `app/projects/page.tsx`

## Blockers / Dependencies

### Current Blockers
- None

### Dependencies
- TASK-002 completed

## Success Metrics
Task is **COMPLETE** when:
- [x] Kanban drag-and-drop works on project dashboard
- [x] Status/position persistence is written to DB
- [x] Task creation in dashboard works
- [x] Ready to move to TASK-004 (resource panel)

---

**Last Updated**: 2026-02-12
**Assigned To**: Agent
**Started At**: 2026-02-12
**Completed At**: 2026-02-12
