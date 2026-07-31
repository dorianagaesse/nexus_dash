# TASK-351 User-Facing Task IDs

## Summary

NexusDash tasks currently expose only titles in the product UI. The stable task
identity is a CUID used for database relations and URLs, but that value is
opaque, unsuitable for conversation, and intentionally absent from the task
interface. Duplicate or similar titles therefore leave users without a concise
way to identify a task in discussion or related-task search.

TASK-351 adds a separate immutable numeric reference. The application renders
that number as `ND-<number>`, keeps the CUID as the internal primary key, and
surfaces the friendly reference only where users need to identify or find a
task.

## Product Decisions

- References are globally unique rather than project-local, so `ND-42` points
  to at most one task even outside the immediate project conversation.
- PostgreSQL owns allocation through an auto-incrementing sequence. Concurrent
  creates cannot choose the same reference.
- Deleted task references are not reused.
- The database stores the numeric value; a shared formatter owns the `ND-`
  presentation prefix.
- The task-detail header and related-task suggestions show the reference in
  compact, tabular/monospaced text that stays subordinate to the title.
- Related-task search indexes the formatted reference in addition to title and
  status. Internal CUIDs are not added to the search haystack.
- TASK-352 remains responsible for the broader status-color and candidate-row
  visual redesign.

## Data and Architecture

- Add `Task.referenceNumber Int @unique @default(autoincrement())`.
- Add a PostgreSQL migration that backfills every existing task and creates the
  unique index and sequence-backed default.
- Include `referenceNumber` in task list and mutation payloads.
- Keep persistence access in `lib/services/**`; API routes continue to map
  service results without allocating references themselves.
- Use the existing internal `Task.id` for route paths, relation rows,
  optimistic reconciliation, and service authorization.

## UI/UX Guidance

The UI/UX Pro Max review classifies NexusDash as a data-dense project dashboard.
For this focused task:

- Preserve the current information hierarchy: status, reference, title.
- Use semantic theme tokens and existing badges instead of new ad-hoc colors.
- Use `font-mono` and tabular numerals for a stable, scannable identifier.
- Keep every suggestion row at least 44 px high and retain existing keyboard
  listbox behavior and visible focus states.
- Include the reference in the option's accessible name through visible text.
- Verify 375 px containment and both color schemes.

## Acceptance Criteria

1. Existing and new tasks receive unique stable references rendered as
   `ND-<number>`.
2. Task mutations and reloads never change the reference.
3. The task-detail modal shows the reference in read and edit modes.
4. Related-task suggestions show and can be filtered by reference.
5. No internal task CUID is displayed or searchable.
6. Authorization and candidate eligibility behavior is unchanged.
7. Focused automated coverage proves migration/backfill, payload mapping,
   reference search, and responsive UI behavior.

## Validation Plan

- Prisma schema validation and migration SQL inspection/test.
- Focused formatter, API/service, and related-task component tests.
- Focused Playwright coverage for create, detail display, reference search,
  mutation stability, reload stability, and narrow viewport containment.
- Repository baseline: lint, RLS inventory, unit tests, coverage, build, release
  policy, and relevant E2E.
