# Current Task: TASK-124 Comment Mentions

## Task ID
TASK-124

## Status
In progress on PR #211.

## Objective
Stabilize project-member `@` mentions across task descriptions and task
comments so autocomplete insertion, caret placement, highlighted rendering, and
mention hover cards behave consistently across the task modal.

## Current Follow-Up Scope
- Fix the two remaining PR #211 regressions reproduced on 2026-05-04:
  - while typing a task comment, an inserted mention visually shows the right
    `@name` label but the highlight pill includes a blank tail where the hidden
    discriminator is laid out
  - after creating a task with a description mention, opening it, editing the
    description, and adding another mention, the original description mention
    can come back in view mode as raw `@name#discriminator` text without
    highlight or tooltip behavior
- Fix the PR #211 behavior reported from task view mode:
  task-description mentions must render as highlighted `@name` text without the
  discriminator, with hover cards available immediately after opening a task.
- Fix comment composer mirrors so inserted mentions display as highlighted
  `@name` without a highlighted or blank discriminator-width tail. The textarea
  value may still carry the discriminator for unambiguous submit-time
  resolution, but the visual mirror must behave like task-description edit
  chips.
- Keep added comments, task-card previews, task-description view mode, and
  task-description edit mode on the same shared mention rendering contract:
  visible mentions show no discriminator, remain highlighted, and resolve hover
  cards from the project-member lookup when a matching user is available.
- Ensure selecting a mention inserts a usable separator after the selected user.
- Keep the rich-text editor caret outside highlighted mention spans so typing a
  space or more text after a mention does not jump to the start of the editor.
- Align task-description edit mode with comment composer behavior: auto-space
  after mention selection, natural arrow/word navigation around highlighted
  mentions, two-step separator movement/deletion, Return/Enter behavior at
  mention separators, and fast whole-mention deletion when backspacing at the
  mention boundary.
- Keep comment composer highlighting visually aligned with the actual textarea
  caret.
- Add fast whole-mention deletion to comments while preserving normal character
  deletion once text has been typed after the mention.
- Make task-description mention hover cards dismiss reliably when the pointer
  leaves the mention in any direction.
- Preserve reusable mention parsing, autocomplete, rendering, and tooltip
  components instead of one-off task-modal fixes.

## Acceptance Criteria
1. Selecting a mention in a task description inserts the mention plus one
   trailing separator and leaves the caret after that separator.
2. Pressing Space or typing regular text after a task-description mention keeps
   the caret at the expected position and allows continued typing.
3. Selecting a mention in a task comment inserts the mention plus one trailing
   separator and leaves the textarea caret after that separator.
4. Backspace at a mention boundary removes the whole mention consistently in
   task-description edit mode and task comments.
5. Arrow and Ctrl+Arrow navigation can move before and after task-description
   mentions without trapping the caret.
6. From one separator after a task-description mention, ArrowLeft or Backspace
   first lands immediately after the mention instead of jumping before it.
7. Pressing Enter from the separator after a task-description mention creates
   the expected next editable line instead of doing nothing.
8. Comment composer highlight rendering does not visually shift text away from
   the real textarea caret.
9. Task-description mention hover cards disappear when the pointer leaves the
   mention, regardless of direction.
10. Task-description view mode highlights mentions immediately after opening an
    existing task and never displays the discriminator in the visible mention
    text.
11. Comment composer visible mention mirrors show `@name`, not
    `@name#discriminator`, and do not show a blank discriminator-width gap
    before following text.
12. Comment composer highlight pills end at the visible `@name`; any hidden
    discriminator retained in the textarea mirror must not extend the highlight
    background or consume visible layout.
13. A task description mention created with the task must remain highlighted,
    discriminator-free, and tooltip-capable after later edits add more text and
    more mentions to the same description.
14. Existing mention parsing, notification, and rendering tests remain green.

## Definition Of Done
- `agent.md` documents the dedicated worktree expectation for multi-agent work,
  and the root worktree script creates `../nexus_dash_taskXXX` directories for
  task branches.
- Root causes for the reported mention issues are fixed in shared mention/editor
  paths where possible.
- Focused mention/editor tests are updated for the changed behavior.
- Local validation evidence and any environment blockers are recorded in
  `journal.md`.
- PR #211 remains the single review surface for TASK-124.

## Notes
- Local full validation currently depends on a repo-compatible Node runtime
  (`20.19+`, `22.12+`, or `24+`) so Prisma, jsdom, Next build type generation,
  and browser validation can run with the expected generated client.
