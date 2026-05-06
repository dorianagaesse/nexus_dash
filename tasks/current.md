# Current Task: TASK-214 Task And Card Focus Border Consistency

## Task ID
TASK-214

## Status
Implementation and local validation complete on
`fix/issue-214-task-creation-focus-border`; PR update ready.

## Objective
Resolve GitHub issue #214 by making task and context-card authoring inputs use
a consistent focused border treatment, using the title input as the visual
reference, and fixing dark-theme title focus border clipping.

## Current Scope
- Keep changes limited to task and context-card create/edit form focus styling.
- Align title, label entry, description, deadline, epic, assignee, related-task
  search, follow-up entry, and attachment-link entry focus states around the
  same border-color treatment.
- Avoid layout, validation, or authoring behavior changes.
- Preserve existing design system tokens and component conventions.

## Acceptance Criteria
1. All visible task create/edit and context-card create/edit form input fields
   use the same focused border style.
2. The title input remains the visual reference for the focused state.
3. Focused borders render correctly in light and dark themes.
4. The dark-theme focused title input no longer appears cropped on the left
   side.
5. Task and context-card form layouts and input behavior are unchanged.
6. Relevant lint, test, build, and UI validation checks pass or any environment
   blocker is recorded.

## Definition Of Done
- TASK-214 has a dedicated branch and fresh worktree separate from the prior
  closed PR/worktree attempt.
- Focus styling fixes are implemented with minimal task and context-card form
  scope.
- Local validation evidence and any environment blockers are recorded in
  `journal.md`.
- A PR is opened for issue #214 once the branch is reviewable.

## Out Of Scope
- Redesigning task or context-card forms.
- Changing input validation, submission, upload, or authoring behavior.
- Refactoring unrelated form components or global form styling.

## Validation Evidence
- `npm run lint` passed on 2026-05-06.
- `npm test` passed on 2026-05-06 with 92 files passed, 1 skipped; 718 tests
  passed, 1 skipped.
- `npm run test:coverage` passed on 2026-05-06 with 91.23% statements,
  81.2% branches, 93.42% functions, and 91.75% lines.
- `npm run build` passed on 2026-05-06 with local preview validation env vars.
- `npm run test:e2e` passed on 2026-05-06 with all 7 Playwright tests passing.
