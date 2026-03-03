# Current Task: ISSUE-080 Username Mobile Auto-Capitalization Signup Friction

## Task ID
ISSUE-080

## Status
In Progress (2026-03-03)

## Objective
Prevent mobile keyboard auto-capitalization from causing username submission failures.

## Why Now
- Issue #80 reports signup friction on mobile due to uppercase first-letter input.
- Existing backend username normalization already lowercases values, so frontend constraints should not block casing-only input differences.

## Scope
- Update username form input behavior to reduce auto-capitalization/correction friction on mobile.
- Ensure frontend validation does not reject usernames solely due to uppercase letters.
- Preserve server-side normalization and validation as source of truth.
- Add regression coverage for signup form attributes.

## Out of Scope
- Username policy changes (allowed characters/length).
- Auth service architecture changes.
- Identity model schema changes.

## Acceptance Criteria
- Uppercase characters in typed username no longer cause frontend submission rejection solely due to casing.
- Mobile-focused input attributes are set to reduce auto-capitalization/autocorrect interference.
- Username persistence behavior remains normalized/consistent in backend services.
- Validation baseline is green for this branch.

## Definition of Done
- Branch + PR opened and linked to issue #80.
- CI checks green.
- Copilot review threads handled/resolved.
- Tracking files updated (`tasks/current.md`, `journal.md`).

---

Last Updated: 2026-03-03
Assigned To: User + Agent
