# Current Task: TASK-306 Task Comment Mention Cursor Spacing

## Task ID
TASK-306

## Status
Implemented locally - PR/preview validation pending

## Source
- GitHub issue #306: task comment mention cursor spacing after selecting a
  mention.
- User report and screenshot from 2026-05-31: after selecting a mention in the
  task comment composer, the visible spacing and caret position become
  desynchronized.

## Objective
Fix the task detail comment composer so selecting a mention inserts a consistent
trailing separator, preserves predictable caret positioning, and keeps mention
highlighting/notification behavior intact.

## Investigation Notes
- The task comment composer uses a transparent textarea layered over a visible
  rendered mirror from `renderContentWithMentions`.
- The underlying textarea receives plain text such as `@username ` and owns the
  actual browser caret.
- The visible mirror currently reuses the standard mention chip styling, which
  adds horizontal padding and medium font weight. That makes the visual mention
  wider than the transparent textarea text, so following text and the caret no
  longer line up after a selected mention.

## Scope
- Task detail modal comment composer mention mirror styling.
- Mention selection/caret behavior after choosing an autocomplete result.
- Focused regression tests for the mirror class and comment mention flow.
- Preview validation against the deployed branch URL with Playwright.

## Out Of Scope
- Mention search result behavior.
- Mention notification service rules, except verifying they still work.
- Task detail modal redesign.
- Replacing the textarea/mirror composer with a rich text editor.

## Acceptance Criteria
1. After selecting a mention in a task comment, the trailing space is represented
   consistently in the textarea value and visible mirror.
2. Typing immediately after the mention appears at the same visual position as
   the caret.
3. The caret can reach the true end of the comment text with keyboard and mouse
   navigation.
4. Mention autocomplete still works in the task comment composer.
5. Mention notifications still work when a selected mention comment is
   submitted.
6. Existing comment creation behavior remains unchanged outside the
   cursor/spacing fix.
7. Local validation and preview Playwright validation pass, or any environment
   blocker is recorded.

## Validation Notes
- `git diff --check` passed.
- `npm run lint` passed.
- Focused tests passed:
  `npm test -- tests/api/task-comments.route.test.ts tests/components/rich-text-content.test.ts tests/lib/mention.test.ts`.
- Full test suite passed with documented local DB env:
  `DATABASE_URL=postgresql://nexus:nexus@localhost:5432/nexusdash` and
  `DIRECT_URL=postgresql://nexus:nexus@localhost:5433/nexusdash npm test`.
- Coverage passed with the same DB env:
  `npm run test:coverage` reported 91.23% statements, 81.2% branches, 93.42%
  functions, and 91.75% lines.
- Build passed with the same DB env plus placeholder production-only secrets.
- Local E2E setup is blocked because Docker Desktop is not available
  (`dockerDesktopLinuxEngine` pipe missing) when running
  `npm run db:local:up`.
- PR E2E initially exposed an immediate-type race after autocomplete selection:
  Playwright could type before the next animation frame restored the caret. The
  component now synchronizes the textarea value and selection immediately during
  mention selection. The follow-up animation-frame stabilization now aborts if
  the user has already typed more text, preventing a delayed caret jump from
  splitting the following word.
- Preview deployment and Playwright validation remain pending.

## Definition Of Done
- A dedicated `fix/task-306-mention-cursor-spacing` branch contains the fix.
- `tasks/current.md`, `tasks/backlog.md`, and `journal.md` are updated.
- A ready-for-review PR is opened for issue #306.
- Copilot review feedback and CI failures are handled.
- A Vercel preview deployment is triggered with
  `git_ref=fix/task-306-mention-cursor-spacing`.
- Playwright is run against the preview URL, tagging the mention target from
  `tmp/project-access-cred.env` in the manual flow or equivalent automated
  setup.
