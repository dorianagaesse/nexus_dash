# Current Task: TASK-081 Account Identity Phase 1 - Username Onboarding, Discriminator, and Signup Password Confirmation

## Task ID
TASK-081

## Status
Planned (Current) (2026-02-25)

## Objective
Strengthen account identity onboarding by adding a first-class `username` input at signup, generating a unique public display variant with a discriminator suffix, and requiring password confirmation checks before account creation.

## Why Now
- TASK-047 is complete and merged, so baseline credentials signup/signin UX exists.
- Username and confirm-password were explicitly requested as immediate UX/security upgrades.
- This phase prepares cleanly for TASK-082 (account page updates), TASK-083 (email verification), and TASK-084 (password recovery).

## Dependencies
- TASK-047 (Done): signed-out homepage auth entry and credentials onboarding flow.
- TASK-046 (Done): route/API protection and session runtime.
- TASK-045 (Done): auth data model foundation.

## Locked Decisions
- Authorization identity remains `user.id` only (username is mutable profile data).
- Username availability checks are not required in this phase.
- Username display variant uses suffix generation (example: `username#1234` style).

## Scope
- Add username collection to sign-up flow (UI + server validation).
- Add confirm-password field and match validation at sign-up.
- Persist username profile fields in DB via migration and service updates.
- Generate and persist deterministic/unique discriminator suffix on account creation.
- Display resulting username identity in post-auth session-facing surfaces where applicable.
- Add automated tests for validation, generation rules, and create-account behavior.

## Out of Scope
- Account self-service edit page (TASK-082).
- Email verification token lifecycle (TASK-083).
- Forgot-password/reset flow (TASK-084).
- Social providers and provider profile linking (TASK-068).

## Implementation Checklist
1. Define username schema contract (base username + generated suffix/display form).
2. Add Prisma schema + migration for username fields and uniqueness constraints.
3. Update signup action/service validation:
   - username syntax/length validation
   - password confirmation match validation
   - generated suffix assignment and collision handling
4. Update home sign-up UI to collect username and confirm password.
5. Ensure sanitized error messages (no account-enumeration leaks).
6. Add/adjust tests:
   - username validation and normalization
   - suffix generation uniqueness/collision behavior
   - confirm-password validation
   - successful signup persistence/session behavior
7. Run validation (`lint`, `test`, `test:coverage`, `build`) and prepare PR.

## Acceptance Criteria
- Sign-up form requires `username`, `password`, and `confirm password`.
- Signup fails with clear user-facing feedback when:
  - username is invalid by policy
  - password and confirmation do not match
- Successful signup persists username identity data and creates a valid session.
- Generated username display variant is unique within system constraints.
- Authorization behavior remains based on `user.id` and is unaffected by username mutation.
- Regression tests cover both successful and failing flows for new onboarding fields.

## Definition of Done
- Branch + PR scoped to TASK-081.
- DB migration applied and validated locally (and documented for staging/prod rollout).
- CI checks pass (`check-name`, quality, e2e/container if triggered by workflow).
- Copilot review comments resolved and marked complete.
- Manual preview deploy validated for:
  - sign-up with username + confirm password
  - expected validation messages
  - successful redirect/session after valid signup
- Tracking docs updated: `tasks/current.md`, `tasks/backlog.md`, `journal.md`.

## Open Inputs (If You Want to Lock Them Now)
1. Username policy defaults:
   - Option A: 3-20 chars, `a-z`, `0-9`, `_`, `.`
   - Option B: 3-30 chars, `a-z`, `0-9`, `_`, `.`, `-`
2. Discriminator format:
   - Option A: `#` + 4 digits (`name#1234`)
   - Option B: `#` + 6 base36 chars (`name#8F2K1Q`)
3. Display strategy in UI:
   - Option A: show full `username#suffix` everywhere
   - Option B: show base username normally, full value in account/menu details

---

Last Updated: 2026-02-25
Assigned To: User + Agent
