# TASK-355: Reduce meeting-todo overdue grace to 24 hours

## Status

- In progress
- GitHub issue: [#413](https://github.com/dorianagaesse/nexus_dash/issues/413)
- Branch: `fix/task-355-meeting-todo-overdue-grace`
- Pull request: [#414](https://github.com/dorianagaesse/nexus_dash/pull/414)

## Objective

Tighten the meeting-todo overdue window so a todo whose source meeting was
more than 24 hours ago is flagged as overdue across every consumer (Todos
page, navigation badge from TASK-354, dashboard panel, notification email
dispatcher).

## Problem

`lib/meeting-todo.ts` and `lib/services/project-notification-email-service.ts`
both apply a seven-day grace period before an open todo is treated as
overdue. Users opening the project Todos page right after a meeting note
expect the just-captured follow-ups to already reflect their overdue state,
so a today/yesterday-dated todo reading as "Open" instead of "Overdue" feels
broken even though it is intentional.

## Decision

Reduce the grace period from seven days to one day everywhere it is applied.
Same source-of-truth pattern, same consumers, smaller number.

## In Scope

- `lib/meeting-todo.ts` — `MEETING_TODO_OVERDUE_GRACE_DAYS` from `7` to `1`.
- `lib/services/project-notification-email-service.ts` —
  `MEETING_TODO_OVERDUE_DAYS` from `7` to `1`.
- All callers of `isMeetingTodoOverdueAt`,
  `getProjectMeetingTodoNavigationSummary`, and `listProjectMeetingTodos`
  inherit the new rule with no interface changes.
- Tests that lock the boundary (`tests/lib/meeting-todo.test.ts`,
  `tests/lib/project-meeting-todo-service.test.ts`,
  `tests/e2e/project-meeting-todos.spec.ts`).
- Release metadata: package version, package-lock version, and a new
  `v0.35.1` CHANGELOG entry.
- Tracking doc updates (`tasks/current.md`, `tasks/backlog.md`, `journal.md`).

## Out Of Scope

- Branching this from TASK-354 (`feature/task-354-sidebar-todo-count`).
  This branch is created fresh from `origin/main` per the issue's agent
  instructions.
- Removing the grace period entirely or replacing it with a per-todo due
  date (option 2 and option 4 in the issue body); these remain available
  as follow-ups if the 24-hour rule is later judged too lenient.
- UI copy, accessibility text, badge wording, layout, or TASK-354 summary
  endpoint changes; the new rule propagates to existing surfaces.
- Notification email cadence, recipient grouping, dispatcher limits, or
  operator runbooks beyond keeping the rule consistent with the rest of
  the dispatcher.
- Other overdue consumers (roadmap deadlines, Kanban task deadlines)
  that already use their own rules.

## Runtime Assumptions

- Local PostgreSQL and `.env` prerequisites are unchanged.
- Browser validation uses the existing project meeting-todo fixture.
- Preview validation, if required, uses
  `git_ref=fix/task-355-meeting-todo-overdue-grace` explicitly.

## Acceptance Criteria

1. `MEETING_TODO_OVERDUE_GRACE_DAYS` is `1`; `MEETING_TODO_OVERDUE_DAYS`
   is `1`; the two remain in lock-step.
2. `isMeetingTodoOverdueAt` reports `true` for an open todo whose meeting
   ended more than 24 hours ago and `false` for one whose meeting ended
   within the last 24 hours, in both `lib/meeting-todo.ts` and the
   `lib/services/project-meeting-todo-service.ts` projection.
3. The Todos page row badge, the `Project meeting todos` summary card
   on the dashboard, the navigation badge from TASK-354, and the
   notification email reminder dispatcher all classify the same todo
   identically.
4. `done` (archived) meetings continue to suppress overdue for their
   todos; completed todos continue to suppress overdue as well.
5. The optimistic recompute path in
   `components/meeting-todos/project-meeting-todos.tsx` produces the same
   classification as the server for the boundary cases.
6. Unit, service, and Playwright coverage prove the boundary at exactly
   24 hours, 24 hours minus a second, and 24 hours plus a second.
7. Release metadata advances from `v0.35.0` to `v0.35.1` (patch bump,
   `fix/*` branch) with a matching CHANGELOG entry.
8. Tracking docs (`tasks/current.md`, `tasks/backlog.md`, `journal.md`)
   reflect the new task in the same PR.

## Definition Of Done

- The single source of truth (`MEETING_TODO_OVERDUE_GRACE_DAYS`) is the
  only place a number lives; the dispatcher copy is updated in the same
  commit.
- All existing project isolation, RLS, and authorization boundaries are
  preserved.
- `npm run lint`, `npm run rls:check`, `npm test`, `npm run test:coverage`,
  `npm run build`, `npm run release:check -- --base origin/main --branch fix/task-355-meeting-todo-overdue-grace`,
  and the focused meeting-todo Playwright flow pass.
- Branch is committed, pushed, and a ready-for-review PR is opened; the
  initial automated review/check outcome is handled without merging the
  PR.
