# Current Task: TASK-124 Comment Mentions

## Task ID
TASK-124

## Status
Implementation follow-up in progress after autocomplete visibility bug.

## Objective
Implement @username#discriminator project-member tagging in task comments with:
- Floating dropdown autocomplete below cursor for member selection
- Highlighted mention rendering in comments, task content, card content, epic descriptions, and roadmap event descriptions
- Notification creation routed to the in-app notification center for mentioned users

## Why This Task Matters
- Enables users to tag project members in comments for better collaboration
- Mentioned users receive notifications through the existing notification center (TASK-123)
- Follows standard UX patterns from tools like Slack, GitHub, and Linear

## Current Baseline Confirmed In Repo
- `lib/mention.ts` - Core mention parsing utility with regex `@([a-zA-Z0-9_]{1,20})(?:#([a-zA-Z0-9]{1,4}))?(?![a-zA-Z0-9_])/g`
- `lib/services/notification-service.ts` - Contains `createTaskCommentMentionNotification` and `resolveTaskCommentMentionNotifications` functions
- `lib/services/project-collaboration-service.ts` - Contains `searchProjectMembersForMention` function
- `lib/services/project-task-comment-service.ts` - `createTaskCommentForProject` wires mention detection and notification creation
- `components/ui/mention-autocomplete.tsx` - Floating dropdown component with member search
- `components/kanban/task-detail-modal.tsx` - Renders comments with highlighted mentions
- `components/kanban-board.tsx` - Passes projectId to TaskDetailModal
- `components/account/notification-center-list.tsx` - Handles `task_comment_mention` notification type

## Product Direction
- Floating dropdown appears below cursor when @ is typed in comment input
- Floating dropdown also appears below cursor in task description rich-text editors
- Dropdown shows project members filtered by search query (username match)
- Keyboard navigation: Arrow keys to move, Enter to select, Escape to dismiss
- Selected mention replaces the @query with @username#discriminator
- Highlighted mentions render with styled span in comment display
- Notifications are created for mentioned users (excluding self-mentions)

## Working Assumptions For This Task
- Mentions follow pattern: @username or @username#discriminator
- Only project members can be mentioned (resolved via project membership)
- Self-mentions do not create notifications
- Notifications use existing TASK-123 notification center infrastructure

## Scope
- Core mention parsing utility (`lib/mention.ts`)
- Notification service extensions for mention notifications (`lib/services/notification-service.ts`)
- Project member search for autocomplete (`lib/services/project-collaboration-service.ts`)
- API endpoint for member search (`app/api/projects/[projectId]/members/search/route.ts`)
- Comment service mention wiring (`lib/services/project-task-comment-service.ts`)
- Floating autocomplete dropdown (`components/ui/mention-autocomplete.tsx`)
- Highlighted mention rendering (`lib/content-with-mentions.tsx`)
- Task description rich-text autocomplete and read-time mention highlighting
- Task detail modal comment rendering with mentions
- Unit tests for mention parsing (`tests/lib/mention.test.ts`)

## Out Of Scope
- Email, SMS, or push notifications
- Real-time WebSocket updates
- Mention autocomplete outside task comments and task descriptions
- @channel or @everyone group mentions

## Acceptance Criteria
1. Typing @ in comment input or task description shows floating dropdown with project members
2. Dropdown filters as user types to match username
3. Arrow keys navigate, Enter selects, Escape dismisses
4. Selected mention replaces partial input with full @username#discriminator
5. Comments render with highlighted mentions (styled spans)
6. Mentioned users receive notification in notification center
7. Self-mentions do not create notifications
8. Notification displays in notification center with task comment context

## Definition Of Done
- All unit tests pass for mention parsing
- Lint passes with no errors
- Notification center list component handles mention notification type
- Task detail modal renders comments with highlighted mentions
- PR opened and review completed

## Dependencies
- TASK-123 (Notification Center) - Must be complete for mention notifications to route to notification center

## Implementation Summary

### Files Created
1. `lib/mention.ts` - Core mention parsing utility
   - `parseMentions()` - Extract all mentions with position info
   - `containsMentions()` - Check if text has any mentions
   - `extractMentionedUsernames()` - Get unique usernames from mentions
   - `buildMentionString()` - Build mention string from parts
   - `isValidMentionUsername()` - Validate username format

2. `app/api/projects/[projectId]/members/search/route.ts` - Member search API
   - GET endpoint returning project members filtered by query

3. `components/ui/mention-autocomplete.tsx` - Autocomplete dropdown
   - `MentionAutocomplete` component with floating panel
   - `useMentionAutocomplete` hook for search logic
   - Keyboard navigation support

4. `lib/content-with-mentions.tsx` - Highlighted rendering utility
   - `renderContentWithMentions()` function for React rendering

5. `tests/lib/mention.test.ts` - Unit tests for mention parsing

### Files Modified
1. `lib/services/notification-service.ts` - Added mention notification types and functions
2. `lib/services/project-collaboration-service.ts` - Added `searchProjectMembersForMention`
3. `lib/services/project-task-comment-service.ts` - Wired mention detection and notification
4. `components/kanban/task-detail-modal.tsx` - Added projectId prop, mention rendering in comments
5. `components/kanban-board.tsx` - Passed projectId to TaskDetailModal
6. `components/account/notification-center-list.tsx` - Added mention notification type handling

### Follow-up Fixes
1. Mounted mention autocomplete in the task comment composer and task description rich-text editors.
2. Replaced textarea cursor positioning with field-based caret geometry so the dropdown anchors below the active cursor.
3. Raised the autocomplete portal z-index above the task modal.
4. Allowed empty `@` searches to return the initial project member list.
5. Added mention highlighting for rich task descriptions through `RichTextContent`.

## Validation Evidence
- `npm run lint` passes
- `DATABASE_URL=... DIRECT_URL=... npm test` - 89 test files passed, 1 skipped; 666 tests passed, 1 skipped
- `npm test -- --run tests/lib/mention.test.ts` - 37 tests pass
- `npm test -- --run tests/components/rich-text-editor.test.ts` - 38 tests pass
- `npm test -- --run tests/api/task-comments.route.test.ts tests/components/notification-center-list.test.ts tests/lib/mention.test.ts` - 44 tests pass
- `npm run build` passes with local placeholder `DATABASE_URL`, `DIRECT_URL`, `AGENT_TOKEN_SIGNING_SECRET`, and `RESEND_API_KEY` values
- `npx tsc --noEmit` still fails on pre-existing test typing drift around Next async route params and older service-test signatures; build TypeScript passes for the application
