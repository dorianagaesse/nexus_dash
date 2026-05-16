# TASK-228 QStash Notification Email Scheduler Activation

Date: 2026-05-16
Branch: `feature/task-228-qstash-notification-email-scheduler-activation`

## Summary

Activate a real production scheduler for notification email dispatch. TASK-227
implemented durable DB-backed notification email orchestration and the protected
HTTP dispatcher, and production smoke proved that grouped digest delivery works
when the dispatcher is invoked manually. What is still missing is an external
managed scheduler that invokes the dispatcher often enough to honor the
notification email debounce and one-hour max-delay contract.

Vercel will remain on the current plan, so do not rely on Vercel Cron for this
feature unless the plan/frequency constraint has changed. Prefer Upstash QStash
Schedules, or an equivalent managed HTTP scheduler with retries, auditability,
and operational visibility.

## Current Evidence

- Production digest smoke succeeded after manual invocation of
  `GET /api/cron/notification-emails`.
- Immediate dispatch after creating notifications correctly returned no sends
  because the debounce window was not due.
- A later manual dispatch sent one grouped recipient email containing multiple
  notification items.
- A repeat manual dispatch sent nothing, proving idempotency for the tested
  batch.
- QStash is not currently live: no configured scheduler was observed, and due
  email groups did not send automatically during smoke.

## Product Intent

Users should receive useful email notifications without email spam:

- The in-app notification center remains the source of truth.
- Email dispatch groups due project notification groups by recipient.
- Normal project activity uses debounce semantics:
  - wait for the group to become quiet
  - do not delay the first unsent activity by more than about one hour
- Project invitation reminders fire once when a verified invitee has not
  opened, accepted, or declined within the reminder window.
- Scheduler cadence should be frequent enough that the email service, not the
  scheduler, owns the user-facing quiet-window timing.

## Existing Endpoint Contract

The app already exposes:

```text
GET /api/cron/notification-emails
```

Production URL:

```text
https://nexus-dash.app/api/cron/notification-emails
```

Accepted auth headers:

```text
x-notification-email-dispatch-secret: <NOTIFICATION_EMAIL_DISPATCH_SECRET>
```

or:

```text
Authorization: Bearer <NOTIFICATION_EMAIL_DISPATCH_SECRET>
```

The secret is resolved through `lib/env.server.ts`. Do not print, log, commit,
or paste the secret.

## Implementation Guidance

1. Confirm the endpoint still passes authorization tests and local smoke.
2. Provision an Upstash QStash Schedule, or document why an equivalent managed
   scheduler is being used instead.
3. Configure it to invoke the production endpoint every 5 minutes.
4. Send the configured dispatch secret through an HTTP header, preferably
   `x-notification-email-dispatch-secret`.
5. Enable provider retry/visibility features, but make app idempotency the
   primary duplicate-send defense.
6. Update docs with:
   - scheduler provider
   - cadence
   - target URL
   - auth header name, not value
   - ownership and rotation notes
   - how to pause/disable the schedule
   - how to inspect scheduler deliveries
7. Keep GitHub Actions dispatch as manual diagnostic tooling only, or remove it
   if it is misleading and no longer useful.

## Files To Inspect First

- `agent.md`
- `tasks/current.md`
- `tasks/backlog.md`
- `tasks/task-227-production-grade-notification-email-orchestration.md`
- `README.md`
- `docs/runbooks/vercel-env-contract-and-secrets.md`
- `app/api/cron/notification-emails/route.ts`
- `lib/env.server.ts`
- `lib/services/project-notification-email-service.ts`
- `.github/workflows/notification-email-dispatch.yml`
- `journal.md` entries for TASK-125, TASK-225, TASK-227, PR #254, PR #262,
  PR #263, and the production smoke

## Acceptance Criteria

1. Production has a managed scheduler invoking
   `GET https://nexus-dash.app/api/cron/notification-emails` every 5 minutes.
2. The scheduler uses the protected dispatch secret without exposing the value
   in code, logs, docs, GitHub comments, or screenshots.
3. Manual endpoint invocation remains possible for preview/diagnostic smoke.
4. GitHub Actions is not the primary production scheduler.
5. A due notification email group sends automatically without manual endpoint
   invocation.
6. Repeated scheduler calls do not produce duplicate emails.
7. Scheduler delivery failures are observable through the chosen provider.
8. README, runbook, `journal.md`, `tasks/backlog.md`, and `tasks/current.md`
   reflect the final operational contract.

## Validation Plan

Local and CI:

- `npm run lint`
- `npm test`
- `npm run test:coverage`
- `npm run build`

Focused:

- `npm test -- --run tests/api/notification-email-dispatch.route.test.ts`
- `npm test -- --run tests/lib/project-notification-email-service.test.ts`

Production smoke:

1. Create one or more email-eligible notifications for
   `dorian.agaesse@gmail.com`.
2. Confirm the notification appears in-app.
3. Do not manually invoke the dispatcher after the initial setup check.
4. Wait beyond the debounce window plus one scheduler cadence.
5. Confirm one grouped email arrives.
6. Confirm the email links work.
7. Confirm a later scheduler invocation does not duplicate the email.
8. Confirm scheduler logs show successful invocations without secret exposure.

## Out Of Scope

- Changing notification grouping semantics.
- Implementing due-date reminder business logic; that is TASK-226.
- Changing actor attribution or self-notification rules; that is TASK-265.
- Adding instant in-app push behavior; that is TASK-263.
