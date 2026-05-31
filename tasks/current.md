# Current Task: TASK-276 App Performance Remediation

## Task ID
TASK-276

## Status
In progress on `feature/task-276-performance-remediation`.

## Source
- User request on 2026-05-31:
  common app actions currently take several seconds and need a durable,
  production-ready implementation fix.
- Investigation report: `docs/reports/task-275-performance-investigation.md`
- Task brief: `tasks/task-276-app-performance-remediation.md`

## Objective
Implement the first evidence-backed performance remediation set from TASK-275 so
high-frequency project, task, comment, context-card, and board movement actions
give immediate local feedback, avoid avoidable full route refreshes, and expose
timing evidence for deployed API hotspots.

## Scope
- Return complete mutation payloads where the UI needs them, especially board-
  ready task creation data.
- Replace success-path `router.refresh()` calls in targeted task/context flows
  with local state updates and bounded reconciliation.
- Keep persistence failure handling explicit through rollback, error toasts, or
  affected-item reconciliation.
- Reduce kanban reorder persistence work by skipping unchanged rows server-side.
- Add lightweight production-safe timing evidence for targeted mutation routes.
- Validate locally and against a branch-ref preview with before/after timing
  evidence.

## Acceptance Criteria
1. Task create, task update/save, quick task assignment/epic changes, comments,
   kanban drag/drop, and context-card create/update/delete no longer depend on a
   visible full-dashboard refresh for their normal success feedback.
2. Task creation returns enough API data for the board to render the new card
   without waiting for a route refresh.
3. Failed optimistic or local-first mutations roll back or surface a targeted
   error without blanking unrelated dashboard sections.
4. Reorder persistence skips unchanged task rows while preserving status,
   position, completion, authorization, activity, and realtime semantics.
5. Production-safe timing hooks make targeted API route latency measurable on
   preview.
6. Focused automated tests cover changed API/service/client behavior.
7. Preview validation records timing evidence for the targeted flows.

## Definition Of Done
- [x] Implementation is committed on the dedicated feature branch.
- [x] Focused tests cover mutation payload/local update/reorder behavior.
- [x] `npm run lint`, `npm test`, `npm run test:coverage`, and `npm run build`
      pass.
- [x] A branch-ref preview deployment is created and validated with Playwright or
      direct API/browser timing evidence.
- [x] `tasks/backlog.md`, `tasks/current.md`, and `journal.md` are updated.
- [ ] A ready-for-review PR is opened, automated checks pass, and Copilot review
      feedback is handled.

## Notes
- TASK-275 proved local service calls are fast but deployed API calls and browser
  route refreshes stack into several-second perceived waits.
- This remediation batch improves perceived responsiveness first by removing
  avoidable success-path route refreshes from targeted task/comment/context-card
  dashboard flows, adding board-ready mutation payloads, and recording
  `Server-Timing` on targeted API routes.
- Residual deployed API sub-causes should be evaluated with the new timing
  headers and preview evidence instead of guesswork.
- Preview deployment run `26718308463` checked out
  `feature/task-276-performance-remediation` at commit `5bee1f0` and produced
  `https://nexus-dash-7amtvjh4y-dorian-agaesses-projects.vercel.app`.
- Preview validation used project-scoped agent credentials because the local
  Playwright session seeding env did not match the deployed runtime database;
  the browser smoke redirected to sign-in and was not counted as a pass.
- Preview API smoke passed task/context create, update, comment/list, and cleanup
  flows. Timing evidence is exposed through `x-nexusdash-server-timing`; Vercel
  did not expose the standard `Server-Timing` header on the tested deployment.
