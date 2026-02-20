# Current Task: Projects Dashboard Entry Performance (Async Shell)

## Task ID
TASK-073

## Status
In Progress (2026-02-20)

## Summary
Make `/projects` feel immediate by rendering shell content instantly and streaming project list content asynchronously with loading placeholders.

## Acceptance Criteria
- `/projects` page renders core shell immediately (title, actions, status/error banners) while project grid is loaded asynchronously.
- Project list rendering is streamed behind a visible skeleton fallback instead of blocking full page content.
- Existing server actions (`createProjectAction`, `updateProjectAction`, `deleteProjectAction`) remain intact and functional.
- Navigation affordances remain responsive without forcing aggressive dynamic prefetching.
- No behavior regression for empty project state or existing project edit/delete forms.

## Definition of Done
- `npm run lint` passes.
- `npm test` passes.
- `npm run test:coverage` passes.
- `npm run build` passes.
- Branch pushed and PR opened.
- PR checks pass on GitHub.
- Copilot review triaged/resolved (apply valid findings, challenge non-actionable findings).
- `tasks/backlog.md` and `tasks/current.md` remain aligned with TASK-073 progress.
- Manual smoke validated in local/dev: landing page → projects route loads shell immediately; project cards appear asynchronously.

## Required Input
No blocking input expected for implementation.

## Next Step
Implement streamed project list shell, validate non-regression, open PR, triage Copilot comments.

---

Last Updated: 2026-02-20  
Assigned To: User + Agent
