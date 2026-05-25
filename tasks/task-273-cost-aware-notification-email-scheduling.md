# TASK-273 Cost-Aware Notification Email Scheduling

Date: 2026-05-22
Branch: `feature/task-273-notification-email-scheduling-strategy`

Implementation branch: `feature/task-273-cost-aware-scheduler-review`

## Summary

Improve NexusDash notification email scheduling so delivery is closer to common
production behavior while respecting the current cost constraint.

The app already has the hard parts of a sane notification email system:
durable notification records, durable email groups, idempotency, delivery
status, debounce windows, and a protected dispatcher. The weak part is the
temporary scheduler bridge: GitHub Actions invokes the dispatcher every 3
hours, so emails tend to arrive in coarse, predictable waves rather than close
to each group's intended `sendAfterAt`.

## Product Problem

Users expect notification emails to feel timely but not spammy:

- mentions and assignments should not wait several hours once the quiet window
  expires;
- due-date reminders should arrive on the intended day in a predictable
  user-friendly window;
- grouped digests should preserve batching/debounce behavior but should not be
  hostage to a 3-hour polling interval;
- delivery should remain idempotent, observable, and safe under retries.

The current 3-hour bridge is acceptable as an early-production compromise, but
it does not feel like the industry norm for app notifications.

## Selected Implementation

The first implementation phase keeps GitHub Actions as the no-new-cost trigger
and reduces the production schedule to every 30 minutes. This is the
conservative path because it materially reduces batching without introducing a
new provider, paid Vercel plan, or queue-worker platform.

The app-owned durable email queue remains the source of truth. The scheduler
only decides when to call `GET /api/cron/notification-emails`; grouping,
deduplication, due-date reconciliation, dispatch claims, and outbound delivery
records stay in the application.

Dispatcher summaries now include scheduler-lag metrics for claimed groups so
operators can compare actual claim time with each group's `sendAfterAt`.

## Current Baseline

- `Notification` stores durable in-app activity.
- `ProjectNotificationEmail` and `ProjectNotificationEmailItem` store durable
  grouped email work.
- `OutboundEmailDelivery` records provider delivery attempts.
- `GET /api/cron/notification-emails` reconciles and dispatches due groups.
- Before TASK-273 implementation, GitHub Actions called that endpoint every 3
  hours.
- TASK-271 prevents already-sent notification IDs from being emailed again.
- TASK-226 creates due-date reminder notifications and queues them into the
  shared project notification digest pipeline.

## Industry Baseline

Typical production notification email systems separate three concerns:

1. **Event persistence:** write an activity/notification row immediately when
   a mention, assignment, invite, or reminder candidate is created.
2. **Delivery scheduling:** store when the email is allowed to send
   (`sendAfterAt`, digest window, local-time preference, retry-after, etc.).
3. **Worker dispatch:** run a queue worker or frequent scheduler that claims
   due work, sends through the provider, records delivery state, and retries
   safely.

For NexusDash, the app-owned durable queue already exists. The missing piece is
a low-latency, cost-aware worker cadence.

## Target Latency Policy

Use latency goals by email kind instead of one global cadence:

- **Project activity digests**: send 0-15 minutes after the quiet window or
  max-delay window expires.
- **Task assignment / mention emails**: use the project activity digest path,
  but keep the total expected delay under 45 minutes in normal conditions.
- **Task due-date reminders**: reconcile daily eligibility early enough that
  reminders arrive on the intended local calendar day; exact minute is less
  critical than reliability and deduplication.
- **Project invitation reminders**: delayed reminder semantics are acceptable;
  delivery can be less urgent than mentions/assignments.
- **Transactional auth/account emails**: remain immediate through the existing
  outbound email service and are not governed by this scheduler.

## Cost-Aware Options To Evaluate

### Option A: Tighten GitHub Actions Cadence

Run the existing scheduler workflow every 15 or 30 minutes.

Pros:
- no new provider setup;
- no direct new platform cost;
- keeps current protected endpoint and app-owned queue;
- fastest path to better UX.

Cons:
- GitHub scheduled workflows are not a hard real-time worker;
- runs can be delayed, skipped during incidents, or disabled if the repository
  becomes inactive;
- still creates visible batch boundaries, though much smaller than 3 hours;
- not ideal as the long-term production worker if usage grows.

Recommended use:
- near-term default under the current cost constraint, if GitHub Actions usage
  remains within acceptable limits.

### Option B: QStash / Managed HTTP Scheduler

Use a managed scheduler to call the existing protected dispatcher more
frequently, or schedule individual work items.

Pros:
- closer to app-notification industry practice;
- retries and scheduling semantics are provider-owned;
- can often start at low/no cost depending on current pricing and volume;
- does not require moving off the existing Vercel Hobby app immediately.

Cons:
- previous activation had operational friction;
- pricing and limits must be rechecked at implementation time;
- secrets, retries, and failure visibility need runbook coverage.

Recommended use:
- preferred long-term low-cost direction if setup friction is resolved and
  pricing fits.

### Option C: Vercel Pro Cron

Upgrade Vercel and run cron more frequently from the deployment platform.

Pros:
- operationally simple with the current hosting stack;
- centralizes app deployment and scheduled execution;
- less external glue.

Cons:
- forces a recurring platform upgrade mostly for scheduler cadence;
- still cron-based rather than a true queue unless paired with app-owned
  claiming, which NexusDash already has.

Recommended use:
- reasonable once the app already needs Vercel Pro for multiple reasons; do not
  choose it solely for this feature under the current cost constraint.

### Option D: Cloud / Queue Worker

Use a cloud-native queue/scheduler such as Cloud Tasks, EventBridge Scheduler,
SQS, or a similar worker model.

Pros:
- closest to mature production architecture;
- strong retry/dead-letter/visibility options;
- can scale beyond simple cron.

Cons:
- much more operational surface;
- more secrets, IAM, deployment, and monitoring work;
- likely premature for the current project stage.

Recommended use:
- defer until NexusDash needs broader background-job infrastructure.

## Recommended Path

Implement this in phases:

1. **Near-term no-new-cost improvement**
   - Reduce GitHub Actions notification scheduler cadence from 3 hours to 30
     minutes, or 15 minutes if workflow usage remains reasonable.
   - Keep the protected endpoint and durable queue unchanged.
   - Add clear workflow summaries showing claimed groups, emails sent/skipped,
     reminder reconciliation count, and errors.
   - Add a smoke command/runbook for manually invoking the dispatcher after
     creating mention/assignment/due-date smoke data.

2. **Latency and observability hardening**
   - Track scheduler lag: `now - sendAfterAt` for claimed groups.
   - Log/alert when lag exceeds the target, for example 60 minutes for project
     activity emails.
   - Make dispatch summaries easy to inspect from GitHub Actions and server
     logs.
   - Ensure the dispatcher remains idempotent under overlapping invocations.

3. **Managed scheduler decision point**
   - Recheck pricing/limits for QStash, Vercel Cron, and any candidate
     low-cost scheduler.
   - Choose a managed path only if 15-30 minute GitHub Actions cadence is still
     too coarse or unreliable.
   - Preserve the existing app-owned queue and protected dispatcher so provider
     migration changes the trigger, not the delivery semantics.

## Implementation Guidance

- Keep persistence access in `lib/services/**`.
- Keep `/api/cron/notification-emails` as a thin adapter.
- Do not send emails directly from task/comment mutation routes.
- Do not mark in-app notifications read/resolved after email delivery.
- Preserve durable idempotency on:
  - notification source identity;
  - email group source/grouping keys;
  - sent notification ID coverage;
  - provider delivery records.
- If cadence changes through GitHub Actions, update:
  - `.github/workflows/notification-email-dispatch.yml`;
  - `README.md`;
  - `docs/runbooks/vercel-env-contract-and-secrets.md`;
  - `journal.md`.
- If a managed scheduler is selected, add or update a runbook covering:
  - secret setup;
  - retry behavior;
  - manual dispatch;
  - failure diagnostics;
  - smoke validation;
  - rollback to the GitHub Actions bridge.

## Acceptance Criteria

1. A cost-aware scheduler option is selected with explicit rationale.
2. Normal project activity emails are dispatched within the selected target
   latency after their quiet/max-delay window expires.
3. Due-date reminders still create exactly one reminder per task, recipient,
   and deadline window.
4. Duplicate email suppression from TASK-271 remains intact.
5. Dispatcher summaries expose enough evidence to diagnose scheduler lag.
6. Production smoke covers:
   - task assignment from an agent;
   - task mention from an agent;
   - task due in exactly three days;
   - repeated dispatcher invocation without duplicate sends.
7. Documentation explains the active scheduler cadence and its cost/latency
   tradeoff.

## Definition Of Done

- Scheduler cadence or provider trigger is updated according to the chosen
  path.
- Relevant runbooks and README scheduler text are updated.
- Local tests covering notification email dispatch still pass.
- Workflow or provider-level smoke evidence is recorded.
- The final handoff states the expected email latency and known residual
  limitations.

## Validation Plan

- `git diff --check`
- Focused notification email service/route tests.
- `npm run lint`
- `npm test`
- `npm run build`
- Production or preview smoke against a test project, depending on the chosen
  scheduler path.

## Out Of Scope

- Replacing Resend as the outbound provider.
- User notification preference UI.
- Bounce/suppression webhook handling, unless selected provider behavior
  requires a minimal compatibility change.
- Realtime in-app notification delivery.
- A broad background-job platform rewrite.
