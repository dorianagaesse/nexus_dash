# Current Task

## Task

- ID: TASK-336
- Title: Multi-user collaboration audit - ownership, assignment, and traceability
- Status: Complete (2026-07-27)
- Branch: `docs/task-336-multi-user-collaboration-audit`
- Pull request: [#393](https://github.com/dorianagaesse/nexus_dash/pull/393)
- Brief: [`task-336-multi-user-collaboration-audit.md`](./task-336-multi-user-collaboration-audit.md)

## Objective

Audit NexusDash as a shared human-and-agent execution workspace, identify
features that still behave like private single-user tools, and convert the
findings into a coherent, prioritized refinement backlog.

## Scope

- Inventory the product's project, task, epic, roadmap, context, meeting,
  calendar, notification, attachment, sharing, and agent surfaces.
- Evaluate each collaborative object for ownership, assignment,
  author/editor attribution, activity history, permissions, notifications,
  discovery, handoff, and lifecycle accountability.
- Distinguish project access from object-level responsibility and avoid adding
  assignment concepts where they would not create meaningful accountability.
- Document cross-cutting collaboration principles and gaps with repository
  evidence.
- Create independently implementable backlog tasks with rationale,
  dependencies, sequencing, and explicit boundaries.

## Acceptance Criteria

1. The audit covers every implemented project-dashboard module plus sharing,
   notifications, attachments, account-scoped integrations, and agent access.
2. Each audited surface records its current collaboration strengths, material
   gaps, user impact, and recommended direction.
3. The audit explicitly evaluates ownership, assignment, authorship,
   modification attribution, history, permissions, notifications, handoff, and
   agent/human identity.
4. Recommendations distinguish accountable ownership from participation,
   creation, editing, and mere visibility.
5. Findings are prioritized by collaboration risk and implementation
   dependency rather than by visual prominence alone.
6. Every material remediation is represented by a focused `TASK-XXX` backlog
   entry with rationale and dependencies; duplicate or already-planned work is
   referenced instead of recreated.
7. Meeting-note ownership and meeting-todo assignment receive specific
   treatment, while the audit also identifies comparable gaps elsewhere.
8. The audit is evidence-based from schema, services, routes, UI, tests, and
   available runtime behavior.

## Definition Of Done

- A dated audit document is committed under `docs/audits/`.
- `tasks/backlog.md` contains the resulting prioritized refinement tasks and
  updated review date.
- `tasks/current.md` and `journal.md` record the audit outcome.
- Documentation links and formatting pass repository checks.
- The branch is committed and pushed, a ready-for-review PR is open, and
  initial automated review/check feedback is handled before handoff.

## Outcome

- Audited the collaboration contract across projects, membership, tasks,
  meetings, context cards, epics, roadmap, Calendar, attachments,
  notifications, agents, realtime activity, and concurrent editing.
- Established tasks as the current accountability benchmark while documenting
  the difference between access, stewardship, assignment, participation,
  authorship, following, and credential ownership.
- Produced
  [`task-336-multi-user-collaboration-audit.md`](../docs/audits/task-336-multi-user-collaboration-audit.md)
  with repository evidence, a target human-and-agent actor model, prioritized
  risks, cautions, and program-level success signals.
- Added TASK-337 through TASK-348 as a sequenced collaboration refinement
  program and strengthened existing TASK-330 and TASK-331 to reuse the shared
  actor and capability foundations.

## Validation

- Production build passed against isolated local PostgreSQL with process-only
  test/build credentials.
- Seven focused Chromium Playwright flows passed across project, task,
  context, meeting, participant identity, roadmap, and Calendar surfaces.
- `npm run lint`, `npm run rls:check`, `npm run release:check`, unique backlog
  ID validation, Markdown link validation, and `git diff --check` passed.
- Ready-for-review PR #393 passed branch naming, Quality Core, Playwright,
  PostgreSQL tenant isolation, and container-image checks on reviewed commit
  `fe5f525`.
- Copilot's two initial documentation comments were addressed in `fe5f525`;
  both threads were answered and resolved.
