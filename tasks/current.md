# Current Task: TASK-268 GitHub Actions Notification Email Scheduler

## Task ID
TASK-268

## Status
In progress on dedicated worktree `../nexus_dash_task268` and branch
`feature/task-268-github-actions-notification-email-scheduler`.

## Source
- User decision on 2026-05-19 to abandon QStash for now because the account and
  token setup created too much operational friction.
- Vercel remains on Hobby, so Vercel Cron cannot provide sub-day cadence.
- Existing notification email dispatcher is durable, protected, idempotent, and
  already production-smoked through manual invocation.

## Objective
Replace the pending QStash scheduler path with a clean GitHub Actions scheduled
dispatch bridge that invokes the production notification email dispatcher every
3 hours and documents the delivery caveat honestly.

## Acceptance Criteria
1. `.github/workflows/notification-email-dispatch.yml` has a scheduled trigger
   running every 3 hours and retains manual dispatch.
2. Scheduled runs default to `https://nexus-dash.app`; manual runs can override
   the target URL.
3. The workflow uses the existing protected header and does not log secret
   values.
4. `tasks/backlog.md` replaces active TASK-228 QStash work with TASK-268 and
   keeps TASK-226 sequenced after scheduler activation.
5. README, project docs, runbook, task briefs, and journal reflect GitHub
   Actions as the accepted temporary production scheduler bridge.
6. The documentation clearly states that the 3-hour cadence does not satisfy the
   original one-hour maximum-delay goal.

## Definition Of Done
- Work remains focused on scheduler workflow and documentation cleanup.
- The branch is pushed and a PR is opened for review.
- Validation confirms workflow/docs consistency.
- Copilot review and checks are monitored.

## Validation Plan
- `git diff --check`
- Review `.github/workflows/notification-email-dispatch.yml` trigger, default
  target, secret handling, and manual override behavior.
- Review changed Markdown for stale active QStash instructions.
- Let GitHub PR checks run.

## Out Of Scope
- Implementing QStash.
- Changing notification grouping/debounce runtime behavior.
- Implementing actor attribution behavior.
- Implementing due-date reminders.
