# Current Task

## ND-365: Calendar event source identity and color cues

## Status

In Progress (created in the NexusDash project kanban on 2026-09-01 as the
follow-up to TASK-327 / PR #450).

## Context

TASK-327 made multiple Google accounts and calendar sources available at once,
but the project calendar does not communicate an event's origin clearly. Users
cannot reliably tell which connected account and calendar owns an event. This
is especially important because existing events remain locked to their origin
for update and deletion.

## Scope

- Carry the source calendar name, connected-account identity, and provider
  color through calendar event and source response contracts.
- Show an explicit calendar/account identity when an existing event is opened.
- Add stable per-calendar visual cues to week-grid events and a concise source
  legend when multiple calendars are visible.
- Provide a deterministic accessible fallback when Google supplies no usable
  calendar color.
- Keep existing create/update/delete routing, source locking, and read-only
  permissions unchanged.
- Add automated coverage for multi-source provenance, accessible non-color
  identity, responsive layout, and light/dark themes.

## Out Of Scope

- Letting users customize Google Calendar colors from NexusDash.
- Moving existing events between calendars.
- Changing Google OAuth scopes, token storage, discovery, or account lifecycle.
- Redesigning the Calendar settings experience delivered by TASK-327.

## Prerequisites And Runtime Assumptions

- PR #450 is merged to `main` at `acbab9f` and provides the multi-account
  `CalendarConnection` / `CalendarSource` model.
- `CalendarSource.color`, `name`, and connection account label/email are the
  authoritative provenance metadata; no schema migration is expected.
- Local build and unit validation can use non-secret localhost database
  placeholders. Calendar E2E requires the repository PostgreSQL test setup.
- No new runtime secret or external provider permission is required.

## Deployment And Review Assumptions

- Work occurs on `feature/nd-365-calendar-event-source-identity` with one PR.
- Follow `agent.md` and `.github/workflows/deploy-vercel.yml` for an explicit-ref
  Preview deployment and calendar-focused Playwright validation.
- Open the PR ready for review, wait for Copilot's initial review, respond to
  and resolve every actionable thread, and leave the PR unmerged for user
  validation unless explicitly instructed otherwise.

## Acceptance Criteria

1. Every fetched event exposes its CalendarSource name, connected account
   label/email, and provider color when available.
2. Opening an existing event explicitly names its originating account and
   calendar; the information remains available for read-only events.
3. Week-grid events use stable per-calendar visual cues, with an accessible
   deterministic fallback when a provider color is missing or invalid.
4. Calendar provenance never relies on color alone: event controls and the
   opened-event surface include meaningful text or accessible labels.
5. Existing create/update/delete behavior, write-source selection, source
   locking, aggregation ordering, and partial-failure behavior remain intact.
6. Unit/component and Playwright coverage exercises multiple sources, modal
   provenance, 375px mobile behavior, desktop behavior, and light/dark themes.

## Definition Of Done

- All acceptance criteria are implemented and documented.
- `npm run lint`, `npm run rls:check`, `npm test`, `npm run test:coverage`, and
  `npm run build` pass.
- Relevant Calendar Playwright tests pass locally or in CI, and an explicit-ref
  Preview deployment is validated.
- Version/changelog and `journal.md` are updated according to repository policy.
- A ready PR is open, required checks pass, Copilot review has completed, and
  every actionable review thread is addressed and resolved.

## References

- NexusDash task `ND-365` (`cmtikk10n000804ktx0lpdi6l`)
- `agent.md`
- `adr/task-327-calendar-connections.md`
- `docs/runbooks/calendar-connections.md`
- `components/project-calendar-panel.tsx`
- `components/calendar-panel/calendar-week-grid.tsx`
- `components/calendar-panel/calendar-event-modal.tsx`
- `lib/services/calendar-service.ts`
