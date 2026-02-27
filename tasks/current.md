# Current Task: TASK-084 Password Recovery Lifecycle - Forgot Password Request, Reset Token Flow, and Secure Password Rotation

## Task ID
TASK-084

## Status
In Progress (Current) (2026-02-27)

## Objective
Deliver a production-grade password recovery flow for credentials users with secure, single-use, expiring reset links, replay protection, and post-reset session invalidation.

## Why Now
- TASK-083 established tokenized email lifecycle + delivery baseline.
- Credentials auth is live and now needs complete account recovery coverage.
- Password recovery is a standard requirement for secure account onboarding UX.

## Dependencies
- TASK-046 (Done): authenticated route/API guardrails and session primitives.
- TASK-083 (Done): transactional email/token lifecycle baseline and Resend integration.

## Locked Decisions
- Recovery UX uses email reset links (no code-entry flow in this task).
- Reset links are single-use and short-lived.
- Token values are stored hashed only (never raw).
- Password reset invalidates all existing sessions for the subject account.
- Recovery request responses are user-enumeration safe at UX level.

## Scope
- Add forgot-password request flow with email input.
- Issue password-reset tokens with expiry + replay protection.
- Send reset email links through transactional email service.
- Add reset-password form flow with new password + confirmation.
- Rotate stored password hash on successful token consume.
- Invalidate active sessions after successful password reset.
- Add tests for token lifecycle, replay protection, and reset success/failure flows.

## Out of Scope
- MFA recovery factors.
- Social-provider-only account recovery harmonization.
- Additional anti-abuse controls beyond token-level constraints in this task.

## Acceptance Criteria
- User can submit forgot-password request and receive reset email in production.
- Reset link can be consumed once and expires after TTL.
- Invalid/expired/consumed links fail safely with user-friendly messaging.
- Password reset enforces existing password policy and confirmation checks.
- Successful reset revokes active sessions for the account.
- Tests cover critical success/failure/security paths.

## Definition of Done
- Branch + PR for TASK-084.
- Prisma schema + migration committed.
- CI checks pass (check-name, quality, container).
- Copilot review comments addressed/resolved.
- Preview deploy is green.
- Tracking docs updated (`tasks/current.md`, `tasks/backlog.md`, `journal.md` as applicable).

---

Last Updated: 2026-02-27
Assigned To: User + Agent
