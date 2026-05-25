# Current Task: TASK-273 Cost-Aware Notification Email Scheduling

## Task ID
TASK-273

## Status
Done (PR #288)

## Source
- Production smoke and follow-up discussion after TASK-226/TASK-265 email
  validation.
- Strategy brief merged via PR #280:
  `tasks/task-273-cost-aware-notification-email-scheduling.md`.
- User direction on 2026-05-25: proceed with the conservative no-new-cost path
  without further discussion.

## Objective
Improve notification email delivery cadence while preserving the app-owned
durable queue, idempotent dispatcher, and current cost posture.

The selected near-term implementation is a GitHub Actions cadence reduction
from the previous 3-hour bridge to every 30 minutes, plus scheduler-lag
evidence in the dispatcher summary and workflow output. This should make
activity emails arrive closer to each group's intended `sendAfterAt` without
introducing QStash, Vercel Pro Cron, or a broader queue worker yet.

## Current Baseline
- TASK-125 provides durable outbound email delivery records.
- TASK-227/TASK-271 provide durable notification email grouping, idempotency,
  debounce windows, and duplicate suppression.
- TASK-268 intentionally chose a no-new-cost GitHub Actions scheduler bridge
  every 3 hours while Vercel remained on Hobby and QStash activation had
  operational friction; TASK-273 now tightens that bridge to 30 minutes.
- TASK-226 creates due-date reminder notifications and queues them into the
  shared email orchestration.
- TASK-273 PR #280 selected the cost-aware improvement path; this branch
  implements the first phase.
- PR #288 delivered the 30-minute scheduler bridge and scheduler-lag summary
  evidence.

## Scope
- Change `.github/workflows/notification-email-dispatch.yml` to run the
  protected dispatcher every 30 minutes.
- Keep scheduled runs targeting `https://nexus-dash.app`; keep manual
  `target_url` override behavior for previews and diagnostics.
- Add scheduler-lag fields to the dispatcher summary for claimed due groups.
- Make the GitHub Actions step summary show parsed dispatch metrics in addition
  to the raw endpoint response.
- Update README/runbooks/task docs so the active cadence, expected latency, and
  residual limitations are accurate.

## Acceptance Criteria
1. The selected scheduler path is explicit: 30-minute GitHub Actions cadence,
   no new paid provider, app-owned queue unchanged.
2. Normal project activity emails are expected within the 30-minute quiet
   window plus at most one 30-minute scheduler cadence and GitHub scheduling
   delay under normal conditions.
3. Due-date reminder reconciliation remains in the protected dispatcher and
   still preserves one reminder per task, recipient, and deadline date.
4. Duplicate email suppression from TASK-271 remains unchanged.
5. Dispatcher summaries expose scheduler-lag evidence for claimed groups.
6. Workflow summaries expose enough parsed metrics to inspect reconciliation,
   claim/send outcomes, errors, and scheduler lag without reading raw JSON.
7. Documentation explains the active cadence, cost/latency tradeoff, manual
   smoke path, and future managed-scheduler decision point.

## Definition Of Done
- Scheduler cadence is updated to 30 minutes. Done in PR #288.
- Dispatcher summary includes scheduler-lag metrics and tests cover them. Done
  in PR #288.
- Relevant README/runbook/task tracking docs are updated. Done in PR #288.
- Local focused notification email tests, lint, full tests/coverage, and build
  pass or any blockers are recorded. Done in `journal.md`.
- The branch is pushed, a ready PR is opened, and Copilot/check feedback is
  monitored according to `agent.md`. Done for PR #288.

## Validation Plan
- `git diff --check`
- `npm test -- --run tests/lib/project-notification-email-service.test.ts tests/api/notification-email-dispatch.route.test.ts`
- `npm run lint`
- `npm test`
- `npm run test:coverage`
- `npm run build`

## Out Of Scope
- Replacing Resend as the outbound provider.
- Buying or configuring a paid scheduler/provider.
- User notification preference UI.
- Bounce/suppression webhook handling.
- Realtime in-app notification delivery.
- A broad background-job platform rewrite.
