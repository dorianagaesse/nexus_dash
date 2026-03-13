# Current Task: TASK-096 Project Dashboard UI Polish - Hierarchy, Section Rhythm, and Kanban Lane Clarity

## Task ID
TASK-096

## Status
In Progress

## Objective
Raise the project workspace from a solid internal-tool baseline to a more intentional product surface by improving page-level hierarchy, strengthening section framing, and making the Kanban board easier to scan without refactoring the app or disrupting mature flows.

## Product Target
- Move the perceived UI quality from roughly `6.5/10` toward `8/10`.
- Preserve the existing product spirit: calm, practical, dark-first, and trustworthy.
- Avoid decorative redesign work that would add novelty without improving clarity.

## Design Diagnosis
- The current page is usable but visually too sparse.
- The project header does not create enough primary focus or workspace identity.
- `Project context`, `Kanban board`, and `Calendar` read as separate blocks, but not as part of one cohesive workspace.
- Kanban lanes are too visually similar, so status scanning is weaker than it should be.
- Empty and low-density states make the workspace feel unfinished even when nothing is broken.

## Scope
- Improve the project page hero/header composition.
- Strengthen section chrome for Context, Kanban, and Calendar without changing their behavior contracts.
- Improve empty-state presentation where it materially affects perceived polish.
- Make Kanban lane scanning clearer through restrained visual differentiation.
- Keep existing create/edit/archive/attachment/related-task flows intact.

## Out of Scope
- App-wide theming redesign.
- Typography system replacement.
- Modal redesign across the whole app.
- New workflow concepts, new data model work, or backend refactors.
- Mobile-first redesign pass.

## Design Guardrails
- Keep the interface calm and professional.
- Prefer subtle gradients, spacing, and framing over loud color.
- Use color to support status comprehension, not to decorate.
- Preserve the app's existing interaction language and avoid surprise UX changes.
- Reuse existing components and styling patterns wherever possible.

## Acceptance Criteria
- The project page header feels like a deliberate workspace entry point, not just a title row.
- The three main sections feel visually related and consistently framed.
- Empty/low-density states feel intentional rather than unfinished.
- Kanban lane identity is clearer at a glance while staying restrained.
- Existing task/context/calendar workflows continue to work unchanged.
- Local validation and PR automation remain green.

## Implementation Plan
1. Refresh the top-of-page workspace shell and project hero.
2. Unify section framing for Context, Kanban, and Calendar.
3. Improve Context and Calendar low-density states where they currently flatten the page.
4. Refine Kanban lane presentation with restrained per-status differentiation.
5. Validate locally, open PR, handle automated review feedback, confirm CI, and publish preview.

## Notes
- This task intentionally starts from `main`, not from the unmerged TASK-095 polish branch.
- If TASK-095 is later merged independently, we may need a light rebase/reconciliation pass before final merge.

---

Last Updated: 2026-03-11
Assigned To: Agent
