# TASK-352 Related-Task Picker Presentation

## Summary

TASK-350 made the full authorized related-task candidate set reachable and
TASK-351 added stable user-facing references. The picker now contains the right
information, but each suggestion still reads as an undifferentiated reference
and title pair. Status participates in search without being visible, and the
picker does not reuse the status colors that users already learn from the
Kanban board.

TASK-352 refines only this presentation. It gives the reference, title, and
status predictable visual roles while preserving candidate eligibility,
search, keyboard navigation, scrolling, and relation mutations.

## Product Decisions

- Candidate information order is reference, title, status: stable identity
  first, distinguishing content second, workflow state last.
- The reference stays monospaced with tabular numerals and a bounded width so
  IDs align while titles receive the flexible space.
- Titles remain one line and truncate with an ellipsis. Their full value is
  preserved in the option's accessible name and exposed as hover text.
- Status uses a compact outlined badge with the exact light/dark palette
  established by the matching Kanban column.
- Visible status text is mandatory. Color reinforces the state but never
  carries it alone.
- The complete row remains the selection target and stays at least 44 px high.
- No new animation is needed; the established hover, active, and focus
  treatments remain the interaction feedback.

## Shared Presentation Boundary

The Kanban column currently owns its status badge classes locally. Move that
badge palette into a client-safe presentation module keyed by `TaskStatus`, and
consume it from both the column header and related-task candidates. Column
backgrounds, drag states, accent bars, empty-state copy, and icons remain local
to the Kanban grid because they are not shared by this task.

## UI/UX Guidance

The UI/UX Pro Max review classifies NexusDash as a dense productivity
dashboard. For this component:

- Keep the existing semantic theme tokens and subdued flat presentation.
- Use a three-track grid with a fixed reference, `minmax(0, 1fr)` title, and
  content-sized status so long text cannot force horizontal overflow.
- Retain the 44 px row target, keyboard-owned combobox focus, listbox
  semantics, visible focus ring, and viewport-aware vertical scrolling.
- Provide text in addition to status color and include the full task identity
  in the accessible name.
- Check 375 px containment, long text, light mode, and dark mode independently.
- Avoid decorative motion, raw color values, hidden status meaning, and title
  overflow.

## Acceptance Criteria

1. Each candidate visibly exposes its friendly reference, title, and status.
2. Status badges reuse the Kanban column palette through a shared module.
3. Option names announce reference, full title, and status.
4. Long titles visibly truncate without clipping the reference or status and
   without creating mobile horizontal overflow.
5. The existing search, navigation, scrolling, and selection interaction
   contract is unchanged.
6. Focused component and browser tests cover all four statuses, accessible
   naming, long-title containment, 375 px layout, and both themes.

## Validation Plan

- Focused status-presentation and related-task component tests.
- Focused Playwright coverage for create/edit candidate rows, long titles,
  keyboard selection, narrow viewport containment, and light/dark themes.
- Repository baseline: lint, RLS inventory, unit tests, coverage, build,
  release-policy validation, and relevant E2E.
