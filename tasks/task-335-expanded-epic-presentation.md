# TASK-335 - Compact epic detail disclosure

## Status

Done (2026-08-04, merged via PR #403).

## Objective

Keep the established compact epic-card presentation while preventing long
descriptions and linked work from overwhelming the project dashboard. Every
epic starts collapsed with its title, status, actions, and progress visible;
users expand only the epic whose description and linked tasks they need.

## Product Decision

Restore the familiar one-column mobile and two-column desktop card grid,
accent strip, title flag, status badge, and compact progress treatment. Do not
make the entire card interactive because it contains edit and delete actions.
Instead, place an icon-only disclosure chevron in the right-side action cluster
immediately before Edit/Delete so collapsed cards gain no extra vertical row.

The disclosure is independent per epic and collapsed by default at every
viewport. Its accessible state is exposed with `aria-expanded` and
`aria-controls`; the controlled details region remains hidden from sighted and
assistive-technology users until requested. Expanded details show the complete
description followed by the existing bounded linked-task summary (six tasks
plus a remainder count for dense epics).

## Scope

- Preserve the original compact epic-card visual presentation and responsive
  two-column desktop grid.
- Keep epic name, textual status, progress percentage, and completion count
  visible while the card is collapsed.
- Hide the description and linked-task section by default behind an explicit
  per-card chevron in the action cluster.
- Reveal the complete wrapping description and linked-task chips when the card
  is expanded.
- Provide semantic article headings, progress values, disclosure state,
  visible focus, keyboard activation, and at least 44 px interaction targets.
- Preserve epic CRUD, permissions, project-section persistence, task/status
  calculations, bounded linked-task summary, and live-refresh locking.
- Add focused component and browser coverage at mobile and desktop widths.

## Out Of Scope

- Changing epic persistence, status derivation, progress calculations, or task
  assignment.
- Adding epic detail routes, task navigation, reordering, filtering, or search.
- Redesigning other project dashboard sections.
- Changing the global product palette, typography, or app-shell navigation.

## Runtime Assumptions

- The existing PostgreSQL and `.env` contracts remain unchanged.
- Browser fixtures can create epics and linked tasks through existing data
  services.
- Preview validation, if required, uses
  `feature/task-335-expanded-epic-presentation` as the explicit `git_ref`.

## Acceptance Criteria

1. At a 375 px viewport, every epic is collapsed by default and only its
   title/status, actions, and progress summary consume card height.
2. At desktop widths, the familiar two-column epic-card grid is retained so
   several collapsed epics remain easy to scan.
3. Each epic has an independent icon-only chevron beside its edit action with a
   44 px target, visible focus, descriptive accessible name, keyboard
   activation, and accurate `aria-expanded` and `aria-controls` state; viewers
   without edit rights still receive the disclosure.
4. Expanding an epic reveals its complete wrapping description and linked-task
   summary without expanding sibling epics or creating horizontal overflow.
5. Epic cards expose a semantic article heading and accessible progress value,
   and status meaning remains available as text rather than color alone.
6. Owner/editor CRUD, viewer read-only behavior, project-section collapse
   persistence, and mutation feedback remain unchanged.
7. Light and dark themes retain clear hierarchy and contrast using established
   semantic tokens.
8. Focused component and Playwright coverage verifies collapsed defaults,
   independent disclosure, mobile containment, desktop grid placement, touch
   targets, and permission-safe actions.

## Definition Of Done

- The clarified compact disclosure behavior and focused automated coverage are
  implemented.
- UI/UX Pro Max guidance is applied for progressive disclosure, 44 px targets,
  keyboard semantics, theme parity, and 375 px containment.
- `npm run lint`, `npm run rls:check`, `npm test`, `npm run test:coverage`,
  `npm run build`, release validation, and relevant Playwright coverage pass.
- Product version, changelog, current task, backlog, and journal are updated
  consistently.
- The branch is committed and pushed, PR #403 is updated, and checks are
  monitored without merging the PR.
