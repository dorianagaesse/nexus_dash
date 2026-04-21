# Current Task: TASK-089 Automatic Avatar Creation - Generated Identity Avatar Baseline

## Task ID
TASK-089

## Status
Implemented locally on branch `feature/task-089-generated-avatar-baseline`;
local validation is complete and the task is ready for the repository review /
PR path.

## Objective
Introduce a deterministic generated-avatar baseline with persisted seed and
user-triggered regeneration so NexusDash can render a consistent visual
identity across account-owned surfaces now and unblock later collaboration
surfaces without waiting for a full profile-photo management feature.

## Why This Task Matters
- The data model already supports optional user images, but only social-auth
  users reliably get one today. Credentials users still appear as text-only
  identities across the product.
- Upcoming collaboration and task-provenance work benefits from a reusable
  avatar foundation instead of inventing ad hoc text badges for every new
  person-oriented surface.
- `TASK-101` needs a clean visual identity affordance for assignee,
  created-by, and modified-by metadata. Shipping a baseline avatar system first
  reduces rework and gives those future surfaces a stronger default UX.
- `TASK-119` is intended to expose collaborator presence on project pages, and
  that feature should build on a shared avatar primitive rather than defining a
  second identity presentation model.

## Current Baseline Confirmed In Repo
- `User.image` already exists in `prisma/schema.prisma`.
- Social auth ingestion already preserves provider-supplied avatar URLs in
  `lib/services/social-auth-service.ts`.
- Human-readable identity summaries already exist via:
  - `lib/services/account-identity-service.ts`
  - `lib/services/account-profile-service.ts`
  - `lib/services/project-collaboration-service.ts`
  - `lib/services/project-task-comment-service.ts`
- The top-right signed-in affordance currently shows text identity only through
  `components/account-menu.tsx` and `components/top-right-controls.tsx`.
- The account page (`app/account/page.tsx`) already exposes identity/settings
  surfaces, but it does not yet render avatar state or avatar-specific copy.

## Working Product Assumptions
- `TASK-089` ships a generated avatar baseline, not a full avatar-management
  system.
- The generated avatar is the active account avatar for this milestone, even if
  provider-supplied `user.image` exists today.
- The visual should be deterministic from a stable persisted seed until the
  user explicitly regenerates it.
- The generated avatar must not depend on external avatar services.
- The generated avatar must stay privacy-safe and cheap to compute:
  - no external fetch
  - no separate object storage pipeline
  - no requirement for uploaded image assets
- A user must be able to regenerate the avatar from the account page without
  needing admin involvement or direct database changes.
- The baseline should be reusable by future task/collaboration work, but this
  task should not broaden into task ownership/provenance or project presence
  rollout by itself.

## Scope
- Add a reusable avatar rendering primitive for NexusDash identity surfaces.
- Add deterministic generated-avatar helpers, including:
  - stable seed handling
  - color/style derivation
  - pixel-pattern generation
- Persist a generated-avatar seed on the user record so the avatar remains
  stable until explicit regeneration.
- Extend account-level identity data flow so the signed-in shell and account
  surfaces can render resolved avatar state.
- Add account-level avatar regeneration through the existing account-management
  flow.
- Apply the new avatar baseline to the first consumer surfaces:
  - top-right account icon/menu
  - account/settings identity surfaces
  - task comments
  - project settings contributors tab
- Add targeted regression coverage for avatar resolution and the first UI
  consumer surfaces.
- Update tracking docs in the same task PR.

## Out Of Scope
- User-uploaded avatar management or avatar file storage.
- Rendering provider-supplied `user.image` through the shared avatar path.
- Project-page collaborator presence rollout; that belongs to `TASK-119`.
- Task-surface avatar rollout for:
  - assignee
  - created-by / modified-by
  Those are expected follow-ons for `TASK-101`.
- Notification, activity-feed, or presence semantics.
- Reworking auth or social-account linking behavior.

## Desired Follow-On Consumers
These are not all part of `TASK-089`, but this task should make them easy:
- After `TASK-089` + `TASK-101`, avatars should be usable in:
  - assignee display
  - created-by / modified-by metadata
  - top-right account icon
  - settings/account identity surfaces
  - task comments
  - project settings contributors
- Later, `TASK-119` should reuse the same avatar foundation for:
  - project-page collaborator presence and member rows

## Design Constraints
### 1. Determinism
- A given user should receive the same generated avatar every time.
- The seed should prefer a stable principal identifier and not rely only on
  mutable presentation text.

### 2. Fallback Quality
- The generated fallback should feel intentional rather than like a generic
  placeholder.
- If initials are used, they should complement the visual treatment rather than
  becoming the entire design.

### 3. Reusability
- The avatar primitive should support future compact and expanded contexts:
  - menu trigger
  - inline person metadata
  - collaborator rows
  - task provenance chips

### 4. Safe Incremental Rollout
- First ship the avatar baseline in account-owned surfaces that already exist.
- Avoid coupling this task to collaboration-presence or task-provenance schema
  changes.

## Likely Implementation Touchpoints
- `components/account-menu.tsx`
- `components/top-right-controls.tsx`
- `app/account/page.tsx`
- `app/account/settings/**` if settings-shell identity chrome is updated
- `components/kanban/task-detail-modal.tsx`
- `components/project-dashboard/project-dashboard-owner-access-panel.tsx`
- `lib/services/account-identity-service.ts`
- `lib/services/account-profile-service.ts`
- `lib/services/project-task-comment-service.ts`
- `lib/services/project-collaboration-service.ts` if shared identity types are
  expanded for future reuse
- a new shared avatar helper under `lib/**`
- a new shared avatar UI component under `components/**`
- relevant `tests/**`

## Expected Output
- an active `tasks/current.md` brief for `TASK-089`
- a reusable avatar component + deterministic generated-avatar helpers
- persisted avatar seed + account-page regeneration flow
- top-right account/menu avatar rendering
- account/settings identity surfaces updated to use the generated avatar
  baseline
- task comments and project-settings contributor rows updated to use the shared
  avatar baseline
- aligned tests and documentation updates
- a dedicated task branch and PR that follow the repository shipping workflow

## Acceptance Criteria
- Users render a deterministic generated avatar from a stable persisted seed.
- Users can regenerate their avatar from the account page and immediately see
  the updated result on account-owned surfaces.
- The top-right signed-in account affordance uses the new avatar system.
- Account/settings identity surfaces use the new avatar system.
- Task comments use the new avatar system.
- Project settings contributor rows use the new avatar system.
- The avatar baseline is implemented in a reusable way that can support
  `TASK-101` and `TASK-119` without redesigning the primitive.
- Required tracking docs are updated consistently in the same PR.

## Definition Of Done
1. `TASK-089` is the active task in `tasks/current.md`.
2. The avatar baseline is implemented end to end across helpers and the first
   account-owned UI surfaces.
3. Validation is green for the relevant scope:
   - `npm run lint`
   - `npm test`
   - `npm run test:coverage`
   - `npm run build`
   - `npm run test:e2e` if the final UI changes materially affect an existing
     covered authenticated flow and local prerequisites are available
4. Tracking docs are updated consistently (`tasks/current.md`, `journal.md`,
   `adr/decisions.md` if the final design introduces an architecture-level
   identity-rendering decision).
5. The task ships through a dedicated PR whose title includes `TASK-089`, with
   Copilot's initial review state monitored and any valid feedback handled
   before handoff.

## Dependencies
- `TASK-047`
- `TASK-082`

## Evidence Plan
- Repo source of truth:
  - `agent.md`
  - `project.md`
  - `README.md`
  - `prisma/schema.prisma`
  - `lib/services/social-auth-service.ts`
  - `lib/services/account-identity-service.ts`
  - `lib/services/account-profile-service.ts`
  - `components/account-menu.tsx`
  - `components/top-right-controls.tsx`
  - `app/account/page.tsx`
- Validation source of truth:
  - local lint/unit/coverage/build runs
  - PR checks: `check-name`, `Quality Core`, `E2E Smoke`, and
    `Container Image`

## Outcome Target
- NexusDash gains a consistent visual identity baseline for every user, even
  without uploaded photos.
- The resulting avatar system should make `TASK-101` and `TASK-119` additive
  consumer rollouts rather than forcing a second identity-UI rewrite.

---

Last Updated: 2026-04-21
Assigned To: Agent
