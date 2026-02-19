# Current Task: Smooth Upload/Creation UX (Non-Blocking)

## Task ID
TASK-071

## Status
In Progress (2026-02-19)

## Summary
Make task creation and attachment upload feel instant/smooth by removing blocking waits from the create flow and running R2 file transfers in background while preserving reliability and clear error feedback.

## Acceptance Criteria
- Task creation no longer blocks on R2 file transfer; task can be created first, then files upload in background.
- During background upload, UI remains usable (no full-screen freeze / no modal lock-up).
- Success/failure feedback is explicit for background uploads (including partial failure scenarios).
- Existing create-task validation and API contracts remain stable.
- Existing edit-mode attachment upload flow remains correct and non-regressive.
- Confirm deployed production alias (`nexus-dash-wheat.vercel.app`) points to latest deployment.

## Definition of Done
- `npm run lint` passes.
- `npm test` passes.
- `npm run test:coverage` passes.
- `npm run build` passes.
- Branch pushed and PR opened.
- PR checks pass on GitHub.
- Copilot review triaged/resolved (apply valid findings, challenge non-actionable findings).
- Deployment validation monitored after merge trigger (staged/prod workflow status checked).
- `tasks/backlog.md` and `tasks/current.md` remain aligned with TASK-071 progress.

## Required Input
No blocking input expected for implementation.

## Next Step
Implement non-blocking create-task + background R2 upload orchestration, then validate local and deployed behavior.

---

Last Updated: 2026-02-19  
Assigned To: User + Agent
