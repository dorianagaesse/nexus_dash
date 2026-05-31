# TASK-276 App Performance Remediation

## Task ID
TASK-276

## Status
Queued behind TASK-275

## Objective
Implement durable, production-ready performance fixes for the several-second
action latency identified by TASK-275, with emphasis on user-perceived speed,
low-latency mutations, bounded refresh work, and regression visibility.

## Rationale
Investigation and implementation should be separate so remediation can be
evidence-led. Once TASK-275 identifies the dominant latency sources, this task
owns the production fix set and validation needed to make everyday app actions
feel responsive by modern SaaS standards.

## TASK-275 Findings
- Report: `docs/reports/task-275-performance-investigation.md`
- Dominant cause: user-visible state changes are often gated on server
  confirmation plus broad `router.refresh()` calls.
- Local service timings did not show inherently multi-second mutation services:
  task/comment/context mutations were 15-30 ms locally, while full-board reorder
  was 113.9 ms for a 41-task board.
- Protected preview API timings are materially slower: warm repeat timings were
  2442.1 ms for task create, 2152.4 ms for task update, 1776-1898 ms for task
  list, and 1551.3 ms for full-board reorder via `vercel curl`.
- Direct preview API timings after disabling Vercel deployment protection remain
  seconds-level: p50 2316.9 ms for task create, 2029.4 ms for task update,
  1603.6 ms for task list, and 1109.2 ms for reorder.
- Local Playwright timing showed task creation at 4696.2 ms from submit to card
  visible, despite direct service creation measuring 22.1 ms.
- When Vercel deployment protection is enabled, preview validation must use
  `vercel curl`, a Vercel protection bypass secret, or an authenticated browser
  session; otherwise direct API calls hit Vercel auth before app code.

## Scope
- Implement the highest-impact fixes from the TASK-275 report.
- Prioritize immediate local feedback for:
  - task create
  - task update/save
  - quick task assignee and epic updates
  - task comment create and comment count increment
  - kanban drag/drop persistence
  - context-card create/update/delete
  - project create/update list feedback
- Replace mutation-completion `router.refresh()` calls with local state/cache
  updates plus debounced background reconciliation. Full route refresh should be
  a fallback for consistency recovery, not the primary success path.
- Return complete mutation payloads where needed. In particular, task creation
  should return a board-ready task payload instead of only `taskId`.
- Reduce kanban reorder work by sending and persisting only the moved task and
  affected ordering window, or by detecting changed rows server-side before
  issuing updates.
- Move stale done-task archival out of `listProjectKanbanTasks()` into a
  scheduled, explicit, or otherwise non-read-path maintenance workflow.
- Add lightweight production-safe timing hooks for click-to-visible-update and
  server mutation/refresh duration.
- Investigate and reduce deployed API latency in the task create/update/list
  paths, including query shape, RLS transaction overhead, project activity touch,
  serverless/runtime behavior, and database connection path.
- Preserve authorization, RLS, realtime collaboration, and notification
  semantics.

## Out Of Scope
- Cosmetic redesign not tied to performance.
- Paid infrastructure changes without an explicit decision.
- Replacing the app architecture wholesale unless TASK-275 proves it is
  necessary and the change is explicitly approved.

## Acceptance Criteria
1. The implemented fix set maps directly to measured TASK-275 findings.
2. Representative common actions are measurably faster on preview or production-
   equivalent validation data.
3. User-perceived latency improves through faster local feedback, reduced
   blocking refreshes, or both.
4. Data correctness, authorization, RLS, realtime updates, and notification
   behavior remain intact.
5. Automated tests cover changed service/API/client behavior.
6. Preview validation records before/after timing evidence for the targeted
   flows.
7. The final handoff documents residual performance risks and any follow-up
   tasks.

## Target Behaviors
- Safe local UI feedback appears within 100 ms for create/update/comment/move
  flows, with clear pending state while the server persists.
- Persistence failures roll back or reconcile the affected item only and show an
  actionable error.
- Successful mutations do not visibly blank, reflow, or reload unrelated
  dashboard sections.
- Multi-user live refresh still surfaces remote changes without interrupting
  active editing or causing avoidable full-dashboard churn.

## Definition Of Done
- The TASK-275 report is complete and linked from this task.
- The selected remediation scope is implemented on a dedicated feature branch.
- Focused tests and the full validation baseline pass.
- Branch-ref preview deployment is validated with timing evidence.
- `tasks/backlog.md`, `tasks/current.md`, and `journal.md` reflect completion
  state and any follow-up work.
- A PR is opened for review, Copilot feedback is handled, and merge-readiness is
  based on both automated checks and preview performance evidence.

## Validation Plan
- Focused unit/API/component tests for touched behavior, especially optimistic
  success, rollback, and background reconciliation paths.
- `npm run lint`
- `npm test`
- `npm run test:coverage`
- `npm run build`
- Relevant Playwright smoke or targeted preview automation covering:
  - create task: submit to card visible
  - add comment: submit to comment visible and count incremented
  - quick assignee/epic update: click to visible metadata update
  - drag task between columns: mouse up to target-column visible update
  - create context card: submit to card visible
  - create/update project: submit to list visible/updated
- Branch-ref Vercel preview validation with before/after timing comparison.
