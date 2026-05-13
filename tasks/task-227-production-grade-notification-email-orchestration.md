# TASK-227 Production-Grade Notification Email Orchestration

Date: 2026-05-13
Branch: `feature/task-227-production-grade-notification-email-orchestration`

## Summary

Refactor the email notification dispatch introduced around TASK-225 into a
production-grade delivery architecture. The product goal is not "run a 30-minute
cron"; the product goal is that users receive useful email notifications about
project activity without being spammed when they are mentioned, assigned, or
invited across many projects in a short period.

The next agent should treat this as the production version of project
notification email delivery. The implementation should keep the in-app
notification center as the source of truth, group email content by project,
debounce clustered activity, enforce a maximum delay before a user hears about
new activity, and use an app/runtime-appropriate scheduler instead of GitHub
Actions as the primary production mechanism.

## Context

- TASK-123 shipped the in-app notification center.
- TASK-124 and later work added task comment mention notifications.
- TASK-125 shipped the reusable outbound email foundation through Resend.
- TASK-225 added project notification email digest work in PR #246.
- After PR #246 was merged, production GitHub Actions notification dispatches
  failed because the workflow/runtime configuration was incomplete.
- PR #252 was opened as a remediation for the GitHub Actions dispatch path. It
  fixed real issues, but GitHub Actions remains a workaround-level scheduler for
  this app-owned production feature.
- The user also ran notification email dispatch on the `fix/task-225` branch and
  reported that it failed. The next agent should inspect the current PR/run logs
  if using any of that branch's work, but should not assume GitHub Actions is the
  final architecture.

## Product Requirement

Users should receive emails for important project activity, including:

- project invitations and delayed invitation reminders
- task comment mentions
- task assignments
- future project notification sources that produce durable in-app notifications

Users should not receive one email per raw event. NexusDash is expected to be
used across many projects, and agents can generate bursts of comments,
assignments, or mentions. The email layer must therefore group related
notifications and avoid email storms.

The user's current preferred behavior is:

- when a notification becomes email-eligible, start a quiet timer for that
  recipient/project activity group
- if another notification arrives for the same recipient/project group while the
  timer is open, reset or extend the timer
- never delay the first unsent notification in the group by more than about one
  hour
- email content should be grouped by project so the user can scan what changed

This is an implementation direction, not a hard requirement to create literal
per-user timers or to run cron every 30 minutes. A database-backed debounce queue
plus frequent scheduler is acceptable and preferred.

## Recommended Architecture

Use a durable notification-email queue/state model owned by the app.

Recommended grouping key:

- `recipientUserId`
- `projectId`
- delivery kind, for example `project_activity_digest` or
  `project_invitation_reminder`

Recommended debounce fields:

- `firstPendingNotificationAt`
- `latestPendingNotificationAt`
- `sendAfterAt`
- `maxSendAt`
- status such as `pending`, `dispatching`, `sent`, `failed`, `superseded`
- source notification ids or a join table for exact idempotency
- outbound email delivery id when a send is attempted

Recommended send-time calculation for normal project activity:

```text
quiet_window = configurable value, for example 20 or 30 minutes
max_delay = configurable value, default 1 hour

firstPendingNotificationAt = first unsent event in group
latestPendingNotificationAt = latest unsent event in group
sendAfterAt = min(latestPendingNotificationAt + quiet_window,
                  firstPendingNotificationAt + max_delay)
maxSendAt = firstPendingNotificationAt + max_delay
```

This preserves the user's timer idea while ensuring the user hears about new
activity within the maximum delay. The scheduler can run more frequently than
the quiet window; scheduler frequency is not the user-facing cadence.

Recommended email shape:

- Prefer one email per recipient per due dispatch batch with project sections,
  rather than one separate email per project, when multiple project groups are
  due together. This is the safest default for users involved in dozens of
  projects.
- Each project section should summarize the grouped notifications and link to
  the relevant project/task/notification targets.
- Collapse repetitive activity from the same actor/task/type into concise lines.
- Do not mark notifications as read or resolved when email is sent.

Recommended scheduler:

- Prefer Vercel Cron or another production scheduler aligned with the app's
  hosting/runtime standards.
- Do not use GitHub Actions as the primary production scheduler unless the task
  brief is explicitly changed with a durable operational rationale.
- If Vercel Cron is used, document that cron invocations run on production
  deployments, while preview validation must manually invoke the protected
  endpoint or service path.
- If the Vercel plan cannot support the needed frequency, record the blocker and
  choose an app-appropriate production alternative such as a managed scheduled
  job, durable queue/workflow runner, or Vercel plan/configuration change.

## Scope

- Audit the current TASK-225/PR #246 implementation and PR #252 remediation
  before deciding what to keep, rewrite, or remove.
- Replace the GitHub Actions primary dispatch path with a production-grade
  app-owned scheduling/dispatch architecture.
- Add or revise durable persistence for notification email grouping, debounce,
  idempotency, dispatch status, and provider attempt correlation.
- Implement service-layer logic for ingesting email-eligible notifications into
  pending groups when notifications are created or refreshed.
- Implement a dispatcher that claims due groups safely, builds grouped email
  content, sends through the TASK-125 outbound email service, and records sent,
  skipped, and failed outcomes.
- Implement the anti-spam behavior:
  - debounce clustered activity for the same recipient/project
  - cap delay at approximately one hour from the first unsent activity in that
    group
  - avoid duplicate sends when the dispatcher runs repeatedly or concurrently
- Implement project invitation reminder behavior:
  - if a verified user has not opened, accepted, declined, or otherwise resolved
    the invitation within 6 hours, send one reminder email
  - keep initial project invitation email delivery itself aligned with TASK-104
    if TASK-104 is still separate when this task starts
- Keep task due-date reminder production in TASK-226. This task may introduce a
  shared queue/orchestration primitive that TASK-226 can reuse, but it should
  not implement due-date reminder business rules unless TASK-226 has already
  been merged and the scope is intentionally combined.
- Add or update the protected dispatch endpoint only if needed for the selected
  scheduler. Keep routes thin and secrets in `lib/env.server.ts`.
- Update README/runbooks/journal/current task docs with the final architecture,
  env contract, scheduler behavior, preview/prod validation steps, and any plan
  requirements.

## Out Of Scope

- TASK-226 task due-date reminder business logic unless TASK-226 is already
  complete and the current task explicitly opts into integration.
- User-facing notification preference UI, unsubscribe preferences, digest
  frequency settings, bounce webhook processing, or suppression-list UX.
- Marking in-app notifications read/resolved as a side effect of email sending.
- A broad background job framework unrelated to notification email dispatch.
- Continuing to patch GitHub Actions as the long-term production scheduler.

## Acceptance Criteria

1. The implementation has a clear production scheduler strategy that is not
   primarily GitHub Actions.
2. The scheduler/dispatcher can be validated manually on preview and runs in the
   intended production path after deployment.
3. Durable persistence tracks pending notification email groups, debounce
   windows, maximum send deadlines, dispatch attempts, statuses, and source
   notification membership or equivalent idempotency keys.
4. New or refreshed email-eligible notifications update the correct
   recipient/project pending group without sending immediately.
5. Normal project activity emails are delayed until the group has been quiet long
   enough, but no later than approximately one hour after the first unsent event
   in that group.
6. Multiple due project groups for the same recipient can be sent in one email
   with project sections, or the implementation documents and justifies an
   alternative that still avoids cross-project email storms.
7. Email content is deterministic, safely escaped, and concise enough for bursts
   of agent-generated activity.
8. Dispatch is idempotent under repeated scheduler calls and safe under
   concurrent invocations.
9. Provider success, skip, and failure outcomes are recorded through the
   outbound email foundation without logging secrets.
10. Invitation reminders send only after 6 hours of no user action and only once
    per invitation/recipient reminder window.
11. TASK-226 remains a separate due-date reminder task unless its implementation
    already exists and this task intentionally integrates with it.
12. Tests cover debounce timing, maximum delay, grouping by project, multi-project
    recipient batching, idempotency, concurrent claim behavior, invitation
    reminders, provider failure, and dispatch authorization if an HTTP endpoint
    remains.
13. Documentation explains local, preview, and production validation. It must
    explicitly state whether the scheduler runs on preview or only production.
14. A real preview or production smoke plan is recorded for
    `dorian.agaesse@gmail.com` without committing or printing secrets.

## Definition Of Done

- Work starts from latest `origin/main` on a dedicated branch/worktree following
  `agent.md`: `feature/task-227-production-grade-notification-email-orchestration`.
- `tasks/current.md` is rewritten for TASK-227 before implementation begins.
- Persistence access stays inside `lib/services/**`; routes and cron endpoints
  remain thin transport adapters.
- Runtime config and secrets flow through `lib/env.server.ts` and documented env
  examples/runbooks.
- GitHub Actions notification dispatch is removed or demoted to a documented
  manual/diagnostic path, not the production scheduler.
- Local validation passes at minimum:
  - `npm run lint`
  - `npm test`
  - `npm run test:coverage`
  - `npm run build`
- Add focused tests for notification email orchestration and name them in the
  validation evidence.
- If UI-visible notification behavior changes, run relevant Playwright coverage.
- If preview validation is required, trigger the Vercel preview workflow with
  the active branch as `git_ref`, verify the logs checked out that ref, and run
  the documented smoke against the preview URL.
- Open a PR ready for review, monitor CI, handle Copilot review threads per
  `agent.md`, and include final commit SHA or SHAs in the handoff.

## Implementation Notes For The Next Agent

- Start by reading:
  - `agent.md`
  - `tasks/current.md`
  - this file
  - `project.md`
  - `README.md`
  - `docs/runbooks/vercel-env-contract-and-secrets.md`
  - `journal.md` entries around TASK-125, TASK-225, PR #246, and PR #252
- Inspect PR #246 and PR #252 before implementation. Keep useful tests or
  service code, but do not preserve GitHub Actions scheduling merely because it
  exists.
- Treat the reported `fix/task-225` workflow failure as a signal to verify the
  current dispatch path from logs before deleting or replacing it.
- Be explicit in the PR description about whether the production scheduler is
  Vercel Cron, another managed scheduler, or a queue/workflow mechanism.
- If using Vercel Cron, confirm the current Vercel plan supports the selected
  frequency. The product requirement is the maximum user notification delay,
  not a specific cron interval.
- Prefer recipient-level emails with project sections unless user/product review
  chooses one email per project. Recipient-level batching is more aligned with
  the anti-spam goal for users in many projects.

## Open Product Decisions

These should be confirmed only if implementation evidence makes the default
unsafe. Otherwise use the recommended defaults above.

- Should the first production version send one recipient-level email containing
  several project sections when multiple projects are due at the same time?
  Recommended default: yes.
- What quiet window best balances "not spammy" and "timely enough"? Recommended
  default: 20 to 30 minutes, with a hard maximum delay of 1 hour.
- Should project invitation reminders be independent emails or allowed to appear
  inside a broader recipient-level notification email when due at the same time?
  Recommended default: include them as high-priority sections in the recipient
  email when possible, but keep once-per-invitation idempotency.

## Validation Evidence

Pending.
