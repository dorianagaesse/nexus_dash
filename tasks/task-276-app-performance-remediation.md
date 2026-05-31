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

## Scope
- Implement the highest-impact fixes from the TASK-275 report.
- Reduce blocking work in common flows:
  - project creation and project-list refresh
  - task creation, update, assignment, comment, and board refresh
  - context-card creation/update and dashboard refresh
  - roadmap/calendar interactions if TASK-275 identifies them as material
- Prefer durable patterns over one-off patches:
  - efficient service/query boundaries
  - narrower payloads and refreshes
  - optimistic or immediate local feedback where safe
  - sensible cache invalidation/revalidation behavior
  - loading states that communicate progress without blocking unrelated work
  - lightweight production-safe timing/observability hooks when needed
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
- Focused unit/API/component tests for touched behavior.
- `npm run lint`
- `npm test`
- `npm run test:coverage`
- `npm run build`
- Relevant Playwright smoke or targeted preview automation.
- Branch-ref Vercel preview validation with before/after timing comparison.
