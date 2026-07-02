# TASK-314 Meeting Todo Overdue Reminders

## Status
Done (2026-06-25, merged via PR #346).

## Source
- User feedback on TASK-098 on 2026-06-10: when a meeting todo is still open
  one week after the meeting date, notify the user and send an email using the
  app's existing notification email conventions.
- TASK-098 now stores meeting notes, meeting dates, lifecycle state, labels, and
  personal follow-up todos.

## Problem
Meeting follow-up todos can stay hidden inside individual meeting notes. The
TASK-098 UI can visually highlight overdue todos on the project page, but
durable reminders and email delivery require scheduler, idempotency, delivery
logging, and user preference decisions that are better handled as a dedicated
notification task.

## Goal
Send reliable reminders for overdue meeting todos while staying aligned with
the existing NexusDash notification-email architecture:
- a todo becomes overdue when it is incomplete seven days after the meeting
  date;
- the owning user receives an in-app notification/reminder record;
- the app sends an email through the existing notification delivery path;
- reminders are idempotent and do not spam repeated sends for the same todo.

## Acceptance Criteria
1. A service can find meeting-note todos that are incomplete seven or more days
   after the note's meeting date.
2. Reminder dispatch is idempotent per todo and reminder window.
3. The app records an in-app notification or equivalent durable reminder for the
   meeting-note owner.
4. The app sends an email using the existing notification email conventions,
   environment controls, skip behavior, and delivery logging.
5. Preview/local validation documents how reminders are triggered manually or by
   the existing scheduler bridge.
6. Tests cover overdue selection, idempotency, email payload shape, skipped
   delivery behavior, and permission/tenancy boundaries.

## Definition Of Done
- [x] Existing notification-email services and scheduler runbooks are reviewed.
- [x] Persistence changes, if needed, are added through Prisma migrations.
- [x] Reminder dispatch code is service-owned and route/scheduler adapters stay
      thin.
- [x] Tests cover service, API/scheduler, and email behavior.
- [x] Documentation and runbooks explain local, preview, and production
      reminder behavior.
- [x] Preview validation proves the reminder path can run safely without
      sending unintended external email.

## Initial Implementation Notes
- Start with:
  - `lib/services/project-notification-email-service.ts`
  - notification dispatch runbooks under `docs/runbooks/`
  - TASK-227 and TASK-268 for current scheduler tradeoffs
  - TASK-098 meeting-note service and Prisma models
- Prefer recording reminder state per action/todo rather than deriving delivery
  history from email logs alone.
- Treat preview email delivery according to the current outbound email mode so
  validation can prove payload generation without sending real mail.
