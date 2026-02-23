# Current Task: TASK-080 Account Settings - Per-User Google Calendar Target Configuration

## Task ID
TASK-080

## Status
Done (PR Open) (2026-02-23)

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

## Delivered
1. Added top-right authenticated account menu (Settings + Log out) and integrated it with the existing theme toggle.
2. Added `/account/settings` page with per-user calendar target input, save action, and explicit reset-to-primary action.
3. Added `account-settings-service` with fail-closed actor checks, minimal validation, and defaulting logic.
4. Added `POST /api/auth/logout` to revoke the active DB session and clear all supported auth session cookies.
5. Hardened calendar target normalization and fallback usage in calendar credential/access services.
6. Added regression coverage for:
   - account settings read/update + reset/default behavior
   - cross-user denial guard at service boundary
   - logout route behavior and cookie/session cleanup
   - calendar id normalization helpers

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

## Next Step
Merge PR `#50`, then begin TASK-046 (auth core and route protection) with TASK-080 account/settings entry already in place.

## Execution Outcome (2026-02-23)
- Branch: `feature/task-080-account-settings`
- PR: https://github.com/dorianagaesse/nexus_dash/pull/50
- Copilot review: completed with no actionable inline comments.
- Remote checks: `check-name`, `Quality Core`, `E2E Smoke`, and `Container Image` all passed.
- Manual preview deploy: triggered via `deploy-vercel.yml` (`action=deploy-preview`, `git_ref=feature/task-080-account-settings`).
- Preview URL: https://nexus-dash-7s1tprkyi-dorian-agaesses-projects.vercel.app

---

Last Updated: 2026-02-23
Assigned To: User + Agent
