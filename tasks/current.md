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
- In v1, collaboration invites target existing NexusDash users only. Search/select existing verified users first; broader email/link-based invitation for arbitrary recipients is deferred to a follow-up phase.
- Invitation acceptance must require an authenticated, verified account that matches the invited user.
- Collaboration management remains owner-only in v1: owners manage invites, member roles, and member removal.
- `owner` remains the project creator/current owner in v1 and is not assignable through invites; invite roles are limited to `editor` and `viewer`, with `editor` as the default selection.
- Owners cannot remove themselves from a project; owner-level destructive control remains project deletion, while collaborator removal only applies to non-owners.
- Invite recipients must have clear in-app visibility of pending invitations in v1:
  - a lightweight awareness banner when pending invites exist,
  - a red-dot indicator on the account entry point that means "at least one pending invitation exists",
  - an account-level invitations entry/list as the canonical place to review and act on them.
- Calendar integration remains user-scoped for this task. TASK-058 does not introduce shared project calendar ownership, shared Google credentials, or cross-user event sharing semantics.
- Existing single-user project flows must continue to work unchanged for owners.

## Scope
- Add project membership and invitation persistence/logic needed for owner/editor/viewer collaboration.
- Implement owner-facing invite, revoke, and membership-management flows, with existing-user selection/search for v1 invites.
- Enforce role-based permissions across project reads/writes and collaboration management actions.
- Support invitation acceptance into an authenticated account flow.
- Surface pending invitations clearly in the UI for both project owners (project-level management) and invite recipients (personal pending-invitation visibility).
- For invite recipients in v1, use lightweight global awareness plus a durable personal inbox:
  - notification/banner messaging when a pending invite is present,
  - red-dot indicator on the account entry point that reflects whether any pending invites exist,
  - an invitations entry on the account page that lists pending invites or an explicit empty state.
- Make project UI affordances role-aware so read-only users do not see mutation controls they cannot use.
- Add automated coverage for permission boundaries, invite acceptance, and cross-project isolation regressions.

## Out of Scope
- Non-human agent/API-token access tracked separately in TASK-059.
- Broader auth hardening/test sweep tracked separately in TASK-048.
- Public sharing links or anonymous guest access.
- Invite resend, ownership transfer, and major redesign work unrelated to collaboration management.
- Arbitrary email-based invites and copyable invitation links for non-users; these are follow-up work after the existing-user v1 sharing baseline ships.
- V2 follow-up target:
  - support invitations for non-existing users through email-based invites and copyable invitation links,
  - allow sign-up before acceptance, with acceptance bound to the intended verified account/email,
  - preserve explicit revoke, expiry, and replay-protection rules,
  - keep the final delivery model and exact UX contract to be locked in the dedicated follow-up task.
- Shared project calendar ownership/sharing semantics beyond the existing user-scoped Google Calendar integration.

## Acceptance Criteria
- Project owners can invite existing verified users to a project with an explicit non-owner target role (`editor` or `viewer`), defaulting to `editor`.
- Accepted invites create the correct membership without duplicating users or crossing project boundaries.
- Owners can review and manage memberships/invitations, with destructive actions appropriately guarded.
- Editors/viewers receive only the access their role permits across UI and services.
- Invitation acceptance requires the intended authenticated, verified user and safely rejects replay, expired, revoked, or mismatched-account attempts.
- Invite recipients can see that they have pending invitations somewhere in the authenticated UI, not only through a direct project-management view.
- The authenticated recipient experience includes:
  - visible awareness of pending invites from the main app shell,
  - a red-dot account indicator that is shown when pending invitation count is greater than zero and hidden when it reaches zero,
  - an account-level invitations entry/list with either an explicit "no pending invitations" state or actionable invitation rows,
  - invitation copy that clearly communicates inviter, target project, and target role.
- Project header/settings provide the owner-facing entry point for project metadata and sharing management, with sharing accessible as a clear first-class action.
- The existing Google Calendar integration remains user-scoped after the change; TASK-058 does not convert it into a shared project calendar.
- Cross-project access isolation and invite misuse edge cases are covered by automated tests.
- Local lint/tests/build remain green.

## Implementation Plan
1. Confirm the current membership/invitation schema and service-layer gaps against ADR TASK-020.
2. Implement invitation + membership services for existing verified users, with service-layer role enforcement and invite lifecycle handling.
3. Add the required project-sharing UI flows for owners plus recipient-side invitation visibility and accept/decline handling.
4. Make project surfaces role-aware so viewer access is read-only across tasks, context, and calendar mutations while calendar ownership remains user-scoped.
5. Extend regression coverage for permission checks, invite lifecycle behavior, and isolation boundaries.
6. Run validation and prepare the branch/PR workflow for review.

## Known Follow-Up Questions For Merge/Deploy
- Confirm whether membership visibility should include pending invites for non-owners or remain owner-only in v1.
- Define the future task boundary for shared project calendar ownership/sharing semantics so it does not get conflated with TASK-058.
- Define the final v2 contract for arbitrary email invites, copyable invitation links, delivery behavior, and recipient UX once existing-user sharing is stable.

---

Last Updated: 2026-03-20
Assigned To: User + Agent
