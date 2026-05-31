# Current Task: TASK-275 App Performance Investigation

## Task ID
TASK-275

## Status
Investigation complete on `feature/task-275-performance-investigation`;
awaiting PR review/merge.

## Source
- User request on 2026-05-31:
  common app actions currently take several seconds and need a deep
  investigation followed by durable, production-ready remediation.
- Backlog entry: `tasks/backlog.md`
- Task brief: `tasks/task-275-app-performance-investigation-report.md`
- Follow-up implementation task: `tasks/task-276-app-performance-remediation.md`

## Objective
Measure and explain the app's slow-feeling creation, update, navigation, and
refresh flows, then produce the concrete implementation plan that TASK-276 will
execute.

## Scope
- Capture timing evidence across browser, API, database/query, server render,
  cache/refresh, client hydration/rendering, and perceived-latency layers.
- Focus on everyday flows where actions currently take several seconds:
  project creation/list refresh, task creation/update/assignment/comment/board
  refresh, context-card creation/update/dashboard refresh, and any roadmap or
  calendar interactions that materially affect dashboard speed.
- Identify whether the dominant causes are backend latency, database/RLS work,
  network round trips, route refreshes, cache invalidation, oversized payloads,
  client rendering/hydration, missing optimistic UI, or loading-state ergonomics.
- Update TASK-276 with the evidence-backed remediation scope.

## Acceptance Criteria
1. A performance report exists in the repo with measured evidence for the
   highest-traffic slow flows.
2. The report separates backend/API, database/query, render/hydration,
   cache/refresh, network, and perceived-UX costs.
3. The investigation identifies the dominant root causes behind several-second
   actions.
4. Recommendations are ranked by impact, complexity, risk, and production
   durability.
5. TASK-276 has a concrete implementation plan for the first remediation set.

## Definition Of Done
- [x] Measurement evidence is captured from preview, production-equivalent, or
  local runs with clear environment notes.
- [x] The investigation report is committed.
- [x] TASK-276 is updated with implementation scope, validation targets, and
  risk notes.
- [x] `journal.md` records findings and next steps.
- [x] `git diff --check` passes.

## Findings
- Report: `docs/reports/task-275-performance-investigation.md`
- Main cause: common actions are visibly gated by server confirmation and broad
  `router.refresh()` calls, not a single obviously multi-second service method.
- Local Docker Postgres probe showed task/comment/context mutation services in
  the 15-30 ms range; full-board reorder was 113.9 ms for a 41-task board.
- Preview agent API timing was blocked because the provided key now returns
  `invalid-api-key`; TASK-276 needs refreshed preview access or signed-in
  browser validation for before/after timing.

## Open Questions
- Which deployment/environment should be treated as the primary performance
  baseline if preview and production differ materially?
- Should TASK-276 use a small state/cache helper inside the current components
  first, or introduce a broader client data layer such as SWR for mutation
  reconciliation?
