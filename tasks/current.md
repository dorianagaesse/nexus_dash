# Current Task

## Task

- ID: TASK-355
- Title: Reduce meeting-todo overdue grace to 24 hours
- Status: In progress (2026-08-05)
- Branch: `fix/task-355-meeting-todo-overdue-grace`
- Pull request: TBD
- Brief: [`task-355-meeting-todo-overdue-grace.md`](./task-355-meeting-todo-overdue-grace.md)
- Issue: [#413](https://github.com/dorianagaesse/nexus_dash/issues/413)

## Objective

Tighten the meeting-todo overdue rule from a seven-day grace to a one-day grace,
applied uniformly through `MEETING_TODO_OVERDUE_GRACE_DAYS` so every consumer
agrees on which todos count as overdue.

## Scope

- Replace `7` with `1` in
  `lib/meeting-todo.ts:MEETING_TODO_OVERDUE_GRACE_DAYS`.
- Replace `7` with `1` in
  `lib/services/project-notification-email-service.ts:MEETING_TODO_OVERDUE_DAYS`.
- Keep `isMeetingTodoOverdueAt`, `buildProjectMeetingTodos`,
  `listProjectMeetingTodos`, `getProjectMeetingTodoNavigationSummary`, and the
  optimistic recompute in
  `components/meeting-todos/project-meeting-todos.tsx` reading from the new
  value; no signature or caller changes.
- Adjust unit, service, and Playwright coverage for the new boundary.
- Bump the package version with `npm run release:version -- patch` and add a
  matching `v0.35.1` CHANGELOG entry.

## Out Of Scope

- Branching from the TASK-354 feature branch; this branch comes directly from
  `origin/main`.
- Removing the grace period entirely or introducing a per-todo due date
  (issue #413, options 2 and 4).
- UI copy, badge wording, or layout changes anywhere; the new rule propagates
  automatically.
- Changing dispatcher cadence, recipient grouping, debounce, or the
  notification-email runbook beyond keeping `MEETING_TODO_OVERDUE_DAYS`
  consistent.

## Runtime Assumptions

- Active baseline is `origin/main` at the tip that already shipped TASK-353
  (`v0.35.0`).
- Local PostgreSQL and `.env` are unchanged.
- Browser validation uses the existing project meeting-todo fixture.
- If preview validation is required, it uses
  `git_ref=fix/task-355-meeting-todo-overdue-grace` explicitly.

## Acceptance Criteria

1. `MEETING_TODO_OVERDUE_GRACE_DAYS` equals `1` and is the single number every
   consumer relies on.
2. `MEETING_TODO_OVERDUE_DAYS` in the notification dispatcher is `1` and
   matches the same definition.
3. `isMeetingTodoOverdueAt` reports `true` for an open todo whose source
   meeting is more than 24 hours old and `false` for one whose source meeting
   is within the last 24 hours, both via the service projection used by the
   navigation badge and the meeting-todo list, and via the helper used
   directly by `buildProjectMeetingTodos`.
4. The Todos page row badge, the dashboard meeting-todos summary card, the
   TASK-354 navigation badge, and the notification email dispatcher all
   classify the same todo identically.
5. `done` (archived) meetings continue to suppress overdue for their todos.
   Completed (`completedAt != null`) todos continue to suppress overdue as
   well.
6. The optimistic recompute path in
   `components/meeting-todos/project-meeting-todos.tsx` matches the server
   classification for the boundary cases (just over 24 hours, just under,
   and exactly 24 hours minus a millisecond).
7. Unit, service, and Playwright coverage exercise the boundary.
8. The product version advances from `v0.35.0` to `v0.35.1` with matching
   CHANGELOG and lockfile metadata.
9. `tasks/current.md`, `tasks/backlog.md`, and `journal.md` reflect the
   active task and execution events in the same PR.

## Definition Of Done

- Single source of truth (`MEETING_TODO_OVERDUE_GRACE_DAYS`) holds the only
  copy of the number; `MEETING_TODO_OVERDUE_DAYS` is updated in the same
  commit and not duplicated elsewhere.
- All existing project isolation, RLS, and authorization boundaries remain
  intact.
- `npm run lint`, `npm run rls:check`, `npm test`, `npm run test:coverage`,
  `npm run build`, `npm run release:check -- --base origin/main --branch fix/task-355-meeting-todo-overdue-grace`,
  and the focused meeting-todo Playwright flow pass.
- The branch is committed and pushed, a ready-for-review PR is open, and the
  initial Copilot review/check outcome is handled without merging the PR.

## Progress

- Confirmed the issue, opened tracking docs, branched from `origin/main`.
- Pending: code change, tests, version bump, validation, PR.

## Validation

- Pending — see Definition Of Done.
