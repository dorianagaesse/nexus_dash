# Current Task: Project Page Performance (Panel-Level Async Loading)

## Task ID
TASK-074

## Status
In Progress (2026-02-20)

## Summary
Reduce `/projects/[projectId]` time-to-interactive by keeping page shell lightweight and loading heavy panels (Kanban/context) through separate async server sections with progressive fallbacks.

## Acceptance Criteria
- `/projects/[projectId]` renders shell content (title, badges, nav, status/error banners) without waiting for full panel payload.
- Kanban and context panel data are fetched in dedicated async server sections and rendered behind visible skeleton fallbacks.
- Project not-found behavior remains correct (`notFound()`).
- Existing panel behaviors remain intact (task create/edit/move, context card CRUD, attachment actions, calendar panel visibility).
- No regression in existing API contracts and payload shapes consumed by client components.

## Definition of Done
- `npm run lint` passes.
- `npm test` passes.
- `npm run test:coverage` passes.
- `npm run build` passes.
- Branch pushed and PR opened.
- PR checks pass on GitHub.
- Copilot review triaged/resolved (apply valid findings, challenge non-actionable findings).
- `tasks/backlog.md` and `tasks/current.md` remain aligned with TASK-074 progress.
- Manual smoke validated in local/dev: project page shell appears first, then heavy panels resolve progressively without functional regression.

## Required Input
No blocking input expected for implementation.

## Next Step
Implement panel-level async section loading for project dashboard, validate non-regression, open PR, triage Copilot comments.

---

Last Updated: 2026-02-20
Assigned To: User + Agent
