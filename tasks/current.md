# Current Task

## TASK-382: Kanban Task Search and Clickable Label Filters

## Status

Implementation, local validation, and Preview QA complete in open PR #469 on
`feature/task-382-kanban-task-search-label-filters`.

## Objective

Help project members find relevant active or archived Kanban tasks quickly by
combining server-authorized task-text search with local multi-label filtering,
without weakening project isolation or making filtered drag-and-drop reorder
hidden tasks unexpectedly.

## Product Decisions

- Search is a human-session-only project API because it spans comments and
  related task content that is not part of the agent task-list contract.
- Search requests debounce for 200 ms, cancel stale work, and retain the last
  applied results while a newer request loads so the board does not flash or
  collapse during typing.
- Every selected label must match (`AND` semantics). Search and label filters
  also compose with `AND`.
- Archived matches contribute to the result count and automatically expose the
  existing Done archive; archived cards remain read-only and non-draggable.
- Filtered drops are translated back to complete persisted columns. Hidden
  tasks keep their relative order, and visible destination cards act as stable
  insertion anchors.
- Filter state is component-local and resets after fresh navigation; URL
  persistence is intentionally deferred.

## Scope

- Add an accessible toolbar above the Kanban lanes with a labeled search
  input, clear action, available-label toggles, active-filter presentation,
  polite visible/total result count, clear-label, and clear-all actions.
- Add `GET /api/projects/{projectId}/tasks/search?q=...` for authenticated human
  sessions, with a trimmed 1-200 character query and `{ taskIds: string[] }`
  response.
- Search authorized active and archived tasks case-insensitively across title,
  rich description text, `ND-*` reference, status, comments, labels, Epic
  name, assignee name/user tag, blocker/follow-up text, attachment names, and
  related-task titles without returning comment bodies.
- Re-run active search after relevant local or remote task/comment mutations,
  excluding pure reorder events.
- Make task-card label chips keyboard-operable filter buttons that do not open
  or drag the card.
- Filter active and archived tasks, expose matching archived results, and keep
  desktop/mobile counts and empty states aligned with visible results.
- Add focused utility, component, route/service, and Playwright coverage.

## Out Of Scope

- Epic filtering (TASK-384), URL-backed filter state, saved searches, search
  suggestions, fuzzy ranking, or pagination.
- Agent bearer-token search, agent/OpenAPI contract changes, database schema or
  migration changes, README changes, project blueprint changes, or an ADR.
- Making archived tasks draggable or replacing the existing Done archive.
- Integrating TASK-381's bounded-lane code or depending on its open PR.

## Runtime Assumptions

- The worktree starts from `origin/main` commit `77686d6`; TASK-381 remains an
  independent open PR and is not part of this branch.
- Existing PostgreSQL task/comment/attachment/relation data is sufficient; no
  persistence migration is required.
- Persistence access remains in `lib/services/**`, and project authorization is
  enforced inside the search service under the authenticated actor's RLS
  context.
- The assignment explicitly reprioritizes TASK-382 ahead of pending TASK-100,
  TASK-133, and TASK-108 dependencies while preserving their remaining scope.
- Copilot review is unavailable because the account is out of credits. The
  user will perform a DeepSeek review after delivery.
- Preview validation uses
  `feature/task-382-kanban-task-search-label-filters` as the explicit workflow
  `git_ref`.

## Acceptance Criteria

1. A toolbar above the lanes exposes an accessible debounced search field,
   clear search action, available and active label controls, clear-label and
   clear-all actions, and a polite `shown / total` result count.
2. The human-session-only search endpoint accepts only trimmed 1-200 character
   queries and returns authorized project task IDs, including archived tasks,
   with case-insensitive matches for every required field and no comment-body
   disclosure.
3. Search cancels stale requests, retains the last applied result while newer
   work loads, exposes a recoverable inline failure, and refreshes after
   relevant task/comment mutations but not pure reorders.
4. Multiple labels use `AND`; search and labels use `AND`. Card label chips are
   keyboard-operable `aria-pressed` filter buttons whose pointer/keyboard
   activation neither opens nor drags the task card.
5. Active and archived filtering, archive disclosure, lane/mobile counts,
   visible/total totals, no-result states, and viewer behavior stay mutually
   consistent.
6. Filtered pointer and keyboard drops preserve hidden-task relative order and
   map visible destinations to full-column anchors: before a visible target,
   after the last visible task, or at full-column end when none are visible.
7. The toolbar and card controls remain usable at 375 px and mobile landscape,
   in light/dark themes, with keyboard-only operation and reduced motion.
8. Focused automated coverage proves every indexed search field, project
   isolation, validation, failure recovery, label semantics, archive behavior,
   viewer filtering, mutation refresh, and hidden-interleaved drag ordering.

## Definition Of Done

- Acceptance criteria are satisfied with persistence isolated in a service and
  thin route/component boundaries.
- UI/UX Pro Max guidance is applied for search priority, visible focus,
  44 px touch targets, announced result/error feedback, stable loading state,
  responsive containment, and theme parity.
- `git diff --check`, feature release-policy validation, `npm run lint`,
  `npm run rls:check`, `npm test`, `npm run test:coverage`, `npm run build`, and
  `npm run test:e2e` pass.
- Explicit-ref Preview deployment succeeds and the focused TASK-382 scenarios
  plus existing Kanban smoke pass against the immutable Preview URL.
- The branch is pushed and a ready-for-review PR remains open and unmerged with
  required GitHub checks green. Copilot's credit blocker is recorded for the
  user's post-delivery DeepSeek review.
- `tasks/current.md`, `tasks/backlog.md`, `CHANGELOG.md`, and `journal.md` are
  consistent, and the handoff records PR, commits, validation, Preview, and
  review state.
