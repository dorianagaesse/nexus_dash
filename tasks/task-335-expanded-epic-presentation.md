# TASK-335 - Expanded epic presentation

## Status

In review (2026-07-31, PR #403).

## Objective

Make epic cards readable as project context rather than compact metadata:
mobile users should see the epic narrative, progress, and linked work without
opening another disclosure, while desktop users should receive the same
expanded information in a layout that remains easy to scan with several epics.

## Product Decision

Retain the existing calm, token-driven visual language and the project-level
collapse control. Inside the expanded Epics section, present each epic as one
full-width article instead of two narrow desktop cards. Use a responsive
content grid on larger screens so the narrative and execution details have
readable measures, while mobile keeps the same information in natural document
order.

Linked tasks remain bounded to a concise initial set for dense projects, but
the remainder must be available through an explicit, accessible per-epic
control. The mobile default exposes the complete linked-task set; the desktop
default keeps the bounded scan view, with user-controlled expansion. Epic
descriptions themselves are never clamped or truncated.

## Scope

- Refine the project epic card hierarchy and responsive layout.
- Keep epic name, status, full description, progress, completion count, and
  linked-task context visible in a logical reading order.
- Show all linked tasks by default on narrow viewports and provide an explicit
  show-more/show-less control for dense desktop cards.
- Replace truncated micro-copy task chips with readable task rows that retain
  title and textual status.
- Add semantic headings, progress semantics, expanded-state announcements,
  visible focus, and 44 px interaction targets.
- Preserve epic CRUD, permissions, project-section persistence, task-link
  limits from the service contract, and live-refresh locking.
- Add focused component and browser coverage at mobile and desktop widths.

## Out Of Scope

- Changing epic persistence, status derivation, progress calculations, or task
  assignment.
- Adding epic detail routes, task navigation, reordering, filtering, or search.
- Redesigning other project dashboard sections.
- Changing the global product palette, typography, or app-shell navigation.

## Runtime Assumptions

- The existing local PostgreSQL Docker service and `.env` contract remain
  unchanged.
- Browser fixtures can create epics and linked tasks through the existing
  project APIs.
- Preview validation, if required, uses
  `feature/task-335-expanded-epic-presentation` as the explicit `git_ref`.

## Acceptance Criteria

1. At a 375 px viewport, each epic exposes its complete name, description,
   progress, completion count, and linked-task list by default without
   requiring a per-epic disclosure action.
2. At desktop widths, epic cards use the available project-section width and a
   readable responsive layout; several epics remain clearly separated and easy
   to scan.
3. Epic descriptions and linked-task titles wrap without clipping or
   ellipsis, and long content does not create horizontal page overflow.
4. Dense desktop epics initially show a bounded linked-task set with an
   explicit show-more/show-less control; the control has a 44 px target,
   visible focus, and accurate `aria-expanded`/`aria-controls` state.
5. Epic cards expose a semantic article heading and an accessible progress
   value, and status meaning remains available as text rather than color alone.
6. Owner/editor CRUD, viewer read-only behavior, project-section collapse
   persistence, and mutation feedback remain unchanged.
7. Light and dark themes retain clear hierarchy and contrast using established
   semantic tokens.
8. Focused component and Playwright coverage verifies mobile default
   expansion, desktop dense-state disclosure, wrapping/containment, and
   permission-safe actions.

## Definition Of Done

- The responsive epic presentation and its focused automated coverage are
  implemented.
- UI/UX Pro Max guidance is applied for readable line length, 44 px targets,
  keyboard semantics, theme parity, and 375 px containment.
- `npm run lint`, `npm run rls:check`, `npm test`, `npm run test:coverage`,
  `npm run build`, release validation, and relevant Playwright coverage pass.
- Product version, changelog, current task, backlog, and journal are updated
  consistently.
- The branch is committed and pushed, a ready-for-review PR is open, and
  initial automated review/check feedback is handled without merging the PR.
