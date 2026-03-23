# Current Task: TASK-103 Project Sharing V2 - Email-Bound Invites for Non-Existing Users and Copyable Invite-Link Delivery

## Task ID
TASK-103

## Status
Planned

## Objective
Extend the shipped project-sharing v1 baseline so project owners can invite collaborators by email even before they have a NexusDash account, while keeping invite acceptance bound to the intended verified email/account and using copyable invite links as the v2 delivery mechanism.

## Why This Task Matters
- V1 sharing works for existing verified users, but real collaboration often starts with "invite this person by email" rather than "find this existing account first".
- The app now has enough collaboration foundation to support a safer v2 without reopening the entire permission model.
- This task unlocks broader team onboarding while preserving the strong service-layer authorization and verified-identity model established in v1.

## Assumptions Locked For This Implementation
- Authorization must continue to be enforced in `lib/services/**`, not delegated to UI-only checks or route-only guards.
- The v1 role model remains unchanged: single `owner`, inviteable roles `editor` and `viewer`, with `editor` as the default selection.
- Existing member role management in project settings is already part of shipped v1 and is not a separate follow-up task.
- V2 invites are bound to one exact normalized email address; copied links are only a delivery mechanism for that email-bound invite, not open claimable access.
- Invitation acceptance must still require a normal authenticated, verified account whose verified email matches the invited email.
- If the recipient does not have an account yet, they can sign up with the invited email, complete the normal verification flow, and then resume invite acceptance.
- Only one active pending invite may exist per `project + normalized email`; creating a new invite replaces the prior active pending invite for that same pair.
- The owner sharing surface should support both existing-user search and email invite entry in one unified place.
- Pending invites for a matching email should appear automatically in the in-app invitation surface once that account exists, even if the user never opened the invite link earlier.
- The wrong-account mismatch flow from v1 remains the expected behavior when an invite link is opened while signed in with a different account.
- Invite expiry remains 14 days unless a later product decision changes it.
- V2 delivery is copy-link only; app-managed invite email sending is deferred to `TASK-104`.
- Shared project calendar ownership/sharing semantics remain outside this task.

## Scope
- Extend invitation persistence and service logic to support email-bound invites for recipients who may not yet have an account.
- Allow owners to create/recreate invites by email from the existing sharing surface.
- Generate a copyable invite link for each pending invite.
- Preserve safe invite lifecycle behavior across revoke, expiry, replacement, and replay cases.
- Support the recipient flow for:
  - signed-out users,
  - users who need to sign up first,
  - users who need to verify first,
  - users signed into the wrong account,
  - users who already have the correct verified account.
- Ensure matching pending invites appear automatically in the recipient invitation inbox once the corresponding account exists.
- Keep project UI/service role enforcement coherent with the shipped v1 permission model.
- Add automated coverage for email-bound invite lifecycle behavior, signup/verify/resume flow, replacement semantics, and cross-project isolation.

## Out of Scope
- App-managed invite email sending tracked separately in `TASK-104`.
- Public or anonymous claimable invite links.
- Ownership transfer, invite resend UX, or major collaboration-admin redesign work unrelated to email-bound invite support.
- Shared project calendar ownership/sharing semantics.
- Broader auth/security sweeps already tracked elsewhere.

## Acceptance Criteria
- Project owners can invite an email address even when no NexusDash account exists yet.
- Existing-user search remains supported, and the owner can also enter an email from the same sharing surface.
- Each invite is bound to the intended normalized email and can only be accepted by a verified account with that same email.
- If the invited person signs up first, the app resumes invite acceptance after normal email verification.
- Only one active pending invite exists per `project + normalized email`; creating a replacement invite invalidates the previous pending one.
- Owners can copy an invite link from the app and deliver it outside the app.
- Opening an invite link while signed out, unverified, or signed into the wrong account follows a clear gated flow rather than failing opaquely.
- Matching pending invites appear automatically in the account invitation inbox once the matching account exists.
- Replay, revoked, expired, replaced, and wrong-account cases are handled safely and covered by tests.
- Local lint/tests/build remain green.

## Implementation Plan
1. Confirm the v1 invitation schema/service shape and identify the minimal changes needed for email-bound invites.
2. Extend invitation persistence and service-layer lifecycle handling for normalized email targets plus replacement semantics.
3. Update the sharing UI so owners can invite by email and copy the resulting invite link from the same surface.
4. Implement the recipient-side signed-out, sign-up, verify, and wrong-account resume flows.
5. Ensure the invitation inbox/red-dot/banner behavior works automatically once a matching account exists.
6. Add regression coverage and run the usual validation/build checks.

## Known Deferred Follow-Ups
- `TASK-104`: app-managed invite email sending
- Shared calendar ownership/sharing semantics
- Later collaboration-admin refinements such as resend/edit flows if needed

---

Last Updated: 2026-03-23
Assigned To: User + Agent
