# Current Task: TASK-087 New User Info - Full Name Capture and Account Profile Editing

## Task ID
TASK-087

## Status
In Progress (2026-02-28)

## Objective
Add a `Full name` field to credential sign-up, persist it safely, show it clearly on `/account`, and allow users to edit it with validation and regression coverage.

## Why Now
- Username + email are in place, but human-readable identity metadata is still incomplete.
- Account profile editing now exists and is the right place to expose/update full name.
- This aligns onboarding quality with expected product-level account UX.

## Dependencies
- TASK-047 (Done): credentials sign-in/sign-up entry and onboarding UX.
- TASK-082 (Done): account page actions and profile update baseline.
- TASK-046 (Done): authenticated route/action guardrails.

## Scope
- Add `Full name` input to sign-up form and server action payload handling.
- Persist full name in the user data model (schema + migration updates as needed).
- Display full name on `/account` and add edit capability from account profile.
- Add server-side normalization/validation for full name updates.
- Add/update tests for sign-up and account update flows that touch full name.
- Keep authorization based on `user.id` only (full name is profile metadata, not an identifier).

## Out of Scope
- Username/discriminator redesign.
- Social-provider profile sync/mapping for full name.
- Public profile/discovery features.

## Acceptance Criteria
- New users can provide full name during sign-up.
- Full name is persisted and visible on `/account`.
- Signed-in users can update full name from account page.
- Invalid full-name inputs are rejected with clear feedback.
- Regression tests cover success/failure branches for full-name create/update paths.

## Definition of Done
- Backlog includes TASK-087 and `tasks/current.md` points to TASK-087.
- Implementation + tests merged via PR with green CI.
- Preview deploy is green and full-name flow is manually verifiable.
- Copilot review comments (if any) are addressed and resolved.

## Data Note
- Existing non-critical data can be erased for this task if needed to simplify schema rollout.

---

Last Updated: 2026-02-28
Assigned To: User + Agent
