# Current Task

## TASK-342: Context Knowledge Stewardship and Attachment Provenance

## Status

Implementation complete on
`feature/task-342-context-knowledge-stewardship-r4`, refreshed onto current
`main` after TASK-406 merged; ready for review.

Follow-up refinement (2026-09-02): the card UI now shows only `Created` and
`Last edit` provenance chips. Steward assignment controls, the steward chip,
and the derived `Needs review` / `Reviewed X` badge were removed from the UI.
Agent attribution was confirmed supported: cards created or edited by an
agent show the agent avatar and credential label, so no separate actor-identity
task is needed.

## Context

Context cards today expose only title, color, content, and attachments. There
is no record of who created the card or who last edited it. A card written by
a former project member or agent looks identical to a fresh card written
yesterday.

TASK-337's universal project-actor model is not implemented yet. This task
introduces a deliberately narrow, reusable context-card actor contract for
human project members and active project agent credentials — mirroring the
TASK-330 meeting-todo pattern — without expanding into cross-artifact ownership
or a shared scheduling system.

## Scope

- Persist durable creator and last editor identity for every context card,
  including safe display snapshots.
- Backfill existing card creators from existing provenance (the resource
  `createdAt` is preserved and remains the immutable creation timestamp).
- Show `Created` and `Last edit` chips with actor identity and timestamps on
  every card: agent actors render the agent avatar plus credential label,
  human actors render their avatar, and removed members render their recorded
  display snapshot.
- Surface the already-stored attachment uploader (human identity and display
  snapshot) on context card attachments so each link/file shows who added it.
- Render the provenance chips legibly in light and dark themes (cards use
  fixed pastel backgrounds, so chips use fixed light surfaces).
- Persist steward assignment and review derivation at the service boundary
  only; these are not surfaced in the card UI.

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
- Steward assignment UI and the derived review/staleness badge in the card
  grid, preview modal, and edit modal. The underlying steward persistence and
  service-boundary validation remain in place.

## Acceptance Criteria

1. Each context card exposes creator and last editor identity, with actor
   kind, stable identifier, display label, avatar treatment, and current
   access state.
2. New cards record creator and last editor on creation. Existing cards
   backfill creator and last editor from existing provenance (when present)
   and otherwise expose `Unknown actor` snapshots that are clearly labeled
   inactive so they cannot be confused with live collaborators. Editing a
   card advances the last editor but never replaces creator identity.
3. Agent-authored cards show the agent avatar and credential label in both
   the `Created` and `Last edit` chips; no additional actor-identity work is
   required for agent attribution.
4. Cards created or edited by removed human members continue to show their
   original identity and are labeled as no longer project-active.
5. Each context-card attachment shows the recorded uploader with a stable
   display label and avatar treatment. Attachments uploaded by removed
   human members continue to show their original identity and are labeled
   as no longer project-active.
6. The card UI contains no steward assignment controls, no steward chip, and
   no `Needs review` / `Reviewed X` badge; only `Created` and `Last edit`
   chips with timestamps remain, legible at 375px and desktop widths, in
   light and dark themes, with visible focus and semantic status text.

## Definition Of Done

- Prisma schema, migration, RLS inventory, services, routes, UI projections,
  attachment uploader display, and relevant documentation are updated
  together.
- Focused unit, service, route, component, and Playwright coverage exercises
  human/agent actor attribution, inactive actors, attachment uploader display,
  and optimistic projection.
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
