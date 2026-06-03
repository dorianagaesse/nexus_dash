# Current Task: TASK-310 Full-Stack Product Performance Investigation

## Task ID
TASK-310

## Status
Report drafted on `docs/task-310-performance-investigation`.

## Source
- User request on 2026-06-04 after TASK-309 / PR #316 was merged:
  spend serious time on performance because NexusDash still takes several
  seconds for updates to appear and is not aligned with industry standards from
  a user-perceived latency perspective.
- Backlog entry: `tasks/backlog.md` / TASK-310.

## Objective
Produce an evidence-backed Markdown report that explains the real performance
pain points across the stack and ranks the best remediation paths. The report
must look beyond a frontend/backend split and include browser interaction,
React rendering, route refresh behavior, API/service timing, database/runtime
behavior, Vercel/serverless constraints, and realtime update propagation.

## Scope
- Measure representative user-facing flows:
  - project dashboard load
  - task create/update/move/comment
  - context card create/update
  - remote collaborator update visibility
  - notification/invitation visibility where relevant
- Inspect server and client implementation paths for avoidable waits,
  overbroad refreshes, heavy data payloads, database query cost, cold/warm
  runtime effects, and realtime transport design limits.
- Compare current behavior to reasonable modern SaaS expectations:
  instant local feedback, sub-500ms local interaction acknowledgement, and
  low-single-second remote collaboration propagation.
- Identify root causes, not only symptoms.
- Produce `docs/reports/task-310-performance-investigation.md`.
- Create the next implementation task from the report findings after the report
  PR is merged.

## Out Of Scope
- Implementing performance remediations in this task.
- Adding a new managed realtime provider during the investigation.
- Broad UI redesign unrelated to latency or perceived responsiveness.

## Acceptance Criteria
1. The report includes measured evidence from local and/or deployed runtime
   probes, not only static code review.
2. The report separates user-perceived latency into local action feedback,
   server mutation time, server-render/refresh time, database/runtime behavior,
   and remote propagation time.
3. The report identifies the highest-confidence root causes and explains why
   TASK-309 SSE did not reduce visible latency enough.
4. The report ranks remediation paths by expected user impact, engineering
   effort, risk, and alignment with state-of-the-art product behavior.
5. The report recommends a concrete next implementation task with acceptance
   criteria.

## Definition Of Done
- [x] `docs/reports/task-310-performance-investigation.md` exists and contains
      evidence, findings, and ranked recommendations.
- [x] `tasks/backlog.md`, `tasks/current.md`, and `journal.md` are updated.
- [ ] A docs PR is opened, checks/Copilot review are handled, and the PR is
      merged.
- [ ] A follow-up implementation task is created from the report output.
- [ ] The implementation task is started on its own branch after the report PR
      merge.

## Report
- `docs/reports/task-310-performance-investigation.md`
