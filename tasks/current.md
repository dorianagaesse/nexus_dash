# Current Task: TASK-080 Account Settings - Per-User Google Calendar Target Configuration

## Task ID
TASK-080

## Status
In Progress (Current) (2026-02-23)

## Objective
Allow each authenticated user to configure their own Google Calendar target ID in account settings, while keeping `primary` as the default behavior.

## Why Now
- TASK-076 removed singleton calendar ownership and established per-user credential boundaries.
- Calendar target selection is still effectively fixed to `primary` in code.
- Multi-user onboarding needs a user-owned settings surface for optional advanced calendar routing.

## Dependencies
- TASK-076 (Done): per-user Google credential model and principal-scoped calendar access foundation.
- TASK-046 (Pending): auth core and route protection baseline for account/settings access control.

## Locked Decisions
- `primary` remains the default calendar target.
- Custom calendar ID is optional and per-user only.
- No global/shared env calendar target for end-user behavior.
- No multi-calendar picker UX/API discovery in TASK-080.

## Scope
- Add authenticated account/settings surface for Google Calendar target configuration.
- Read/write the current user's `GoogleCalendarCredential.calendarId`.
- Support reset-to-default behavior (`primary`) when empty or reset action is used.
- Ensure calendar service operations resolve and use the user-configured target.
- Keep authorization fail-closed (users can only read/update their own setting).

## Out of Scope
- OAuth provider expansion and sign-in UX rollout (TASK-046/TASK-047/TASK-068).
- Multi-calendar browsing/picker from Google API.
- Team/org-level defaults and sharing behavior.

## Implementation Checklist
1. Confirm settings route placement and navigation entry point.
2. Add service-layer methods for current-user calendar settings read/update.
3. Add route/action boundary for settings mutation with actor-user validation.
4. Build settings UI (view current value, edit, save, reset to `primary`).
5. Ensure calendar CRUD paths use configured value with safe fallback.
6. Add tests:
   - authorized read/update success
   - cross-user denial
   - reset/default behavior
7. Run validation (`lint`, `test`, `test:coverage`, `build`), then open PR.

## Acceptance Criteria
- Authenticated user can view and update their own calendar target ID.
- Empty/reset behavior stores or resolves to `primary`.
- One user cannot modify or read another user's calendar setting.
- Calendar operations use the stored per-user target ID.
- Regression tests cover settings update and authz boundaries.

## Definition of Done
- Dedicated branch + PR for TASK-080 only.
- CI checks pass.
- Copilot review comments handled and resolved.
- Manual preview validation confirms end-to-end settings behavior.
- Task tracking updated in `tasks/current.md`, `tasks/backlog.md`, and `journal.md`.

## Open Inputs (To Confirm Before Implementation)
- Preferred settings route path and nav placement (for example `/account/settings` vs `/settings`).
- Validation policy for custom calendar IDs (minimal non-empty string vs stricter format checks).
- UX copy for reset behavior (`Use primary calendar` wording).

## Next Step
Create `feature/task-080-calendar-settings` from `main`, scaffold settings boundary and UI, then wire calendar service consumption and tests.

---

Last Updated: 2026-02-23
Assigned To: User + Agent
