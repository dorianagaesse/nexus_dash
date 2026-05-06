# Current Task: TASK-217 Mention Notification Open Route

## Task ID
TASK-217

## Status
Validation green for GitHub issue #217 on branch `fix/task-217-mention-notification-open`.

## Objective
Fix the `Open` action for task comment mention notifications so recipients land on the relevant project dashboard task context instead of a 404 route.

## Scope
- Generate task comment mention notification targets using an app route that exists.
- Open the referenced task from the project dashboard when a notification target includes a task id.
- Preserve compatibility for existing mention notifications that already store the stale nested task path.
- Keep other notification types and invitation actions unchanged.

## Acceptance Criteria
1. Clicking `Open` on a task comment mention notification no longer lands on a 404.
2. Mention notification targets route to the relevant project dashboard and open the mentioned task when it is present in the board data.
3. Existing stale mention notification paths of the form `/projects/:projectId/tasks/:taskId` are handled when reasonably possible.
4. Project invitation notifications and other existing notification actions keep their current behavior.
5. Focused regression coverage proves the generated mention target and stale-path compatibility behavior.
6. Required lint, test, coverage, and build checks pass or any environment blocker is recorded in `journal.md`.

## Definition Of Done
- The root cause is fixed at mention notification target generation rather than only in notification list rendering.
- The project dashboard supports opening the task modal from the canonical mention target.
- Existing stale mention paths redirect to the canonical project task target.
- Relevant tests are updated.
- `journal.md` records implementation and validation evidence.
- A PR is opened for issue #217 from `fix/task-217-mention-notification-open`.
