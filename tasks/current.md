# Current Task: TASK-267 Notification Task Briefs

## Task ID
TASK-267

## Status
In progress on dedicated worktree `../nexus_dash_task267` and branch
`docs/task-267-notification-task-briefs`.

## Source
- User request to draft dedicated task `.md` briefs for TASK-228, TASK-265, and
  TASK-226 so a future agent session can take over cleanly.
- Existing backlog sequence after PR #264: scheduler activation first, actor
  attribution/self-notification next, then due-date reminders after scheduler
  activation.

## Objective
Create dedicated task handoff documents for the next notification/email work:
QStash scheduler activation, notification actor attribution and
self-notification rules, and task due-date email reminders.

## Acceptance Criteria
1. `tasks/task-228-qstash-notification-email-scheduler-activation.md` captures
   scheduler intent, endpoint contract, acceptance criteria, and smoke plan.
2. `tasks/task-265-notification-actor-attribution-and-self-notification-rules.md`
   captures actor attribution and self-notification behavior in enough detail
   for implementation.
3. `tasks/task-226-task-due-date-email-reminders.md` captures due-date reminder
   product rules, sequencing after scheduler activation, and validation plan.
4. `tasks/backlog.md` links each backlog item to its dedicated task brief.
5. `journal.md` records the documentation handoff.

## Definition Of Done
- Work remains documentation-only.
- The branch is pushed and a PR is opened for review.
- Validation confirms Markdown/task consistency.
- Copilot review and checks are monitored.

## Validation Plan
- `git diff --check`
- Review the three task files for actionable startup context, acceptance
  criteria, validation plans, and explicit out-of-scope boundaries.
- Review `tasks/backlog.md` links to the new briefs.

## Out Of Scope
- Implementing QStash.
- Changing notification/email runtime behavior.
- Implementing actor attribution behavior.
- Implementing due-date reminders.
