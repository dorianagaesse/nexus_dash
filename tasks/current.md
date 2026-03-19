# Current Task: TASK-058 Authorization Implementation - Project Sharing, Membership Roles, and Invitations

## Task ID
TASK-058

## Status
In Progress

## Objective
Implement collaborative project access on top of the existing authenticated multi-user foundation by introducing membership management, invitation flows, and role-based permission enforcement across the product.

## Why This Task Matters
- The data and service boundaries already support authenticated multi-user ownership, but project collaboration is still effectively single-owner from a UX and workflow perspective.
- Sharing is a prerequisite for real team usage and is also the contract that later auth hardening, invite security, and agent access work build upon.
- The ADR and boundary work already reserved room for owner/editor/viewer roles; this task turns that model into usable product behavior.

## Assumptions Locked For This Implementation
- Authorization must continue to be enforced in `lib/services/**`, not delegated to UI-only checks or route-only guards.
- Role model remains `owner`, `editor`, and `viewer`, aligned with ADR TASK-020 and the staged boundary work already shipped.
- Invitations should be secure, scoped to a project, and safe against replay/guessing; invitation secrets must not be stored in plaintext.
- Existing single-user project flows must continue to work unchanged for owners.

## Scope
- Add project membership and invitation persistence/logic needed for owner/editor/viewer collaboration.
- Implement owner-facing invite and membership-management flows.
- Enforce role-based permissions across project reads/writes and collaboration management actions.
- Support invitation acceptance into an authenticated account flow.
- Add automated coverage for permission boundaries, invite acceptance, and cross-project isolation regressions.

## Out of Scope
- Non-human agent/API-token access tracked separately in TASK-059.
- Broader auth hardening/test sweep tracked separately in TASK-048.
- Public sharing links or anonymous guest access.
- Major redesign work unrelated to collaboration management.

## Acceptance Criteria
- Project owners can invite collaborators to a project with an explicit target role.
- Accepted invites create the correct membership without duplicating users or crossing project boundaries.
- Owners can review and manage memberships/invitations, with destructive actions appropriately guarded.
- Editors/viewers receive only the access their role permits across UI and services.
- Cross-project access isolation and invite misuse edge cases are covered by automated tests.
- Local lint/tests/build remain green.

## Implementation Plan
1. Confirm the current membership/invitation schema and service-layer gaps against ADR TASK-020.
2. Implement or complete invitation + membership services with secure token handling and role enforcement.
3. Add the required project-sharing UI flows for owners and invite acceptance for recipients.
4. Extend regression coverage for permission checks, invite lifecycle behavior, and isolation boundaries.
5. Run validation and prepare the branch/PR workflow for review.

## Known Follow-Up Questions For Merge/Deploy
- Decide whether the first release should support invite revocation plus resend in one pass or keep resend as a follow-up if scope expands.
- Confirm whether membership visibility should include pending invites for non-owners or remain owner-only in v1.

---

Last Updated: 2026-03-19
Assigned To: User + Agent
