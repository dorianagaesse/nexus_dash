# Current Task: TASK-119 Project Collaboration Presence UX

## Task ID
TASK-119

## Status
PR open. Copilot review feedback addressed.

## Branch
`feature/task-119-project-collaboration-presence-ux`

## Source
- `tasks/backlog.md`
- Dependencies and existing implementation context from TASK-058, TASK-082, and
  TASK-089.

## Objective
Add a compact collaborator presence experience to project pages so project
members can quickly see who has access to the project, with avatar-backed
identity affordances that reuse the existing generated avatar baseline and
project membership authorization rules.

## Context
- TASK-058 shipped project sharing, membership roles, owner-managed
  invitations, and service-layer project authorization.
- TASK-082 added user-facing account identity fields such as display names,
  username tags, and account settings identity management.
- TASK-089 added deterministic generated avatars through `User.avatarSeed`,
  `resolveAvatarSeed(...)`, and `UserAvatar`.
- Current project pages already derive the actor role from
  `getProjectSummaryById(...)`, while the Kanban section loads collaborator
  identities through `listProjectCollaborators(...)` for assignees and mentions.
- Owner settings already fetch a full `ProjectSharingSummary`, but that path is
  owner-only and should not become the general member-visible presence source.

## Scope
- Add a member-visible project presence affordance near the project dashboard
  header, using a compact avatar stack or similarly dense collaboration surface.
- Show current project members with generated avatars, display names, roles, and
  secondary identity where useful, while avoiding repeated or noisy identity
  copy.
- Include the signed-in actor in the presence data and clearly distinguish their
  own role without implying live online/offline status.
- Support owner, editor, and viewer access through a service-layer read path
  that requires at least project viewer membership.
- Preserve owner-only collaboration management in the existing settings panels;
  this task is about awareness on the project page, not editing invitations or
  roles.
- Keep the UI responsive on mobile and desktop without overlapping the project
  title, action buttons, or dashboard stats.
- Reuse existing avatar, role-formatting, and collaborator identity helpers
  where they fit; avoid introducing remote image dependencies or a separate
  avatar system.

## Out Of Scope
- Real-time online presence, cursor presence, or active editing indicators.
- New uploaded profile photo support.
- Changes to invitation creation, role mutation, or member removal workflows.
- Calendar/member availability semantics.
- Agent credential avatars or agent presence on project pages.

## Implementation Notes
- Start with:
  - `app/projects/[projectId]/page.tsx`
  - `lib/services/project-service.ts`
  - `components/ui/user-avatar.tsx`
  - `components/project-dashboard/project-dashboard-owner-actions.shared.ts`
  - `components/project-dashboard/project-dashboard-owner-access-panel.tsx`
  - `components/kanban-board-types.ts`
  - `tests/lib/project-service.test.ts`
  - `tests/components/*project*`
- Consider either extending `ProjectSummaryWithStatsRecord` with a small
  `members` payload or adding a focused service such as
  `listProjectPresenceMembers(projectId, actorUserId)`. Prefer the option that
  avoids extra broad queries and keeps `getProjectSummaryById(...)` readable.
- The general presence read path must not call the owner-only
  `getProjectSharingSummary(...)`; that service should remain tied to project
  settings management.
- If the surface needs a hidden overflow list or popover for larger projects,
  use stable dimensions and accessible labels so the avatar stack does not
  resize the header unexpectedly.
- Ensure fallback avatars come from `resolveAvatarSeed(user.avatarSeed, user.id)`
  and existing `UserAvatar` rendering.
- If project membership query shape changes, check RLS assumptions and update
  RLS inventory only if new persistence or policy coverage is introduced.

## Acceptance Criteria
1. Project pages show a compact collaborator presence affordance for every actor
   with at least viewer access to the project.
2. The affordance renders generated avatars and identity labels for project
   members, including accounts without uploaded photos.
3. Roles are visible or discoverable for listed members, and the current actor's
   own role remains clear.
4. Owner-only management behavior remains unchanged; non-owners do not gain
   access to invitation or member-management APIs.
5. The UI works on narrow and wide viewports without text overlap, layout shift,
   or clipped action controls.
6. Tests cover service authorization/tenancy, member identity mapping, avatar
   fallback behavior, and representative UI rendering.

## Definition Of Done
- [x] Active project context, membership services, and avatar components are
      reviewed.
- [x] A member-visible project presence data path is implemented in
      `lib/services/**` with viewer-or-higher authorization.
- [x] Project dashboard header renders the presence affordance with accessible
      avatar/name/role semantics.
- [x] Existing owner settings sharing and access panels continue to work
      unchanged.
- [x] Unit/component coverage is added or updated for the new service/UI path.
- [x] Local validation passes for the required baseline.
- [x] `tasks/current.md` and `journal.md` are updated with implementation and
      validation evidence before handoff.

## Validation Plan
- Focused during development:
  - `npm test -- tests/lib/project-service.test.ts`
  - relevant component tests for the project dashboard/header or new presence
    component
- Before handoff:
  - `npm run lint`
  - `npm run rls:check`
  - `npm test`
  - `npm run test:coverage`
  - `npm run build`
- Run `npm run test:e2e` if the final implementation materially changes the
  project dashboard layout or navigation behavior beyond the header affordance.

## Evidence
- Implemented a server-rendered project collaborator presence block in the
  dashboard header, powered by the existing `listProjectCollaborators(...)`
  viewer-or-higher service path.
- Reused generated `UserAvatar` rendering, added optional avatar `title`
  support, included role/name rows plus screen-reader-only full member context,
  and kept sharing/settings management owner-only.
- Added responsive title wrapping with `overflow-wrap:anywhere` after visual
  validation exposed long project names overflowing on mobile.
- Added `tests/components/project-collaboration-presence.test.tsx` for member
  count, actor role, avatar rendering, overflow, and empty rendering behavior.
- Local dev server started at `http://127.0.0.1:3000`; standalone Playwright
  visual checks captured `.tmp/task119-presence-desktop.png` and
  `.tmp/task119-presence-mobile.png`, confirming the presence block and long
  project title fit desktop and 390px mobile viewports. The probe also surfaced
  an existing meeting-notes search input hydration warning unrelated to this
  component.
- Validation passed:
  - `npm run lint`
  - `npm run rls:check`
  - `npm test` with local PostgreSQL env (125 files passed, 2 skipped; 925
    tests passed, 2 skipped)
  - `npm run test:coverage` (91.37% statements, 81.33% branches, 92.2%
    functions, 91.88% lines)
  - `npm run build` with local-safe placeholder production secrets
  - `PORT=3001 npm run test:e2e` with local PostgreSQL env and outbound email
    disabled (9 passed)
- PR #347 CI initially caught stale app-metadata fallback expectations pinned to
  `v0.22.0`; updated the tests to derive the fallback from `package.json`.
  Focused `tests/lib/app-metadata.test.ts`, full PostgreSQL-backed `npm test`,
  and `npm run lint` passed after the fix.
- Copilot review feedback addressed by marking visual member rows
  `aria-hidden` while keeping the full screen-reader collaborator summary, and
  by passing the project-page collaborator payload into `KanbanBoardSection` to
  avoid a second collaborator query in the same dashboard request.
- Post-review validation passed:
  - `npm test -- tests/components/project-collaboration-presence.test.tsx`
  - `npm run lint`
  - PostgreSQL-backed `npm test`
  - `npm run build`
- Screenshot follow-up addressed:
  - presence header now renders avatars only, with hover titles showing each
    member's username tag or display name fallback
  - dashboard stats use equal responsive columns so Attachments and Calendar no
    longer collapse into narrow one-column cards
  - verified at `1462x425` with `.tmp/task119-followup-desktop.png`
- Owner highlight follow-up addressed:
  - project owner avatar now receives a thicker primary border while other
    member avatars remain borderless
  - focused presence component test, `npm run lint`, and local-safe
    `npm run build` passed
