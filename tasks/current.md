# Current Task: TASK-264 Notification Backlog Cleanup

## Task ID
TASK-264

## Status
In progress on dedicated worktree `../nexus_dash_task264` and branch
`feature/task-264-notification-backlog-cleanup`.

## Source
- Post-smoke planning after PR #262 and PR #263 merged.
- User feedback: `TASK-228` was hard to see from the active checkout, and the
  backlog should make the next notification path explicit.
- Production smoke result: grouped notification email delivery works when the
  dispatcher runs, but QStash/managed scheduler activation is not live.

## Objective
Clean the backlog so `main` clearly shows the next notification/email work:
QStash scheduler activation, notification actor attribution/self-notification
rules, due-date reminder sequencing, and the production `pg@9` deprecation
warning follow-up.

## Acceptance Criteria
1. Completed notification/deployment tasks are moved out of the active
   execution queue.
2. `TASK-228` is visible as the next scheduler activation task.
3. A new task captures notification actor attribution and self-notification
   rules.
4. The due-date reminder task is sequenced after scheduler activation.
5. The production `pg@9` warning observed during smoke validation is tracked.

## Definition Of Done
- `tasks/backlog.md`, `tasks/current.md`, and `journal.md` are updated.
- Validation is limited to Markdown/task consistency because this is a
  docs-only cleanup.
- A ready-for-review PR is opened and checks/Copilot review are monitored.

## Validation Plan
- `git diff --check`
- Review changed Markdown for duplicate task IDs and execution queue order.

## Out Of Scope
- Implementing QStash.
- Changing notification/email runtime behavior.
- Fixing `pg@9` deprecation warnings.
