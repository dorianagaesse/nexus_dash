# TASK-354 - Sidebar todo count

## Status

In review in [PR #410](https://github.com/dorianagaesse/nexus_dash/pull/410)
from `feature/task-354-sidebar-todo-count`.

## Objective

Make outstanding meeting follow-ups visible from project navigation by adding
the active todo count to the `Todos` item and emphasizing overdue work.

## Scope

- Load an authorization-safe active/overdue summary for the current project.
- Add a compact top-right count badge to the project `Todos` navigation item.
- Render a neutral state for active work and an orange warning state whenever
  at least one active todo is overdue.
- Announce both count and overdue meaning to assistive technology.
- Refresh the summary after local todo mutations, remote project activity, and
  project navigation.
- Preserve the existing navigation hierarchy, Inbox badge, route state, touch
  targets, themes, and responsive containment.

## Out Of Scope

- Changing todo due dates or overdue calculation rules.
- Adding assignees, cross-project aggregation, or new todo creation flows.
- Redesigning the Todos page or desktop meeting-todo panel.
- Changing notification reminder behavior.

## Runtime Assumptions

- Active todos are meeting-note actions whose `completedAt` value is null.
- Existing meeting-todo overdue rules remain authoritative, including the
  seven-day grace period and archived-meeting exclusion.
- Existing local PostgreSQL and `.env` prerequisites are unchanged.
- Browser validation uses the existing project meeting-todo fixture.
- Preview validation, if required, runs with the active branch passed as the
  explicit `git_ref`.

## Acceptance Criteria

1. The project `Todos` item shows the exact active count above zero and no
   badge at zero.
2. Neutral and overdue-warning appearances use semantic theme tokens and
   remain readable in light and dark themes.
3. Accessible navigation text announces the count and whether overdue work is
   present, without relying on badge color.
4. The summary is actor-authorized and project-scoped and exposes no todo
   content.
5. Local completion/reopening, remote activity, and project changes refresh
   the displayed summary.
6. Desktop and mobile navigation remain contained, keyboard accessible, and at
   least 44 px high; the Inbox badge and route state do not regress.
7. Focused service, route, component, and browser tests cover the key states.
8. Required validation, release metadata, tracking documentation, push, PR,
   and initial automated review handling are complete.

## Definition Of Done

- Persistence stays within the service layer and transport logic stays thin.
- The UI follows the repository's established navigation patterns and UI/UX
  Pro Max accessibility and semantic-color guidance.
- Required repository and focused browser validation passes.
- The product version and changelog reflect the feature release.
- A ready-for-review PR is open and its initial automated review outcome is
  handled without merging.
