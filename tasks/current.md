# Current Task: Mutation Responsiveness Pass (Create/Save UX)

## Task ID
TASK-072

## Status
In Progress (2026-02-20)

## Summary
Reduce perceived blocking waits on create/save interactions by moving non-critical refresh/revalidation to background flow and surfacing explicit progress/error feedback while users keep interacting.

## Acceptance Criteria
- Task create flow no longer forces modal-open wait for server completion; request runs in background with explicit status feedback.
- Context-card create/update flows no longer block the user in modal while awaiting server response; background status is visible in panel header.
- Task edit save exits edit mode quickly and completes persistence in background with clear success/failure feedback.
- Existing API contracts remain unchanged and error mapping remains user-readable.
- Non-critical `router.refresh()` calls are deferred to background scheduling after optimistic UI transition.

## Definition of Done
- `npm run lint` passes.
- `npm test` passes.
- `npm run test:coverage` passes.
- `npm run build` passes.
- Branch pushed and PR opened.
- PR checks pass on GitHub.
- Copilot review triaged/resolved (apply valid findings, challenge non-actionable findings).
- `tasks/backlog.md` and `tasks/current.md` remain aligned with TASK-072 progress.
- Manual smoke validated in local/dev: create task, save task edits, create context-card, save context-card.

## Required Input
No blocking input expected for implementation.

## Next Step
Implement non-blocking create/save UX pass, run full validation, open PR, triage Copilot comments.

---

Last Updated: 2026-02-20  
Assigned To: User + Agent
