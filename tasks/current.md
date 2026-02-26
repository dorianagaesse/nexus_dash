# Current Task: TASK-082 Account Profile Phase 2 - Account Page and User-Menu Identity UX

## Task ID
TASK-082

## Status
Done (2026-02-26)

## Objective
Deliver authenticated account self-service for mutable identity fields (`username`, `password`) and align the account menu with explicit identity-oriented navigation (`Welcome <username>!`, `Account`, `Settings`, `Log out`).

## Why Now
- TASK-081 established persisted username identity and signup validation.
- TASK-080 established account settings routing baseline and authenticated account menu shell.
- This is the next required step before email verification/recovery hardening (TASK-083/TASK-084).

## Dependencies
- TASK-080 (Done): account settings page + account menu baseline.
- TASK-081 (Done): username/discriminator identity model and onboarding.
- TASK-046 (Done): authenticated route/API protection runtime.

## Locked Decisions
- Authorization identity remains `user.id` only; username is mutable profile data.
- Username format remains `3-20` chars with `[a-z0-9._]` policy.
- Backend remains source of truth; frontend validation is UX-only.
- Account page remains server-protected under authenticated layout.

## Scope
- Add authenticated `/account` page focused on profile identity actions.
- Add username update flow with validation, normalization, and conflict-safe persistence.
- Add password update flow with secure verification and rotation behavior.
- Update account menu labels/items:
  - greeting: `Welcome <display-name>!`
  - actions: `Account`, `Settings`, `Log out`
- Keep visual style aligned with existing UI patterns.
- Add regression tests for account profile mutations and menu rendering behavior.

## Out of Scope
- Email verification token flow (TASK-083).
- Password reset via email/forgot-password (TASK-084).
- Social provider profile linking (TASK-068).
- RLS rollout (separate chore already tracked).

## Implementation Checklist
1. Define `/account` information architecture (identity summary + edit sections).
2. Implement server action/service endpoints for:
   - username update
   - password change
3. Enforce backend validation and sanitized error mapping.
4. Update account menu UX copy/actions consistently across authenticated screens.
5. Add/update tests:
   - username update success/fail cases
   - password change success/fail cases
   - menu entries visibility and routing behavior
6. Run validation (`lint`, `test`, `test:coverage`, `build`).
7. Open PR and validate preview deployment.

## Acceptance Criteria
- Authenticated users can open `/account` and update username with policy enforcement.
- Authenticated users can change password through account page controls.
- Validation/error feedback is clear but non-enumerating.
- Account menu shows greeting + `Account` + `Settings` + `Log out` in the expected order.
- No regression to session authorization boundaries (`user.id` remains principal key).
- Automated tests cover core success/failure paths for new behavior.

## Definition of Done
- Branch + PR scoped to TASK-082.
- CI checks pass (quality + relevant gates).
- Copilot review comments resolved.
- Preview deployment validated manually for:
  - account page render/access control
  - username update flow
  - password update flow
  - account menu navigation/actions
- Tracking docs updated: `tasks/current.md`, `tasks/backlog.md`, `journal.md`.

## Open Input (Pending)
- None.

## Execution Outcome (2026-02-26)
- Added authenticated `/account` profile page with two actions:
  - username update with inline discriminator display and policy enforcement
  - password rotation requiring current password and confirmation
- Added server actions for account profile updates with safe redirects/status mapping.
- Added `account-profile-service` for backend validation + mutation handling:
  - username normalization/validation
  - discriminator preservation by default, regeneration on unique collision
  - password validation + current-password verification
  - revocation of all other sessions after successful password change
- Added shared account security policy module to centralize username/password rules across signup and account-profile updates.
- Updated account menu UX to include:
  - `Welcome <display-name>!`
  - `Account`, `Settings`, `Log out`
- Added regression tests for:
  - account profile service behavior
  - account menu authenticated/unauthenticated rendering contract

## Validation Evidence
- `npm run lint` ✅
- `npm test` ✅
- `npm run test:coverage` ✅
- `npm run build` ✅ (with safe local `DATABASE_URL` + `DIRECT_URL` overrides)

---

Last Updated: 2026-02-26
Assigned To: User + Agent
