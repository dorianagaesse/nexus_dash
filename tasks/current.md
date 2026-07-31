# Current Task

## Task

- ID: TASK-351
- Title: User-facing task IDs
- Status: In review (2026-07-30)
- Branch: `feature/task-351-user-facing-task-ids`
- Pull request: [#402](https://github.com/dorianagaesse/nexus_dash/pull/402)
- Brief: [`task-351-user-facing-task-ids.md`](./task-351-user-facing-task-ids.md)

## Objective

Give every task a concise, stable reference that users can read, search, and
share without exposing the opaque database ID.

## Scope

- Add an immutable database-generated numeric reference to every existing and
  future task.
- Format references consistently as `ND-<number>` at the application boundary.
- Show the reference in the task-detail header in read and edit modes.
- Show the reference beside every related-task search candidate.
- Match related-task searches by formatted reference as well as title and
  status.
- Preserve internal task IDs for routing, mutations, relations, and
  authorization.
- Add focused migration, mapping, component, API, and browser coverage.

## Runtime Assumptions

- The PostgreSQL migration must backfill existing tasks and allocate future
  references atomically through a database sequence.
- References are globally unique, immutable, and never reused after task
  deletion.
- Existing local PostgreSQL and `.env` prerequisites are unchanged.
- Browser validation uses the existing Playwright project/task fixture and may
  run locally or against a branch preview.
- Any preview validation must pass
  `git_ref=feature/task-351-user-facing-task-ids` explicitly.

## Acceptance Criteria

1. Every existing and newly created task has one globally unique numeric
   reference rendered as `ND-<number>`.
2. A task keeps the same reference after title, status, relation, archive, and
   restore mutations and after a full reload.
3. The task-detail modal exposes the reference in both read and edit modes
   without displaying the internal database ID.
4. Every related-task candidate exposes its reference beside its title.
5. Searching the related-task picker by a complete or partial formatted
   reference returns the authorized matching task in create and edit flows.
6. Reference display and search remain keyboard accessible, readable at a
   375 px viewport, and compatible with light and dark themes.
7. Project authorization, active/archived candidate rules, bilateral
   relations, and internal task routing remain unchanged.
8. Focused migration/mapping, service/API, component, and Playwright coverage
   passes.
9. Release metadata, task tracking, root-cause notes, and validation evidence
   are updated in the same pull request.

## Definition Of Done

- The migration safely backfills existing rows and uses a database sequence for
  concurrency-safe future allocation.
- Reference formatting is centralized and reused by server/client presentation
  paths.
- The modal and related-task picker meet the UI/UX accessibility and responsive
  checks from the UI/UX Pro Max review.
- `npm run lint`, `npm run rls:check`, `npm test`, `npm run test:coverage`,
  `npm run build`, release validation, and relevant Playwright coverage pass.
- The feature release advances to `v0.32.0` with matching changelog and lockfile
  metadata.
- The branch is committed and pushed, a ready-for-review PR is open, and
  initial Copilot review/check feedback is handled without merging the PR.

## Progress

- Confirmed TASK-351 is the next backlog item after the merged TASK-350 work.
- Created the dedicated worktree and feature branch from `origin/main`.
- Chose a globally unique `ND-<number>` reference so users can cite a task
  unambiguously while opaque CUIDs remain internal.
- Completed the UI/UX Pro Max design-system, accessibility/search, and Next.js
  implementation reviews for the modal and related-task picker surfaces.
- Added `Task.referenceNumber` with sequence-backed backfill, uniqueness, and
  conditional least-privilege `app_runtime` sequence access.
- Centralized `ND-<number>` formatting, added the reference to task list and
  mutation contracts, and documented it in the agent OpenAPI schema.
- Added the reference to read/edit modal headers and related-task candidates;
  create and edit pickers now match complete or partial references without
  indexing internal CUIDs.
- Visually reviewed the desktop edit/search state and verified narrow create
  containment at 375 px.

## Outcome

- Existing and new tasks receive stable, globally unique references while CUIDs
  remain the internal route, mutation, authorization, and relation identity.
- Reference allocation is concurrency-safe and deleted values are not reused.
- Reference values survive task update, relation, and reload flows.
- The task-detail and related-task surfaces preserve the established
  information hierarchy, theme tokens, 44 px options, and keyboard behavior.
- Prepared feature release `v0.32.0`.

## Validation

- `npx prisma validate` and local `prisma migrate deploy` passed; all 49
  migrations are applied.
- `npm run lint`, `npm run rls:check`, `git diff --check`, and
  `npm run release:check -- --base origin/main --branch feature/task-351-user-facing-task-ids`
  passed.
- `npm run test:rls:setup` and `npm run test:rls` passed with the
  least-privilege `NOBYPASSRLS` runtime role.
- `npm test`: 995 passed, 2 skipped.
- `npm run test:coverage`: 91.37% statements, 81.33% branches, 92.2%
  functions, 91.88% lines.
- `npm run build` passed with documented local-safe runtime placeholders.
- Focused TASK-351 Playwright coverage passed, followed by the complete
  30-scenario Chromium suite.
- Implementation commit `a3704dd` is pushed and ready-for-review PR #402 is
  open.
- Addressed both initial Copilot review comments: related-task references now
  participate directly in option accessible names, and legacy activity payloads
  may omit `reference` explicitly in the client mutation type.
- Post-review lint, 16 focused component/helper tests, production build, and
  the three related-task Playwright regressions passed.
