# Current Task: TASK-273 Cost-Aware Notification Email Scheduling

## Task ID
TASK-273

## Status
Active

## Source
- Production smoke and follow-up discussion after TASK-226/TASK-265 email
  validation.
- User concern: the current GitHub Actions scheduler sends notification emails
  only when the workflow runs, currently every 3 hours, so delivery feels
  coarse and predictably batched compared with common production systems.
- Dedicated brief:
  `tasks/task-273-cost-aware-notification-email-scheduling.md`.

## Objective
Create an implementation-ready plan for improving notification email delivery
cadence while respecting cost constraints. The target is an industry-aligned
model where durable notification/email records keep their app-owned idempotency,
but dispatch runs close to each item's intended `sendAfterAt` rather than only
on a coarse 3-hour bridge.

## Current Baseline
- TASK-125 provides durable outbound email delivery records.
- TASK-227/TASK-271 provide durable notification email grouping, idempotency,
  debounce windows, and duplicate suppression.
- TASK-268 intentionally chose a no-new-cost GitHub Actions scheduler bridge
  every 3 hours while Vercel remained on Hobby and QStash activation had
  operational friction.
- TASK-226 now creates due-date reminder notifications and queues them into
  the shared email orchestration.

## Scope
- Compare low/no-cost and low-friction scheduler options.
- Define target latency by notification kind.
- Decide a near-term scheduler cadence that improves UX without forcing a paid
  platform upgrade.
- Preserve the existing durable email queue, idempotency, delivery records, and
  app-owned dispatch endpoint.
- Add implementation guidance for observability, smoke validation, and future
  migration to a managed scheduler/queue.

## Acceptance Criteria
1. A dedicated task brief captures current behavior, pain points, industry
   baseline, cost-aware options, recommendation, and implementation phases.
2. The backlog places TASK-273 in the execution queue with correct
   dependencies.
3. `journal.md` records why the task was created and how it relates to recent
   production smoke/TASK-226 work.
4. `adr/decisions.md` records the proposed architectural direction without
   committing to a paid provider prematurely.
5. The task can be implemented later without re-discovering the scheduler
   tradeoffs.

## Definition Of Done
- Planning docs are committed on a dedicated branch and opened in a PR.
- No production behavior is changed in this task.
- Validation confirms the markdown/docs-only change is structurally clean.

## Validation Plan
- `git diff --check`
- `git status --short`

## Out Of Scope
- Changing scheduler cadence in this PR.
- Buying or configuring a paid scheduler/provider.
- Implementing notification preferences, unsubscribe controls, bounce webhooks,
  or realtime in-app updates.
