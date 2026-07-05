# TASK-320 Project Membership Live Refresh

## Status
Done (2026-06-26, merged via PR #354; closes GitHub issue #352).

## Source
- GitHub issue #352: Project page does not update when a member joins.
- User report on 2026-06-26.

## Objective
Refresh already-open project pages automatically when an invited user accepts a
project invitation and becomes a member.

## Root Cause
`respondToProjectInvitation(...)` created the `ProjectMembership` and marked the
`ProjectInvitation` accepted, but did not advance the project activity marker
used by `ProjectLiveRefresh`. Because `Project.updatedAt` stayed unchanged and
no typed project activity event was recorded, the SSE stream and polling
fallback had no newer version to emit to existing project dashboards.

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

## Validation Plan
- `npm test -- tests/lib/project-activity-service.test.ts tests/lib/project-collaboration-service.test.ts`
- `npm run lint`
- `npm run rls:check`
- `npm test`
- `npm run test:coverage`
- `npm run build`
