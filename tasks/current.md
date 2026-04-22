# Current Task: TASK-128 Task Assignee Quick Assign From Task Options

## Task ID
TASK-128

## Status
In progress.

## Objective
Let collaborators assign or clear a task assignee directly from the existing
task options menu, so common ownership changes do not require switching into
full edit mode.

## Why This Task Matters
- `TASK-101` already introduced assignee data across schema, services, API
  routes, and task surfaces, but the fastest reassignment path still lives
  behind full task edit mode.
- Ownership changes are one of the most frequent task adjustments during daily
  execution, especially while triaging new work or redistributing active work.
- The task options menu already hosts quick actions for move/archive/delete, so
  assignee fits naturally there as another lightweight task-management action.

## Current Baseline Confirmed In Repo
- Tasks already persist an optional `assigneeUserId`.
- Task create/edit flows already validate assignees against current project
  collaborators.
- The task detail modal already shows the current assignee and already exposes a
  task options menu.
- The `PATCH /api/projects/{projectId}/tasks/{taskId}` route already supports
  changing or clearing assignee through the existing service boundary.

## Scope
- Add an assignee quick-action entry inside the existing task options menu.
- Allow assigning the task to any current project collaborator from that menu.
- Allow clearing the assignee back to unassigned from that menu.
- Reuse the existing task update API/service path instead of introducing a
  parallel assignee-only endpoint.
- Keep local task state, modal header assignee badge, and board card assignee
  UI aligned immediately after the quick update.
- Preserve current collaborator validation and current error handling behavior.
- Add targeted regression coverage for the quick-assignment path.
- Update task tracking docs in the same branch.

## Out Of Scope
- Assignee search/filter across the whole board.
- Bulk assignment actions.
- New collaborator-management UX.
- Additional provenance model changes beyond the already shipped `TASK-101`
  contract.

## Acceptance Criteria
- The task options menu includes an assignee quick-action path.
- Users can assign a task to any current project collaborator from that menu.
- Users can clear an assignee back to unassigned from that menu.
- Invalid assignee writes are still rejected by the existing service boundary.
- The task detail assignee badge updates immediately after a successful quick
  assignment change.
- Task tracking docs are updated consistently in the same PR.

## Definition Of Done
1. `TASK-128` is the active brief in `tasks/current.md`.
2. Task options support assignee quick assignment end to end through the
   existing UI/API/service stack.
3. Relevant validation is green:
   - `npm run lint`
   - targeted automated coverage for the quick-action path
   - `npm run build`
   - preview validation once the branch is published
4. Tracking docs are updated consistently (`tasks/current.md`,
   `tasks/backlog.md`, and `journal.md`; `adr/decisions.md` only if a new
   architecture-level decision appears).
5. The task ships through its own dedicated branch and PR with Copilot review
   triaged before handoff.

## Dependencies
- `TASK-101`
- `TASK-079`

## Evidence Plan
- Repo source of truth:
  - `agent.md`
  - `tasks/backlog.md`
  - `components/kanban/task-detail-modal.tsx`
  - `components/kanban-board.tsx`
  - `components/ui/assignee-select.tsx`
  - `app/api/projects/[projectId]/tasks/[taskId]/route.ts`
  - `lib/services/project-task-service.ts`
  - `tests/e2e/smoke-project-task-calendar.spec.ts`
- Validation source of truth:
  - local lint/build runs
  - targeted automated tests
  - PR review comments and checks
  - preview deployment verification

## Outcome Target
- Reassigning task ownership becomes a lightweight task-management action rather
  than a full edit workflow.
- NexusDash keeps the task detail modal focused on quick execution changes where
  that makes the most sense.

---

Last Updated: 2026-04-22
Assigned To: Agent
