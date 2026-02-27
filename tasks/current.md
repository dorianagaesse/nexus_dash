# Current Task: TASK-086 Account Page Adjustment - Email Change Verification, Compact Layout, and Settings Navigation

## Task ID
TASK-086

## Status
In Progress (2026-02-27)

## Objective
Extend account self-service so users can update their email address safely, enforce verification on the new email, and improve `/account` information density with a cleaner modern layout.

## Why Now
- TASK-082 delivered account profile controls, but email change is still missing.
- TASK-083 delivered verification lifecycle; email updates should reuse it.
- Current `/account` composition is functional but too vertically sparse for the amount of editable data.

## Dependencies
- TASK-082 (Done): account profile page + username/password update flows.
- TASK-083 (Done): verification token lifecycle + `/verify-email` flow + guarded session behavior.
- TASK-046 (Done): authenticated route/action guardrails.

## Scope
- Add account email update capability from `/account`.
- On successful email update:
  - reset verification state for that user (`emailVerified = null`)
  - issue a fresh verification email token via existing verification service
  - redirect user to `/verify-email` with clear status/error feedback
- Reorganize `/account` layout to reduce vertical footprint while keeping modern, readable visual structure.
- Add explicit navigation affordance to `/account/settings` on the account page.
- Add regression tests for new account email update service behavior and action-level flow handling.

## Out of Scope
- Password reset lifecycle (TASK-084).
- Social-provider account linking/email synchronization.
- Username availability service or public profile discovery.

## Acceptance Criteria
- Signed-in verified users can submit a new valid email from `/account`.
- Email updates enforce normalization/validation and uniqueness.
- Changing email clears `emailVerified` and requires verifying the new email before protected app usage.
- Verification issuance failures are handled safely with clear user-facing errors.
- `/account` presents a more compact layout than before without regressing existing username/password flows.
- A visible control links to `/account/settings`.
- Automated tests cover critical email-change success/failure branches.

## Definition of Done
- Backlog updated with TASK-086 and TASK-083 completion.
- `/account` implementation and tests merged via PR.
- CI + preview deployment checks pass.
- Copilot review comments (if any) are addressed and resolved.

---

Last Updated: 2026-02-27
Assigned To: User + Agent
