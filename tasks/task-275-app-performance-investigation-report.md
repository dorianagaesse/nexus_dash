# TASK-275 App Performance Investigation

## Task ID
TASK-275

## Status
Promoted 2026-05-31

## Objective
Produce a measurement-backed performance report for the app's slow-feeling
creation, update, navigation, and refresh flows, then turn the findings into a
concrete remediation plan for TASK-276.

## Rationale
Manual preview and production-like usage confirm the application works
functionally, but common actions still take several seconds. The next step must
be investigation-first so the durable remediation work improves real
user-perceived latency rather than guessing at isolated optimizations.

## Scope
- Measure representative flows:
  - project creation and project-list refresh
  - task creation, update, modal open/close, and board refresh
  - context-card creation/update and dashboard refresh
  - roadmap/calendar interactions where they materially affect dashboard speed
  - notification/account surfaces if they affect common navigation latency
- Capture evidence from browser devtools or browser automation, server logs,
  request timings, database/query timing, bundle/hydration characteristics, and
  route refresh behavior.
- Identify whether slowness is dominated by network round trips, Prisma/query
  behavior, RLS transaction work, Next.js cache invalidation, full route
  refreshes, client hydration, oversized payloads, missing optimistic UI, or
  loading-state ergonomics.
- Compare observed behavior against practical industry targets for interactive
  SaaS apps: fast local feedback, low-latency mutations, limited blocking
  refreshes, stable layout, and responsive loading states.
- Produce a ranked remediation plan for TASK-276 with expected impact,
  complexity, risk, validation approach, and sequencing.

## Out Of Scope
- Broad product redesign unrelated to action latency.
- Large behavior changes before the root causes are measured.
- Bundling the full remediation implementation into this investigation task.
- Introducing observability vendors or paid infrastructure without an explicit
  decision.

## Acceptance Criteria
1. A performance report exists in the repo with measured evidence for the
   highest-traffic creation, update, and refresh flows.
2. The report distinguishes backend latency, database/query cost, frontend
   rendering/hydration cost, cache/refresh behavior, and perceived-latency UX.
3. The investigation identifies whether several-second actions are dominated by
   network, database, server rendering, cache invalidation, route refresh,
   client hydration/rendering, missing optimistic UI, or loading-state
   ergonomics.
4. Recommendations are ranked by user impact, implementation complexity, risk,
   and expected production durability.
5. TASK-276 has a concrete implementation plan with the first fix set,
   validation targets, and rollback/risk notes.
6. The report explicitly calls out any quick wins versus architectural changes.

## Definition Of Done
- The report is committed as documentation.
- TASK-276 is updated, if needed, with the implementation scope discovered by
  the investigation.
- `tasks/backlog.md` and `tasks/current.md` are updated with sequencing changes.
- `journal.md` records the investigation outcome and recommended next steps.
- The PR is opened for review; no product behavior changes are bundled unless a
  tiny measurement/instrumentation change is explicitly necessary.

## Validation Plan
- Manual preview walkthrough with browser timing evidence.
- Browser automation screenshots or traces where useful.
- Server/runtime log review around measured flows.
- API timing probes for representative project/task/context-card operations.
- Database/query timing analysis where available.
- `git diff --check`.
