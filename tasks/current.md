# Current Task

## TASK-356: Meeting Note Stewardship and Decision Provenance

## Status

UI simplification and current-`main` conflict reconciliation are complete on
`feature/task-356-meeting-note-stewardship-r4` following review feedback on
PR #453; validation is green and the branch is ready for review.

## Context

`ProjectMeetingNote` already records `createdByUserId` and `updatedByUserId`,
but every editor is functionally interchangeable: there is no visible
accountable steward, the meeting-todo follow-ups live under an anonymous
parent, and the audit-driven "needs decision provenance" call to action has no
note-level surface.

TASK-330 introduced the reusable meeting-todo actor contract for human
project members and active project agent credentials. This task continues the
deliberate, narrow pattern: surface a single, reassignable steward/facilitator
on every meeting note without expanding into cross-artifact ownership or a
workspace ownership queue.

## Scope

- Add a durable steward/facilitator actor to `ProjectMeetingNote`, modeled on
  the existing meeting-todo actor contract.
- Backfill steward identity from the note creator for existing rows.
- Surface creator, last editor, update time, and steward identity in the
  meeting-notes panel and meeting detail view.
- Add accessible steward assignment controls (label, keyboard, focus, 44px
  target, light/dark, semantic status) in the meeting detail and note
  preparation flow; viewers see the same identity without mutation
  affordances.
- Add steward responsibility filters (`All`, `Stewarded by me`,
  `Unstewarded`) for both active and archived notes.
- Reuse the established human/agent registry and chip so removed members and
  revoked/expired agents surface as `Needs reassignment` rather than silently
  orphaning the note.
- Keep steward persistence independent from participants and meeting-todo
  assignees, while presenting the responsible participant/member with a
  distinct crowned avatar treatment in the meeting UI.
- Make note mutation and deletion capability explicit by reusing the existing
  owner/editor/viewer boundary; viewers see steward identity without edit
  affordances.

## Out Of Scope

- A universal project-actor foundation or cross-artifact actor migration
  (TASK-337).
- A workspace-wide stewardship queue (TASK-346).
- New agent capability vocabulary or granular meeting scopes (TASK-331).
- Mentions, follow notifications, or notification preferences beyond the
  existing overdue reminder pipeline (TASK-347).
- Conflict-safe revision preconditions or draft recovery (TASK-339).
- Durable collaboration history or audit timelines (TASK-340).
- Decision-level authorship beyond the note-level steward/facilitator (this
  task keeps the existing single `decisions` text field untouched).

## Acceptance Criteria

1. Every meeting note exposes creator, last editor, update time, and an
   optional steward/facilitator with actor kind, stable identifier, display
   label, avatar treatment, and current access state. Stewards are rendered
   with the same chip vocabulary used for meeting-todo assignees, including
   `Needs reassignment` for removed or revoked actors. In the meeting modal,
   the steward is visually attached to the participant/member identity with an
   amber border and crown, while provenance sits at the bottom of the content.
2. New notes persist a steward that defaults to the note creator. Existing
   notes are backfilled from `createdByUserId`. Editing a note preserves the
   steward unless the editor explicitly reassigns or clears it; the steward
   must survive unrelated field edits.
3. Editors can assign or clear a steward from meeting detail and the
   preparation flow using a labeled, keyboard-operable chip with pending and
   error feedback. Viewers see steward identity without mutation
   affordances, and the mutation/deletion boundary is explicit in the UI.
4. Steward validation is enforced in the service boundary. Human steward
   candidates must currently own or belong to the project; agent steward
   candidates must be active, unexpired credentials for that project.
   Stewardship never grants access, and external meeting participants are
   never selectable as stewards.
5. Removed human members and revoked/expired agents remain visibly attached
   to their note as inactive and labeled `Needs reassignment` until cleared
   or reassigned.
6. The meeting notes panel supports stable URL-backed
   `All`/`Stewarded by me`/`Unstewarded` filters for both active and archived
   lists, with accurate counts and useful filtered empty states.
7. UI remains usable at 375px and desktop widths, in light and dark themes,
   with visible focus, semantic status text, at least 44px primary touch
   targets, and no color-only stewardship state.
8. Stewardship survives the existing project-scoped realtime reconciliation,
   and a steward change emits a project activity event so observers refresh
   correctly.

## Definition Of Done

- Prisma schema, migration, RLS inventory, services, routes, UI projections,
  and relevant documentation are updated together.
- Focused unit, service, route, component, and Playwright coverage exercises
  human/agent stewardship, invalid actors, inactive states, steward filters,
  creator/last-editor provenance, role restrictions, and steward
  defaults/backfill.
- `npm run lint`, `npm run rls:check`, `npm test`, `npm run test:coverage`,
  `npm run build`, and relevant meeting-note E2E coverage pass.
- `tasks/current.md`, `tasks/backlog.md`,
  `tasks/task-356-meeting-note-stewardship.md`, and `journal.md` reflect the
  delivered behavior.
- The branch is pushed, a ready-for-review PR is open, required checks are
  green, and initial Copilot review feedback is resolved or documented.

## Runtime Assumptions

- Local database-backed validation uses the repository `.env` contract and a
  reachable PostgreSQL instance when migration or E2E execution requires it.
- No new secrets or external provider configuration are introduced.
- Preview deployment is not an acceptance requirement; local browser coverage
  is sufficient unless review feedback exposes a preview-only concern.
