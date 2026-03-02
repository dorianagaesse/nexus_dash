# Current Task: ISSUE-070 Mutation/Upload Latency and Responsiveness

## Task ID
ISSUE-070

## Status
In Progress (2026-03-02)

## Objective
Deliver targeted, low-risk responsiveness improvements focused on the highest-impact bottlenecks.

## Why Now
- Multi-file direct uploads are sequential on mainline and can be materially faster with bounded concurrency.
- Create flows with background uploads currently trigger duplicate refreshes, adding avoidable UI latency.

## Scope (Targeted)
- Add bounded concurrency to `uploadFilesDirectInBackground` (default `3`) while keeping behavior backward compatible.
- Keep existing cleanup/error semantics and add tests for concurrency and item success callbacks.
- Remove duplicate `router.refresh()` calls in:
  - task create flow with background uploads
  - context-card create flow with background uploads

## Out of Scope
- Broad mutation architecture refactors.
- New project mutation API surface.
- Optimistic UI rewrites for project/task/context mutations.

## Acceptance Criteria
- Upload helper executes multiple files with bounded parallelism and preserves failure handling.
- Create flows no longer do immediate + final duplicate refresh when background uploads are present.
- Validation green for lint/tests/build on this branch.

## Definition of Done
- Branch + PR opened and linked to issue #70.
- Atomic commits for each change set.
- Copilot review comments addressed and resolved where valid.

---

Last Updated: 2026-03-02
Assigned To: User + Agent
