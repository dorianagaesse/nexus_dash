# Current Task: TASK-320 Project Membership Live Refresh

## Task ID
TASK-320

## Status
In progress.

## Branch
`fix/task-320-project-membership-live-refresh`

## Source
- GitHub issue #352: Project page does not update when a member joins.
- User report on 2026-06-26.

## Objective
Ensure already-open project pages update automatically after an invited user
joins the project, so collaborator/member surfaces do not require a manual page
refresh.

## Context
- Project dashboards use `ProjectLiveRefresh` with an SSE-first activity stream
  and polling fallback.
- That refresh path observes `Project.updatedAt` as the project activity
  version, and typed `ProjectActivityEvent` rows are used for targeted
  reconciliation where available.
- Invitation acceptance creates a `ProjectMembership` and marks the
  `ProjectInvitation` accepted, but it did not advance the project activity
  marker, so open dashboards had no freshness signal for membership changes.
- The normal typed activity writer intentionally requires editor-or-owner
  access. Invitees may accept viewer invitations, so membership acceptance needs
  a narrower refresh-marker path rather than relaxing content mutation rules.

## Scope
- Add a membership-specific project activity touch that is valid only after the
  authenticated invitee has accepted the invitation and has a project
  membership.
- Call that touch after successful invitation acceptance so project SSE/polling
  clients observe a newer project version and refresh.
- Keep owner-only sharing management and editor-only content activity events
  unchanged.
- Add regression coverage for viewer invitation acceptance advancing the
  project refresh marker.
- Update task tracking and release metadata for the fix.

## Out Of Scope
- New UI for project membership or online presence.
- Invitation creation, revocation, role mutation, or removal semantics.
- Targeted client-side patching for membership rows; a full dashboard refresh is
  acceptable for this membership-change event.

## Acceptance Criteria
1. Successful project invitation acceptance advances the project activity
   version observed by the existing project live-refresh stream.
2. Viewer invitees can trigger the membership-refresh marker only through the
   accepted-invitation path; editor-only content activity behavior remains
   unchanged.
3. Owner-only collaboration management APIs and project authorization
   boundaries remain unchanged.
4. Tests cover the acceptance path and the membership activity touch behavior.
5. The GitHub issue is linked from the PR and repository task tracking is
   updated.

## Definition Of Done
- [x] Root cause is identified in the invitation acceptance and project activity
      flow.
- [x] A membership-specific activity touch is implemented.
- [x] Invitation acceptance calls the activity touch after successful accept.
- [x] Focused service tests cover the regression.
- [x] Local validation passes for the required baseline.
- [ ] Branch is pushed and a ready-for-review PR is opened.
- [ ] Copilot review/check feedback is monitored and handled.

## Validation Plan
- Focused during development:
  - `npm test -- tests/lib/project-activity-service.test.ts tests/lib/project-collaboration-service.test.ts`
- Before handoff:
  - `npm run lint`
  - `npm run rls:check`
  - `npm test`
  - `npm run test:coverage`
  - `npm run build`

## Evidence
- Root cause: invitation acceptance did not advance `Project.updatedAt` or
  create a typed activity event, so existing SSE/polling clients had no newer
  project activity version to observe after a member joined.
- Added `app.touch_project_membership_activity(...)`, which validates the
  authenticated invitee, accepted invitation, actor email, and resulting
  membership before updating the project activity marker.
- `respondToProjectInvitation(...)` now touches the membership activity marker
  after successful acceptance, causing existing project activity SSE/polling
  clients to observe a newer project version and refresh.
- Validation passed:
  - `npm test -- tests/lib/project-activity-service.test.ts tests/lib/project-collaboration-service.test.ts`
  - `npm test -- tests/lib/app-metadata.test.ts`
  - `npm run lint`
  - `npm run rls:check`
  - `npm run release:check -- --base origin/main --branch fix/task-320-project-membership-live-refresh`
  - local PostgreSQL `npm test` (124 files passed, 2 skipped; 924 tests passed,
    2 skipped)
  - `npm run db:migrate`
  - `npm run test:coverage` (91.37% statements, 81.33% branches, 92.2%
    functions, 91.88% lines)
  - `npm run build` with local-safe placeholder production secrets
  - `git diff --check`
- Initial bare `npm test` failed because `DATABASE_URL` was not set in the
  shell and stale app metadata assertions still expected `v0.22.0`; rerunning
  with local database env after deriving those assertions from `package.json`
  passed.
