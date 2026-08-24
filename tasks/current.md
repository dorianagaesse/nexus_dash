# Current Task

## TASK-342: Context Knowledge Stewardship and Attachment Provenance

## Status

Implementation complete on
`feature/task-342-context-knowledge-stewardship-r3` in replacement PR #446;
ready for review.

## Context

Context cards today expose only title, color, content, and attachments. There
is no record of who created the card, who last edited it, who is accountable
for keeping it current, or which collaborator uploaded each attachment. A card
written by a former project member or agent looks identical to a fresh card
written yesterday, and a contributor with deep context for a knowledge area has
no visible accountability trail.

TASK-337's universal project-actor model is not implemented yet. This task
introduces a deliberately narrow, reusable context-card actor contract for
human project members and active project agent credentials — mirroring the
TASK-330 meeting-todo pattern — without expanding into cross-artifact ownership
or a shared scheduling system.

## Scope

- Persist durable creator, last editor, and optional steward identity for every
  context card, including safe display snapshots.
- Backfill existing card creators from existing provenance (the resource
  `createdAt` is preserved and remains the immutable creation timestamp).
- Allow steward assignment only to current project members or active, unexpired
  project agent credentials. External meeting guests are not assignment
  candidates (context cards do not use the meeting-participant model).
- Display inactive/revoked stewards as needing reassignment instead of
  silently converting them to unassigned, exactly like the meeting-todo
  assignee chip.
- Surface the already-stored attachment uploader (human identity and display
  snapshot) on context card attachments so each link/file shows who added it.
- Show a derived `Needs review` signal based on the time since the last edit so
  long-untouched cards are easy to spot.
- Add accessible steward controls in the edit modal and preview modal, plus a
  reusable steward chip in the dashboard grid, and surface creator/last editor
  metadata in the preview footer.

## Out Of Scope

- A universal actor table or cross-artifact actor migration (TASK-337).
- Cross-project knowledge responsibility queues (TASK-346).
- New agent capability vocabulary or granular context scopes (TASK-331).
- Assignment notifications or preference controls beyond what the existing
  in-product surfaces already expose (TASK-347).
- Edit locking or revision preconditions on context cards (TASK-339).
- Persisting a full attachment-lifecycle event log. The migration adds
  `uploadedByKind` and `uploadedByDisplayNameSnapshot` to `ResourceAttachment`
  so future producers can rely on a stable contract; existing rows backfill
  `uploadedByKind = human` from the `uploadedByUserId` foreign key.

## Acceptance Criteria

1. Each context card exposes creator, last editor, optional steward, and
   review/staleness state, with actor kind, stable identifier, display label,
   avatar treatment, and current access state.
2. New cards record creator, last editor, and steward-eligible assignment on
   creation. Existing cards backfill creator and last editor from existing
   provenance (when present) and otherwise expose `Unknown actor` snapshots
   that are clearly labeled inactive so they cannot be confused with live
   collaborators. Editing a card advances the last editor but never replaces
   creator identity.
3. Editors and owners can assign or clear a steward from the edit modal and
   the preview modal using a labeled, keyboard-operable control with pending
   and error feedback; viewers see the same identity information without
   mutation affordances.
4. Steward assignment validation is enforced in the service boundary. Human
   candidates must currently own or belong to the project; agent candidates
   must be active, unexpired credentials for that project. Assignment never
   grants access.
5. Removed human members and revoked/expired agents remain visibly attached to
   their card as inactive and are labeled `Needs reassignment` until cleared
   or reassigned.
6. Each context-card attachment shows the recorded uploader with a stable
   display label and avatar treatment. Attachments uploaded by removed
   human members continue to show their original identity and are labeled
   as no longer project-active.
7. Each context card surfaces a derived `Needs review` signal when it has not
   been edited for a configurable threshold (default 90 days). The signal is
   visible in the dashboard grid, the preview modal, and the edit modal; it
   clears automatically when the card is edited.
8. UI remains usable at 375px and desktop widths, in light and dark themes,
   with visible focus, semantic status text, at least 44px primary touch
   targets, and no color-only stewardship or review state.

## Definition Of Done

- Prisma schema, migration, RLS inventory, services, routes, UI projections,
  attachment uploader display, review/staleness signal, and relevant
  documentation are updated together.
- Focused unit, service, route, component, and Playwright coverage exercises
  human/agent steward assignment, invalid actors, inactive states, attachment
  uploader display, review-state derivation, role restrictions, and
  optimistic mutation.
- `npm run lint`, `npm run rls:check`, `npm test`, `npm run test:coverage`,
  `npm run build`, and a focused context-card Playwright coverage pass.
- `tasks/current.md`, `tasks/backlog.md`, `tasks/task-342-context-knowledge-stewardship.md`,
  and `journal.md` reflect the delivered behavior.
- The branch is pushed, a ready-for-review PR is open, required checks are
  green, and initial Copilot review feedback is resolved or documented.

## Runtime Assumptions

- Local database-backed validation uses the repository `.env` contract and a
  reachable PostgreSQL instance when migration or E2E execution requires it.
- No new secrets or external provider configuration are introduced.
- Preview deployment is not an acceptance requirement; local browser coverage
  is sufficient unless review feedback exposes a preview-only concern.
