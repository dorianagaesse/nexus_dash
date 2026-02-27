# Current Task: TASK-083 Email Verification Lifecycle - Signup Verification Tokens, Confirmation Route, and Guarded Session State

## Task ID
TASK-083

## Status
Planned (Current) (2026-02-27)

## Objective
Add production-grade email ownership verification for credentials accounts using a one-click verification link flow, while keeping authentication and authorization boundaries secure and user-friendly.

## Why Now
- TASK-047, TASK-081, and TASK-082 are completed and merged.
- Credentials onboarding exists, but verified-email ownership is not yet enforced.
- TASK-084 (forgot-password) depends on a robust outbound email and token lifecycle baseline.

## Dependencies
- TASK-047 (Done): home auth entry + credentials session onboarding.
- TASK-081 (Done): username onboarding + account identity model.
- TASK-082 (Done): account profile + menu identity surfaces.
- TASK-046 (Done): authenticated route/API guardrails.

## Locked Decisions
- Verification UX path: redirect unverified users to `/verify-email`.
- Verification method: one-click link in email (no code entry flow in this task).
- Access policy: users can sign in, but app usage is gated until email is verified.
- Legacy-user migration policy: existing users are marked verified to avoid lockout.
- Token TTL: 1 hour.
- Token properties: single-use + replay-resistant (stored hashed, never raw).
- Resend policy: 60-second cooldown + daily resend cap.
- Sender identity: `NexusDash <noreply@nexus-dash.app>`.
- Environment policy: real email sending in production only; preview/dev use safe non-sending behavior.
- Authorization identity remains `user.id`; verification does not change principal semantics.

## Scope
- Generate verification links during credentials sign-up.
- Add `/verify-email` screen for unverified users with:
  - status messaging
  - resend action
  - continue action after verification
- Add verification callback route that validates token, marks user as verified, and invalidates token.
- Enforce guarded-session behavior so unverified users cannot access protected app surfaces.
- Implement production-only email delivery via Resend.
- Add rate limiting for resend attempts (cooldown + daily cap).
- Add migration/data update for legacy users to preserve access continuity.
- Add automated tests for token lifecycle, gating rules, and resend protections.

## Out of Scope
- Password reset/forgot-password flow (TASK-084).
- Social provider verification harmonization (TASK-068).
- Additional identity factors (SMS, TOTP, passkeys).
- Code-based email verification entry UX.

## Implementation Checklist
1. Define verification token contract (identifier, hashed token, expiry, single-use invalidation).
2. Add/adjust persistence + migration strategy for:
   - verification token usage
   - legacy-user email verification backfill
3. Implement email verification service:
   - token issue
   - resend guardrails
   - token consume/mark verified
4. Implement Resend mailer adapter for production send path.
5. Implement preview/dev non-send behavior (safe fallback, no secret leakage).
6. Implement `/verify-email` page and callback route integration.
7. Enforce session gating for unverified users on protected app routes.
8. Add regression tests:
   - token generation/expiry/single-use
   - resend cooldown + daily cap
   - gated access for unverified users
   - successful verify + redirect/unlock path
9. Run validation (`lint`, `test`, `test:coverage`, `build`) and open PR.

## Acceptance Criteria
- New credentials sign-up triggers verification email workflow.
- Unverified authenticated users are redirected to `/verify-email` when accessing protected app pages.
- Verification link marks the correct account as verified and cannot be replayed.
- Expired/invalid tokens fail safely with user-friendly messaging.
- Resend is rate-limited by cooldown and daily cap.
- Existing accounts remain usable after rollout (legacy users backfilled as verified).
- Production sends via Resend; preview/dev do not send real emails.
- Automated tests cover success/failure/security-critical paths.

## Definition of Done
- Branch + PR scoped to TASK-083.
- Schema/migration updates applied and documented for staging/prod rollout.
- CI checks pass (`check-name`, quality, and applicable workflow gates).
- Copilot review comments addressed and resolved.
- Manual preview verification validates:
  - `/verify-email` gating UI behavior
  - invalid/expired token handling
  - guarded access behavior for unverified sessions
- Manual production verification validates real email delivery and successful link verification.
- Tracking docs updated: `tasks/current.md`, `tasks/backlog.md`, `journal.md`.

## Open Input (Pending)
- None.

---

Last Updated: 2026-02-27
Assigned To: User + Agent
