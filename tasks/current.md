# Current Task: TASK-068 Social Authentication Providers - Google/GitHub Entry, Account Linking, and Modern Auth Surface

## Task ID
TASK-068

## Status
In Progress

## Objective
Add first-party Google and GitHub sign-in/sign-up support on top of the existing custom session model, while upgrading the home auth page into a more modern, calmer, social-first entry surface without splitting account/session behavior across multiple systems.

## Why This Task Matters
- The app already has baseline email/password auth, sessions, verification, and account identity.
- The missing step is faster entry for returning users and lower-friction onboarding for new users.
- This task should preserve the current authorization/session architecture rather than introducing a second auth stack.

## Assumptions Locked For This Implementation
- We keep the existing Prisma-backed session model; no Auth.js migration inside TASK-068.
- Social auth uses the existing `Account` table for provider identity linkage.
- Provider accounts are auto-linked only when the provider returns a usable verified email.
- New social-auth users are created with:
  - `passwordHash = null`
  - `emailVerified` populated from verified provider email
  - generated username + discriminator using the existing account identity rules
- TASK-068 focuses on the home auth entry and login/signup flow, not account-management UI for linking/unlinking providers after sign-in.

## Scope
- Add Google sign-in/sign-up provider flow for app authentication.
- Add GitHub sign-in/sign-up provider flow for app authentication.
- Add provider callback/init routes with CSRF state cookies and redirect handling.
- Create or link users through the existing `User` + `Account` + `Session` model.
- Reuse the current session cookie behavior for social-auth success.
- Refresh the home auth page to feel more modern and social-first while preserving credentials login/signup.
- Add automated coverage for provider routing, provider/account resolution, and updated auth entry rendering.

## Out of Scope
- Account settings UI for linking/unlinking providers after sign-in.
- Public API exposure or agent-token work.
- Replacing the current custom auth/session system with Auth.js.
- Password-management UX for social-only accounts beyond existing flows.

## Acceptance Criteria
- Google and GitHub provider flows can initiate from the home auth page.
- A returning social-auth user with an existing provider account gets a normal app session.
- A new social-auth user with a verified provider email gets a new app user + provider account + session.
- An existing credentials user with the same verified provider email is linked safely instead of duplicated.
- Provider callbacks fail safely with user-facing error states on the home auth page.
- The home auth page looks materially more polished and modern than the baseline credentials-only version.
- Local lint/tests/build remain green.

## Implementation Plan
1. Add reusable social OAuth provider helpers and env validation.
2. Add social-auth account resolution/linking service on top of the current Prisma schema.
3. Add provider init/callback routes and session-cookie integration.
4. Redesign the home auth entry to support social-first entry plus credentials fallback.
5. Add automated coverage and run local validation.
6. Open PR and surface only the remaining provider-config inputs needed for deploy.

## Known Follow-Up Questions For Merge/Deploy
- Confirm final Google OAuth client credentials + redirect URI registration for app login.
- Confirm final GitHub OAuth app credentials + callback URL registration.
- Decide whether a later follow-up should add provider-link management in `/account`.

---

Last Updated: 2026-03-19
Assigned To: User + Agent
