# Current Task

## TASK-348: Personal Calendar Versus Shared Project Scheduling

## Status

Implementation in progress on
`feature/task-348-personal-calendar-shared-schedule`. Phase 1 (relabel and
decouple) is being delivered alongside a design ADR for the future shared
schedule. TASK-348's full shared-schedule implementation is intentionally
deferred until TASK-337 (project actor identity) and TASK-331 (capability
model) land.

## Context

TASK-336's multi-user collaboration audit named the project Calendar panel as
a P1 collaboration gap: the integration is correctly user-owned (the Google
token belongs to the signed-in user and events come from their selected Google
calendar), but the panel still presents itself as if it were a project module.
A viewer cannot create an event through their own Google connection while
looking at a project, the panel header just says "Calendar", and editor role
controls the configured Google target in a way that suggests shared ownership.

The audit recommended a two-stage path:

1. Stop presenting the user-scoped Google Calendar overlay as a shared project
   module. Label it clearly as the signed-in user's "My calendar" overlay,
   decouple its mutation semantics from the project editor role, and keep the
   existing user-scoped credentials intact.
2. Once the project actor contract lands (TASK-337) and the capability model
   is in place (TASK-331), design and ship a NexusDash-owned shared project
   schedule as its own artifact with owners, capabilities, history, and
   optional external-calendar synchronization.

This task delivers the first stage plus a written design proposal for the
second stage so the follow-up work has a clear contract to build on.

## Scope

- Relabel the project dashboard Calendar section and the upcoming-events stat
  card as "My calendar" so users understand it is a personal overlay, not a
  shared project schedule.
- Decouple calendar mutations from the project editor role: a viewer who has
  connected Google Calendar with write scope can create, update, and delete
  events in their configured target calendar while looking at the project.
  Project access is retained only to scope the request and read the project
  context; the user's Google credentials and write scope authorize mutation of
  that selected target.
- Keep the dashboard surfaces accessible, label-aware, and consistent with the
  existing responsive and theme baseline; update copy where it currently
  suggests shared ownership.
- Refresh the calendar test suite to match the new gating and add a focused
  coverage row that exercises a viewer's authorized personal calendar edit.
- Draft `adr/task-348-shared-schedule-contract.md` describing the future
  NexusDash-owned shared project schedule: artifact model, actor contract,
  capability vocabulary, history, and optional external-calendar sync. Update
  `adr/decisions.md` with a pointer and a short summary so the design is
  discoverable.

## Out Of Scope

- Implementing the shared project schedule itself. The full NexusDash-owned
  shared schedule depends on TASK-337 (project actor identity) and TASK-331
  (capability model). This task ships the design contract and explicitly
  defers implementation.
- Multi-connection or multi-provider calendar expansion. TASK-327 already
  owns that path and is still pending.
- RLS or schema changes. Phase 1 is a UX and authorization refactor on top of
  the existing `GoogleCalendarCredential` model. The future shared schedule
  ADR anticipates new tables, migrations, and RLS work, but none of that is
  done here.
- Calendar assignment, mentions, or notification producers; those remain the
  domain of TASK-347.
- Refactoring the existing personal-calendar read/write/sync paths; we keep
  the user-scoped OAuth flow intact and only change the role gating on the
  mutation endpoints.

## Acceptance Criteria

1. The project dashboard Calendar section header reads "My calendar" with
   explanatory copy that names the integration as a user-scoped Google Calendar
   overlay and clarifies that edits update the selected Google target rather
   than a shared NexusDash project schedule.
2. The dashboard upcoming-events summary card is relabeled to match ("My
   calendar") so the stat row and section header use one vocabulary.
3. The Calendar section skeleton, project dashboard labels, and any other
   visible "Calendar" surface are updated consistently with the new label.
4. `ProjectCalendarPanel` no longer gates create, edit, or delete actions on
   the project `canEdit` flag. The visible "New event" affordance, the
   in-event-card "Edit" affordance, and the event-modal flow are reachable by
   any signed-in project member whose Google credential exposes the calendar
   write scope.
5. `lib/services/calendar-service.ts` mutations require project access at
   `viewer` level (only to scope the request to a project the user can see)
   and require the user's Google write scope, matching the visible UI
   affordances. The previous `minimumRole: "editor"` requirement on
   `createCalendarEvent`, `updateCalendarEvent`, and `deleteCalendarEvent` is
   removed.
6. The view-only and connected-but-read-only-scope paths still surface clear
   empty states and do not show mutation affordances.
7. Tests covering the calendar event routes and panel are updated so that:
   a viewer with Google write scope succeeds in `POST`, `PATCH`, and
   `DELETE`; a viewer without write scope still receives
   `insufficient-scope`; and the personal-overlay copy assertions reflect the
   new label.
8. The Calendar event modal title remains neutral (it is the user's personal
   event, not a project record) and the modal continues to pass through the
   connected-Google reauthorization reconnect link when applicable.
9. `adr/task-348-shared-schedule-contract.md` describes the future
   NexusDash-owned shared project schedule: artifact model, owner/assignee
   actor contract, capabilities (drawing on TASK-331), history and audit
   surface, and the optional external-calendar synchronization model. The
   decision is logged in `adr/decisions.md` with a short summary and pointer
   to the ADR.
10. UI remains usable at 375px and desktop widths, in light and dark themes,
    with visible focus, semantic status text, at least 44px primary touch
    targets, and no behavior change for the project role semantics elsewhere
    in the product.

## Definition Of Done

- Calendar panel, summary card, skeleton, and modal copy are aligned to the
  "My calendar" overlay label.
- `ProjectCalendarPanel` and `lib/services/calendar-service.ts` mutation
  paths no longer require project editor role.
- Updated unit, API, and component tests cover viewer success, write-scope
  failure, and copy assertions.
- The shared-schedule ADR exists at `adr/task-348-shared-schedule-contract.md`
  and is referenced from `adr/decisions.md`.
- `tasks/current.md`, `tasks/backlog.md`, `journal.md`, and the ADR reflect
  the delivered behavior.
- `npm run lint`, `npm run rls:check`, `npm test`, `npm run test:coverage`,
  `npm run build`, and the calendar Playwright smoke pass.
- The branch is pushed, a ready-for-review PR is open, required checks are
  green, and initial Copilot review feedback is resolved or documented.

## Runtime Assumptions

- Local database-backed validation uses the repository `.env` contract and a
  reachable PostgreSQL instance when migration or E2E execution requires it.
- No new secrets or external provider configuration are introduced.
- Preview deployment is not an acceptance requirement; local browser coverage
  is sufficient unless review feedback exposes a preview-only concern.
