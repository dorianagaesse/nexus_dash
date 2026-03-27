# Current Task: TASK-113 Rich Content Readability Polish - Code Formatting, Compact Token Fields, Focus-Only Emoji Controls, and Better Kanban Previews

Dedicated task brief: [`tasks/task-113-rich-content-readability-polish.md`](./task-113-rich-content-readability-polish.md)

## Task ID
TASK-113

## Status
In progress

## Objective
Make rich task/context content easier to write and scan by distinguishing prose from command-like content, compacting long token values into copyable blocks, reducing persistent emoji chrome, and improving formatted Kanban previews.

## Why Now
- `TASK-111` established rich-text support for context cards, so the shared task/context content model is finally ready for lightweight readability upgrades.
- Rich content is now more expressive, but code-like snippets and token-style values still scan poorly and can waste vertical space.
- Emoji controls and current Kanban flattening add noise that undercuts the richer authoring experience.

## Scope Snapshot
- Extend the shared rich-text authoring flow so users can add clearly distinct command/code-like content with practical copy support.
- Introduce a simple user-authored token/value block UI that keeps long values compact, highlighted, and directly copyable.
- Show emoji affordances only while the corresponding text field or editor is focused.
- Improve Kanban preview summarization so formatted rich text reads more naturally at scan time.
- Preserve existing task/context CRUD, sanitization, attachments, and dashboard interaction flows.

## Acceptance Snapshot
- Users can author content that visually distinguishes prose from command/code-like content.
- Long token/value content renders as a compact, copyable, highlighted block instead of a giant wrapped blob.
- Emoji controls appear only while the relevant input/editor is focused.
- Kanban previews summarize rich content more faithfully than the current plain flattening behavior.
- The implementation stays lightweight and understandable inside the current editor/rendering stack.

## Notes
- Full task brief, touch points, and validation expectations live in [`tasks/task-113-rich-content-readability-polish.md`](./task-113-rich-content-readability-polish.md).

---

Last Updated: 2026-03-27
Assigned To: Agent
