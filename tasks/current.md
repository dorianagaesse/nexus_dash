# Current Task

## Task

- ID: TASK-329
- Title: Meeting participant identities - shared user avatars and initials for guests
- Status: Complete (2026-07-26)
- Branch: `feature/task-329-meeting-participant-identities`
- Pull request: [#391](https://github.com/dorianagaesse/nexus_dash/pull/391)
- Brief: [`task-329-meeting-participant-identities.md`](./task-329-meeting-participant-identities.md)

## Objective

Make meeting participants recognizable and reusable by linking project
collaborators to their NexusDash identities, retaining previous external
participants as suggestions, and presenting every selected participant with a
consistent avatar treatment.

## Scope

- Replace the free-form-only meeting participant control with an accessible
  searchable participant picker.
- Search current project collaborators and distinct external participants from
  previous meeting notes in the same project.
- Render NexusDash collaborators with the shared generated user avatar and
  external participants with same-shape initials avatars.
- Keep multi-word external names editable: Space only types, while Tab, Enter,
  an explicit plus button, or selecting a suggestion adds a participant.
- Preserve existing meeting participant data and search behavior through any
  required persistence migration.

## Runtime Assumptions

- Existing local PostgreSQL and `.env` prerequisites are unchanged.
- The migration must be safe for all existing meeting notes with string-array
  participants.
- Preview validation, when run, uses
  `git_ref=feature/task-329-meeting-participant-identities` and verifies that
  exact ref in workflow logs.

## Acceptance Criteria

1. Selected participants in prepare/edit and meeting-detail surfaces render as
   compact avatar identities rather than plain text-only chips.
2. Project collaborators use the same generated avatar shape and identity data
   as other NexusDash user surfaces.
3. External participants use a same-size circular initials avatar derived
   predictably from their display name.
4. Typing filters project collaborators and distinct external participants
   previously used in meeting notes for that project.
5. Suggestions clearly distinguish NexusDash collaborators from previous
   external participants and omit already-selected identities.
6. Space and comma remain ordinary input characters; Tab, Enter, the explicit
   plus button, and suggestion activation add a participant.
7. Multi-word external names are normalized, deduplicated case-insensitively,
   bounded by existing limits, and remain available for future meetings.
8. The picker is keyboard and screen-reader operable, visibly focused, usable
   at 375 px, and consistent in light and dark themes.
9. Existing notes migrate without participant loss, project isolation remains
   enforced, and meeting-note search continues to match participant names.
10. Focused service, route, component, migration/RLS, and Playwright coverage
    exercise collaborator linking, previous-external suggestions, initials,
    explicit add keys/actions, editing, and legacy data preservation.

## Definition Of Done

- Implementation follows existing service, API-adapter, avatar, accessible
  overlay, and project-role boundaries.
- `npm run lint`, `npm run rls:check`, `npm test`, `npm run test:coverage`,
  `npm run build`, and relevant Playwright coverage pass.
- Baseline and completed light/dark desktop plus 375 px screenshots are
  captured and visually reviewed with no overflow, clipped suggestions, or
  ambiguous participant state.
- Product version, changelog, task/backlog tracking, journal, and any required
  RLS/architecture records are updated.
- The branch is committed and pushed, a ready-for-review PR is open, and
  initial automated review/check feedback is handled before handoff.

## Outcome

- Replaced meeting participant strings with ordered participant identities
  that optionally link to a current NexusDash user and retain an external
  display-name snapshot.
- Added collaborator and previous-guest search, shared user avatars,
  same-shape guest initials avatars, explicit add/remove actions, accessible
  listbox semantics, and responsive portaled suggestions.
- Space and comma now remain in the input; Tab, Enter, suggestion activation,
  and the visible plus control add participants, while blur leaves unfinished
  text untouched.
- Backfilled all legacy participant strings without changing order or text,
  added parent-derived RLS, retained legacy string request compatibility, and
  prepared release `v0.30.0`.

## Validation

- Transactional migration/rollback validation preserved all 5 existing
  participant rows exactly; deployment then succeeded against both the
  configured development database and a clean local PostgreSQL database.
- `npm run lint`, `npm run rls:check`, `npm run release:check`, and
  `git diff --check` passed.
- Focused coverage passed: 5 files / 26 tests.
- `npm test`: 136 files passed, 2 skipped; 969 tests passed, 2 skipped.
- `npm run test:coverage`: 91.37% statements, 81.33% branches, 92.2%
  functions, and 91.88% lines.
- The local PostgreSQL `npm run test:rls:setup` and `npm run test:rls` matrix
  passed with explicit meeting participant cross-project, editor, viewer, and
  revoked-member checks.
- `npm run build` passed with documented local-safe database and build-only
  secret placeholders.
- Full Playwright passed all 26 scenarios, including TASK-329 collaborator,
  prior-guest, multi-word input, explicit-add, persistence, and avatar checks.
- Baseline and completed screenshots were visually reviewed in
  `.tmp/task329-baseline/screenshots/` and `.tmp/task329-final/screenshots/` at
  375 px and 1440 px in light and dark themes.
- Ready-for-review PR #391 passed branch naming, Quality Core, Playwright,
  PostgreSQL tenant isolation, and container-image checks on reviewed commit
  `aa79a73`.
- Copilot's initial review raised two related locale-stability comments.
  Commit `aa79a73` replaced locale-dependent casing in participant identity
  and deduplication keys; focused tests and lint passed, and both threads were
  answered and resolved.
