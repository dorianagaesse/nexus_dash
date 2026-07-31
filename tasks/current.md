# Current Task

## Task

- ID: TASK-352
- Title: Related-task picker presentation
- Status: In progress (2026-07-31)
- Branch: `feature/task-352-related-task-picker-presentation`
- Brief:
  [`task-352-related-task-picker-presentation.md`](./task-352-related-task-picker-presentation.md)

## Objective

Make every related-task candidate easy to scan and distinguish by presenting
its friendly task reference, bounded title, and Kanban-colored status in one
responsive, accessible row.

## Scope

- Present each candidate as a stable reference column, a flexible truncated
  title, and a compact status badge.
- Reuse the established Backlog, In Progress, Blocked, and Done Kanban badge
  colors in both light and dark themes.
- Centralize the shared status presentation classes so the picker cannot drift
  from the Kanban columns.
- Keep status text visible and include reference, full title, and status in the
  option's accessible name so meaning never depends on color.
- Preserve the complete candidate set, reference/title/status filtering,
  viewport-aware scrolling, keyboard navigation, and selection behavior from
  TASK-350 and TASK-351.
- Add focused component and browser coverage for presentation, accessibility,
  long-title containment, mobile sizing, and both themes.

## Runtime Assumptions

- TASK-350 and TASK-351 are present on `origin/main`; candidate eligibility and
  stable `ND-<number>` references need no data or API changes.
- Task statuses remain limited to the four values in `lib/task-status.ts`.
- Existing local PostgreSQL and `.env` prerequisites are unchanged.
- Browser validation uses the existing Playwright project/task fixture.
- If a branch preview is required during review, it must pass
  `git_ref=feature/task-352-related-task-picker-presentation` explicitly.

## Acceptance Criteria

1. Every related-task suggestion shows the friendly `ND-<number>` reference,
   task title, and human-readable status in a consistent scan order.
2. Backlog, In Progress, Blocked, and Done use the same semantic badge colors
   as their Kanban columns in light and dark themes.
3. Status remains understandable without color: visible status text is
   present, and the option accessible name includes reference, full title, and
   status.
4. Long titles truncate with an ellipsis in the row, expose the full title to
   pointer and assistive-technology users, and do not create horizontal
   overflow at a 375 px viewport.
5. Candidate rows remain at least 44 px high with existing hover, active,
   focus, keyboard navigation, list scrolling, and selection behavior intact.
6. Candidate eligibility, sorting, filtering by reference/title/status,
   bilateral relationship behavior, and internal task identity remain
   unchanged.
7. Focused component and Playwright coverage proves all four status
   presentations, accessible names, truncation, narrow containment, and theme
   compatibility.
8. Release metadata, task tracking, and validation evidence are updated in the
   same pull request.

## Definition Of Done

- The picker and Kanban columns consume one shared status badge palette.
- The row layout follows the UI/UX Pro Max accessibility, 44 px target,
  truncation, responsive, and dark-mode guidance.
- `npm run lint`, `npm run rls:check`, `npm test`, `npm run test:coverage`,
  `npm run build`, release validation, and relevant Playwright coverage pass.
- The feature release advances to `v0.33.0` with matching changelog and
  lockfile metadata.
- The branch is committed and pushed, a ready-for-review PR is open, and the
  initial Copilot review/check outcome is handled without merging the PR.

## Progress

- Confirmed TASK-352 is the next presentation refinement after merged
  TASK-350 and TASK-351.
- Created the dedicated worktree and feature branch from merged `origin/main`.
- Completed the UI/UX Pro Max design-system, accessibility, truncation,
  responsive-layout, dark-theme, and Next.js guidance review.
- Located the established status badge palette in the Kanban column component
  and defined the shared-presentation boundary for implementation.

## Validation

- Pending implementation.
