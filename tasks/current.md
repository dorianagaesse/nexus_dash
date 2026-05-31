# Current Task: TASK-307 Agent Comment Credential Identity

## Task ID
TASK-307

## Status
Implemented locally - PR/checks pending

## Source
- User request on 2026-05-31 after PR #307 merge:
  agent-authored task comments should show the agent credential label with
  ` (agent)` and all agents should share the closest available visual to a
  robot-head avatar.
- Backlog entry: `tasks/backlog.md`
- Task brief: `tasks/task-307-agent-comment-credential-identity.md`

## Objective
Make task comments authored through project-scoped agent credentials visibly
attributed to the agent credential, not only to the credential owner, while
preserving the existing security model where agent requests execute under the
credential owner's project membership and RLS principal.

## Investigation Summary
- `TaskComment` currently stores `authorUserId` only. The comment author is
  serialized from the related `User`, so an agent-created comment displays as
  the credential owner after creation and after reload.
- Agent assignment and task comment mention notifications already resolve and
  persist agent-aware actor metadata: `actorKind`, `actorCredentialId`,
  `actorCredentialLabel`, and display copy like `Build bot (agent)`.
- `createTaskCommentForProject` already receives `agentAccess` and resolves
  the credential label for mention notification copy. This is the right place
  to also persist comment author presentation metadata.
- `listTaskCommentsForProject` and the comments route return only the human
  `author` summary today. The UI type `TaskCommentAuthor` is currently a plain
  `TaskPersonSummary`.
- The task detail modal renders comments with `UserAvatar` and
  `comment.author.displayName`, plus an optional username tag. It has no concept
  of a non-human comment author.
- Existing generated avatars are seed-based abstract pixel avatars. The request
  asks for the closest thing available now to a robot head, so the implementation
  should add a small local shared agent avatar component or data URI rather than
  relying on a remote asset.

## Selected Approach
- Add durable agent-author metadata to task comments while keeping
  `authorUserId` as the owner/RLS actor:
  - nullable `authorAgentCredentialId`
  - nullable `authorAgentCredentialLabel`
  - relation to `ApiCredential` with `onDelete: SetNull`
- Store a normalized credential label snapshot when an agent creates a comment.
  The snapshot keeps historical comment attribution stable if the credential is
  renamed later. If the credential is later deleted, old comments can still
  display the stored label.
- Extend the task comment service summary with an author kind:
  - human comments map to the current `TaskPersonSummary`.
  - agent comments map to a dedicated agent author summary using
    `<label> (agent)` or `Agent` if the label is unavailable.
- Extend the comments API response and client types in a backward-compatible
  way so existing comments without agent metadata continue to render as human
  comments.
- Render agent-authored comments in the task detail modal with:
  - display name: `<credential label> (agent)`
  - meta text pointing to the credential owner's human identity when useful
  - a shared local robot-head-like avatar for every agent-authored comment
- Keep mention and assignment notification behavior aligned with the existing
  TASK-265 actor attribution work. This task should not change notification
  semantics unless tests expose an inconsistency.

## Scope
- Prisma schema and migration for task comment agent-author metadata.
- Task comment create/list service mapping and tests.
- Comments route serialization tests.
- Client task comment author types.
- Task detail comment thread rendering for agent vs human authors.
- Shared local agent avatar visual used by all agent comments.
- Focused docs updates for the agent API/comment response shape if the public
  OpenAPI/onboarding schema changes.

## Implementation Summary
- Added nullable `TaskComment` agent-author metadata:
  `authorAgentCredentialId` and `authorAgentCredentialLabel`.
- Kept `authorUserId` as the credential owner's RLS/audit actor while storing a
  credential label snapshot for agent-authored comments.
- Updated task comment create/list mapping so agent comments return
  `<credential label> (agent)`, a shared agent avatar seed, owner metadata, and
  stable credential metadata after reload.
- Added a local shared `AgentAvatar` component using the existing icon system,
  and updated the task detail comment thread to use it for agent-authored
  comments while keeping human comments on the existing generated avatar path.
- Updated the agent OpenAPI/onboarding schema and route notes so clients can see
  the optional agent author metadata on task comment responses.
- Added route coverage for persisted agent identity and label-snapshot fallback,
  plus component coverage for agent vs human comment rendering.

## Out Of Scope
- Separate `User` rows or full account records for agents.
- Per-agent custom avatars.
- Agent identity changes for task assignment fields, activity metadata, or
  reactions unless required to keep comments internally consistent.
- Any change to project membership, RLS, or agent scope enforcement.
- Deploy preview validation unless the implementation PR or review explicitly
  asks for browser verification beyond normal CI.

## Acceptance Criteria
1. When a project-scoped agent credential creates a task comment, the returned
   comment and subsequent list/reload response show the credential label
   followed by ` (agent)`.
2. All agent-authored comments use the same shared robot-head-like avatar.
3. Human-authored comments continue to render the existing human display name,
   username metadata, and generated avatar unchanged.
4. Agent comment identity survives page refresh, API reload, credential rename,
   and credential deletion where a label snapshot exists.
5. Legacy comments without agent metadata remain readable and fall back to the
   existing human author presentation.
6. Agent mention notification copy remains consistent with the credential-label
   attribution already introduced by TASK-265.
7. Automated tests cover service persistence/mapping, route response shape, and
   UI rendering for both human and agent comments.

## Definition Of Done
- A migration and Prisma schema update are committed for task comment
  agent-author metadata.
- `createTaskCommentForProject` persists agent credential id/label snapshot
  when `agentAccess` is present.
- `listTaskCommentsForProject` returns stable agent author presentation data
  for old and new comments.
- The task detail comment thread renders agent comments with
  `<credential label> (agent)` and the shared robot-head-like avatar.
- Human comment behavior remains unchanged in tests.
- Validation baseline passes: `npm run lint`, `npm test`,
  `npm run test:coverage`, and `npm run build`.
- PR is opened from a task branch, Copilot review feedback is handled, and the
  final handoff includes the delivered commit SHA.

## Validation Evidence
- `npx prisma generate` passed.
- `npx prisma validate` passed.
- `npx vitest run tests/api/task-comments.route.test.ts` passed.
- `npx vitest run tests/components/task-detail-modal-comments.test.tsx` passed.
- `npx vitest run tests/api/task-comments.route.test.ts tests/components/task-detail-modal-comments.test.tsx tests/components/agent-onboarding-guide.test.ts tests/app/agent-onboarding-pages.test.ts` passed.
- `npm run lint` passed.
- With local DB env (`DATABASE_URL=postgresql://nexus:nexus@localhost:5432/nexusdash`,
  `DIRECT_URL=postgresql://nexus:nexus@localhost:5433/nexusdash`) `npm test`
  passed: 113 files passed, 2 skipped; 847 tests passed, 2 skipped.
- With the same DB env, `npm run test:coverage` passed: 91.43% statements,
  81.54% branches, 93.42% functions, 91.95% lines.
- With the same DB env plus placeholder production-only secrets,
  `npm run build` passed.
- `npm run test:e2e` rebuilt successfully, then failed before app interaction
  because the local PostgreSQL ports required by the E2E Prisma helpers were not
  reachable (`Test-NetConnection` failed for localhost ports 5432 and 5433);
  `npx prisma migrate deploy` against the same local DB env also failed with a
  schema engine connection error. Remote PR Quality Gates should provide the
  Playwright smoke substitute unless a deploy-preview run is requested.

## Implementation Plan
1. Create a feature branch from current `origin/main` after the planning/docs
   PR is merged or retarget this work onto a feature branch if instructed.
2. Add the Prisma fields and migration for nullable agent credential metadata on
   `TaskComment`.
3. Update task comment service mapping to resolve an explicit comment-author
   union and store label snapshots during agent comment creation.
4. Update the comments route, API tests, and any OpenAPI/onboarding schema that
   documents task comment author shape.
5. Update client comment types and task detail rendering with a shared
   robot-head-like agent avatar.
6. Add or extend component tests for agent comment rendering and route/service
   tests for persistence, reload, credential rename/delete fallback, and human
   regression behavior.
7. Run the full validation baseline and open the implementation PR.

## Open Questions
- None blocking.

## Assumptions
- The displayed agent label should be a historical snapshot from comment
  creation time, not a live credential lookup that changes old comments when a
  credential is renamed.
- The robot-head-like avatar can be a local UI component or generated SVG/data
  URI committed in code, with the same visual for every agent.
- It is acceptable for the comment's underlying `authorUserId` to remain the
  credential owner's user id for authorization, audit continuity, and RLS.
