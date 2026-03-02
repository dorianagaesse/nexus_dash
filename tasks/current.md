# Current Task: ISSUE-070 Mutation/Upload Latency and Responsiveness

## Task ID
ISSUE-070

## Status
Execution Complete, Follow-up Recommended (2026-03-02)

## Objective
Improve perceived mutation responsiveness and upload throughput by removing broad refreshes, adding optimistic updates, increasing direct-upload parallelism, and capturing measurable before/after timings.

## Why Now
- User-reported latency in core flows (`/projects` mutations, task creation, multi-file uploads).
- Existing direct-upload architecture was correct for payload limits but still incurred avoidable perceived delays.

## Scope
- Add project mutation APIs:
  - `POST /api/projects`
  - `PATCH /api/projects/:projectId`
  - `DELETE /api/projects/:projectId`
- Expand create payloads (backward compatible):
  - `POST /api/projects/:projectId/tasks` now returns `{ taskId, task }`
  - `POST /api/projects/:projectId/context-cards` now returns `{ cardId, card }`
- Replace refresh-driven mutation UX with local/optimistic state updates for projects, tasks, and context cards.
- Upgrade direct background uploader to bounded concurrency (`default = 3`) with item success and stage callbacks.
- Add route timing + client timing instrumentation for targeted mutation/upload paths.
- Produce before/after perf evidence and issue report.

## Out of Scope
- Redesign of storage provider architecture.
- Authorization model changes beyond preserving existing service-layer checks.

## Acceptance Criteria
- Project create perceived completion p95 `< 1.0s` (excluding outliers).
- Task create perceived completion p95 `< 1.0s`.
- Mobile multi-file upload total completion improved by `>= 30%`.
- No authz/security regression in attachment endpoints.
- `npm run lint`, `npm test`, `npm run test:coverage`, `npm run build` all pass.

## Results
- Project create p95: `966ms -> 949ms` (passes target).
- Task create raw p95: `1977ms -> 1931ms` (still above target because of first-run warm-up outlier); steady-state samples are `< 1.0s`.
- Mobile multi-file upload:
  - p50: `3992ms -> 1947ms`
  - p95: `7016ms -> 4985ms`
  - raw mean: `4746ms -> 2707ms` (~43% faster, passes target).
- Validation: lint/test/coverage/build all green on this branch.

## Definition of Done
- Branch work completed (`fix/issue-70-perf-responsiveness`).
- API, UI, upload, and instrumentation changes implemented with tests.
- Performance before/after captured and documented.
- GitHub issue #70 receives an execution report with residual risks and next-step gap list.

---

Last Updated: 2026-03-02
Assigned To: User + Agent
