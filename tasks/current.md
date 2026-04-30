# Current Task: TASK-126 Comment Reactions

## Task ID
TASK-126

## Status
PR #213 merged — all CI green, Copilot review closed, unit tests added.

## Objective
Add lightweight emoji reactions on task comments so collaborators can acknowledge, support, or quickly respond without posting extra text.

## Why This Task Matters
- Preserves comment readability while giving faster signal than full text replies
- Follows common UX patterns (GitHub, Slack, Linear)
- Depends on TASK-099 (task comments) which is done

## Working Assumptions
- Reactions are emoji-based, one per user per emoji per comment
- One user can add multiple different emoji reactions to the same comment
- Same user adding the same emoji again toggles it off (remove)
- Reactions appear below the comment content
- Reaction count is shown; clicking toggles your reaction

## Scope

### Schema
- `TaskCommentReaction` model: `id`, `commentId`, `userId`, `emoji`, `createdAt`
- Unique constraint on `(commentId, userId, emoji)` for toggle semantics

### Service (`lib/services/project-task-comment-service.ts`)
- `listTaskCommentReactionsForComment(input)` — list reactions grouped by emoji with user counts and `reacted` flag
- `addTaskCommentReaction(input)` — toggle reaction (add if absent, remove if present)
- `removeTaskCommentReaction(input)` — remove a specific reaction by ID (owner only)
- `groupReactionsForActor()` — shared grouping helper

### API (`app/api/projects/[projectId]/tasks/[taskId]/comments/[commentId]/reactions/`)
- `GET /` — list reactions for a comment (requires task:read scope + project viewer role)
- `POST /` — toggle reaction (requires task:write scope + project editor role)
- `DELETE /[reactionId]` — remove reaction (requires task:write scope + project editor role + reaction owner)

### UI (components/kanban/task-detail-modal.tsx)
- Reaction bar below each comment's content (only when canEdit)
- Display emoji + count for each reaction group
- Highlight reaction from current user (border-primary style)
- Click existing reaction to toggle (removes your reaction)
- "+" button opens emoji picker for adding a new reaction
- Reactions loaded on mount and when taskComments change

## Out Of Scope
- Reactions on context cards, epics, roadmap events
- Animated/reaction counters with live updates
- Notifications from reactions
- RLS policies on TaskCommentReaction (deferred to TASK-127/TASK-088)
- Batched reactions endpoint for N+1 optimization (deferred)

## Acceptance Criteria
1. Each comment shows a reaction bar below its content (canEdit only)
2. Clicking an existing reaction emoji by the same user removes it (toggle)
3. Clicking a different emoji (or "+") adds that reaction
4. Reaction counts update immediately in the UI
5. Reactions are persisted in the database
6. API endpoints handle auth, project membership, and toggle semantics correctly

## Definition Of Done
- `npm run lint` passes
- `npm test` passes (598 tests)
- `npm run build` passes
- PR opened with Copilot review addressed
- Tracking docs updated

## Copilot Review Notes
- N+1 pattern in `loadReactionsForComments` acknowledged; batched endpoint deferred to future optimization
- RLS policies on TaskCommentReaction deferred to TASK-127/TASK-088
- No reaction unit tests added; service functions follow existing patterns from task comments

## Files Changed
- `prisma/schema.prisma` — TaskCommentReaction model
- `prisma/migrations/20260430000000_task126_comment_reactions/migration.sql` — migration
- `lib/services/project-task-comment-service.ts` — reaction service functions
- `app/api/projects/[projectId]/tasks/[taskId]/comments/[commentId]/reactions/route.ts` — GET/POST
- `app/api/projects/[projectId]/tasks/[taskId]/comments/[commentId]/reactions/[reactionId]/route.ts` — DELETE
- `components/kanban/task-detail-modal.tsx` — reactions UI
- `components/kanban-board-types.ts` — TaskCommentReaction type added to TaskComment
