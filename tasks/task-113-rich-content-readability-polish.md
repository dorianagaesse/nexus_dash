# TASK-113 Rich Content Readability Polish

## Goal
Make rich task/context content easier to write and scan by clearly distinguishing prose from commands or token values, while keeping implementation intentionally lightweight.

## Context
- Task descriptions already use a shared sanitized rich-text editor, but the formatting model is still limited for command-style content.
- Long token-like values can consume too much vertical space when pasted directly into descriptions or context content.
- Emoji controls currently add persistent UI chrome across supported text-entry surfaces.
- Kanban previews flatten rich content down to plain text, but the summary treatment can be improved so formatted content reads more naturally at scan time.

## Product Direction Locked For This Task
- Token values should be added as explicit user-authored blocks rather than auto-detected heuristics.
- The implementation should stay as simple as possible for both users and the codebase.
- The goal of token blocks is:
  - avoid large vertical space taken by long values
  - visually highlight the token/value as a distinct item
  - offer a direct copy action
- Formatting support should make it easy to distinguish informational prose from commands, similar to LLM chat products, with copy support where it matters.

## Current Baseline Confirmed In Repo
- Task descriptions use `RichTextEditor` and `sanitizeRichText(...)`.
- Context-card content is still plain text today and will need to align with `TASK-111` before or during richer formatting follow-up work.
- Emoji field controls are provided through:
  - `components/ui/emoji-field.tsx`
  - `components/ui/emoji-picker-button.tsx`
- Kanban preview text currently derives from:
  - `components/kanban-board-utils.ts`
  - `richTextToPlainText(...)` in `lib/rich-text.ts`

## Scope
- Extend rich-content authoring so users can clearly mark command/code-like content and copy it easily.
- Introduce a simple user-authored token/value block treatment with copy support and compact rendering.
- Show emoji affordances only while the related input/editor is focused, reducing always-visible field chrome.
- Improve Kanban preview summarization so formatted content previews remain readable and useful.

## Out of Scope
- Automatic token detection from arbitrary pasted text.
- Full IDE-style syntax highlighting or language-specific parsing.
- A large editor rewrite or migration to a heavyweight editor framework unless clearly required.

## Acceptance Criteria
- Users can author content that visually distinguishes prose from command/code-like content.
- Long token/value content can be represented in a compact, copyable, highlighted block rather than consuming excessive line space.
- Emoji controls appear only when the relevant text field/editor is focused.
- Kanban previews summarize rich content more faithfully than the current plain flattening treatment.
- The implementation remains intentionally lightweight and understandable in the current codebase.

## Follow-Up Refinement Note (2026-03-28)
- Code blocks must stay width-bounded inside task/context modals.
- Any horizontal overflow for code blocks should scroll inside the code block itself, never at modal level.
- Token blocks must be strictly single-line visually and structurally.
- Token values may scroll horizontally inside their own value area, but must not introduce modal-level horizontal scroll.
- Token actions (`see/hide`, `copy`) must remain visible on the right side of the token block, inline with the value area rather than stacked underneath.
- Pressing `Enter` while focused inside a token block must always escape the block instead of creating additional token lines.
- Task and context modals can grow moderately in width if that improves usable editing space, but should remain comfortable on desktop and safe within the viewport.
- Pressing `Enter` inside a code block must exit the block in a single keypress; `Shift+Enter` must remain the multiline shortcut inside code blocks.
- Pressing either `Enter` or `Shift+Enter` inside a token block must exit the block in a single keypress.
- The editor should keep a writable paragraph after a trailing code/token block so users can click below the block and continue writing without hunting for the end of the overflowed value.
- Editor-only shell controls must not leak into persisted content state; toolbar buttons for token/code blocks should remain stable after regular typing and line creation below those blocks.
- Applying `Code` with no active text selection must only transform the current visual line, even when multiple lines live inside the same paragraph node.
- Long code content should wrap within the block instead of widening the editor/modal surface.
- Caret placement after creating or exiting a token/code block must land in the paragraph below the block, not snap back into the structured block or to a prior block above it.
- Navigation-only `Enter` behavior around structured blocks must not trigger a controlled editor resync that can relocate the caret back into the block surface.
- Token overflow can remain horizontally scrollable, but the scrollbar chrome should stay visually discreet rather than introducing a bright native track inside the token block.

## Likely Touch Points
- `components/rich-text-editor.tsx`
- `components/ui/emoji-field.tsx`
- `components/ui/emoji-picker-button.tsx`
- `components/create-task-dialog.tsx`
- `components/kanban/task-detail-modal.tsx`
- `components/kanban/kanban-columns-grid.tsx`
- `components/kanban-board-utils.ts`
- `components/context-panel/context-create-modal.tsx`
- `components/context-panel/context-edit-modal.tsx`
- `components/context-panel/context-cards-grid.tsx`
- `components/context-panel/context-preview-modal.tsx`
- `lib/rich-text.ts`

## Dependencies and Sequencing Notes
- `TASK-111` should land first or be handled in tandem for any context-card rich-content work.
- This task should reuse the existing editor/sanitization stack where practical rather than introducing a separate content system.

## Validation Baseline
- `npm run lint`
- `npm test`
- `npm run test:coverage`
- `npm run build`
- `npm run test:e2e` if editor interactions or Kanban previews change in user-visible ways

## Open Questions
1. None currently blocking initial implementation.
