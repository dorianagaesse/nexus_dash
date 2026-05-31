# TASK-307 Agent Comment Credential Identity

## Status
Pending

## Source
- User request on 2026-05-31 after PR #307 merge.

## Objective
Render agent-authored task comments with the project agent credential label plus
` (agent)` and a shared robot-head-style avatar, so agent activity is visibly
distinct from the credential owner while staying inside the current
project-scoped agent access model.

## Current Behavior
- Agent bearer tokens resolve to the credential owner's user id for service and
  RLS execution.
- Task comments persist `authorUserId`, so agent-authored comments display as
  the credential owner in comment threads.
- Agent assignment and mention notifications already carry `actorKind`,
  credential id, and credential label metadata for notification copy.

## Scope
- Task comment persistence and API response changes needed to identify
  agent-authored comments after reload.
- Comment thread UI display name logic: `<credential label> (agent)`.
- Shared agent avatar visual, robot-head-like, used for all agent-authored
  comments.
- Backward-compatible behavior for existing comments and human comments.
- Tests for agent comment create, list, and render behavior.

## Out Of Scope
- Full separate agent user accounts.
- Per-agent custom avatars.
- Changing human comment identity.
- Agent identity for non-comment surfaces unless needed for consistency with
  comment notifications.

## Acceptance Criteria
1. When an agent creates a task comment, the comment thread displays the
   credential label followed by ` (agent)`.
2. Agent comments render with the shared robot-head-like avatar; all agents use
   the same avatar.
3. Human comments continue to render the human author name and avatar unchanged.
4. Agent comment identity survives page refresh and comment list API reloads.
5. Older comments without agent credential metadata remain readable and fall
   back safely.
6. Mention and assignment notification copy remains consistent with
   credential-label agent attribution.
7. Tests cover API/service persistence and comment UI rendering for agent and
   human comments.

## Definition Of Done
- The data model or comment metadata can distinguish agent-authored comments
  without changing the authorization principal used for agent requests.
- Task comment create/list routes return enough author presentation data for
  the UI to render agent identity consistently.
- The task detail comment thread renders the agent credential label with
  ` (agent)` and the shared robot-head avatar.
- Focused automated coverage passes for agent comment author presentation,
  human comment regression behavior, and legacy comment fallback behavior.
- Tracking docs and any relevant API/onboarding documentation are updated.

## Implementation Notes
- Investigate whether to store credential id plus label snapshot on
  `TaskComment`, or a structured comment-author metadata field. A label snapshot
  avoids historical comments changing if credentials are renamed.
- Keep authorization and RLS actor behavior unchanged: agent requests should
  still execute under the credential owner principal.
- Prefer a local component or deterministic avatar seed for the shared
  robot-head avatar; do not depend on remote image assets.
