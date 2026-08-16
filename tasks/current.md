# Current Task

## TASK-330: Meeting Todo Assignees and Completion Accountability

## Status

Implementation and validation complete on
`feature/task-330-meeting-todo-assignees`; ready for review.

## Context

Meeting todos currently preserve only content and completion time. They do not
show who created the follow-up, who owns it, or who completed it. Overdue
reminders therefore fall back to the meeting-note creator even when another
project collaborator is actually accountable.

TASK-337's universal project-actor model is not implemented yet. This task will
introduce a deliberately narrow, reusable meeting-todo actor contract for human
project members and active project agent credentials without expanding into
cross-artifact ownership.

## Scope

- Persist durable creator, optional assignee, and completion-actor identity for
  every meeting todo, including safe display snapshots.
- Backfill existing todo creators from their meeting-note creator.
- Preserve existing todo identity and provenance when a meeting note is edited.
- Allow assignment only to current project members or active, unexpired project
  agent credentials. Meeting guests are not assignment candidates.
- Display inactive/revoked assignees as needing reassignment instead of silently
  converting them to unassigned.
- Add accessible assignment controls in meeting detail and the project Todos
  page, plus `All`, `Assigned to me`, and `Unassigned` responsibility views.
- Record the authenticated human or agent credential that completes a todo.
- Send overdue reminders only to an active human assignee. Do not redirect an
  agent assignment to its credential owner, and do not treat the note creator
  as an implicit assignee.

## Out Of Scope

- A universal actor table or cross-artifact actor migration (TASK-337).
- Cross-project responsibility queues (TASK-346).
- New agent capability vocabulary or granular meeting scopes (TASK-331).
- Assignment notifications or preference controls beyond the existing overdue
  reminder pipeline (TASK-347).

## Acceptance Criteria

1. Each meeting todo exposes creator, optional assignee, and (when completed)
   completion actor with actor kind, stable identifier, display label, avatar
   treatment, and current access state.
2. New todos record their creator. Existing todos are backfilled from the
   meeting-note creator, and editing a note does not replace unchanged todo IDs
   or erase creator/assignee/completion provenance.
3. Editors can assign or clear a todo from meeting detail and the project Todos
   page using a labeled, keyboard-operable control with pending and error
   feedback; viewers see the same identity information without mutation affordances.
4. Assignment validation is enforced in the service boundary. Human candidates
   must currently own or belong to the project; agent candidates must be active,
   unexpired credentials for that project. Assignment never grants access.
5. External meeting participants are never offered or accepted as assignees.
6. Removed human members and revoked/expired agents remain visibly attached to
   their todo as inactive and are labeled `Needs reassignment` until cleared or
   reassigned.
7. The project Todos page supports stable URL-backed `All`, `Assigned to me`,
   and `Unassigned` filters for both open and completed views, with accurate
   counts and useful filtered empty states.
8. Completing a todo records the authenticated human or agent credential as the
   completion actor; reopening clears the current completion actor together
   with the completion timestamp.
9. Overdue reminder reconciliation targets only active human assignees with
   current project access. Unassigned, inactive-human, and agent-assigned todos
   do not generate a reminder for another person.
10. UI remains usable at 375px and desktop widths, in light and dark themes,
    with visible focus, semantic status text, at least 44px primary touch
    targets, and no color-only responsibility state.

## Definition Of Done

- Prisma schema, migration, RLS inventory, services, routes, UI projections,
  reminder reconciliation, and relevant documentation are updated together.
- Focused unit, service, route, component, and Playwright coverage exercises
  human/agent assignment, invalid actors, inactive states, responsibility
  filters, creator/completer provenance, role restrictions, and reminder targeting.
- `npm run lint`, `npm run rls:check`, `npm test`, `npm run test:coverage`,
  `npm run build`, and relevant meeting-todo E2E coverage pass.
- `tasks/current.md`, `tasks/backlog.md`, `tasks/task-330-meeting-todo-assignees.md`,
  `project.md`, and `journal.md` reflect the delivered behavior.
- The branch is pushed, a ready-for-review PR is open, required checks are
  green, and initial Copilot review feedback is resolved or documented.

## Runtime Assumptions

- Local database-backed validation uses the repository `.env` contract and a
  reachable PostgreSQL instance when migration or E2E execution requires it.
- No new secrets or external provider configuration are introduced.
- Preview deployment is not an acceptance requirement; local browser coverage
  is sufficient unless review feedback exposes a preview-only concern.
