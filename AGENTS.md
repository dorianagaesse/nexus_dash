# NexusDash repository instructions

Use this file for rules that apply throughout the repository. Read other
documentation when the task calls for it:

| Need | Source |
| --- | --- |
| Product and architecture orientation | `project.md` |
| Setup, environment, scripts, and runtime | `README.md` |
| Board tasks, branches, PRs, and preview handoff | `docs/runbooks/agent-workflow.md` |
| Local validation | `docs/runbooks/local-validation.md` |
| Deployment workflows | `docs/runbooks/github-actions-workflows.md` |
| Historical decisions | `adr/decisions.md` and focused ADRs in `adr/` |
| Past execution details | Search `journal.md` for the relevant task or date |

`journal.md` is a reference, not a startup read.

## Work and delivery

- The Nexus Dash project at <https://nexus-dash.app> owns task status,
  sequencing, relationships, and task briefs. For work tied to a board card,
  read its description and acceptance criteria before implementation. Search
  the board before creating a duplicate card. A direct user request for a
  small, cardless change can proceed from that request.
- Keep each change on a dedicated branch and PR. Start from current
  `origin/main`; use a separate worktree when the checkout is dirty or agents
  are working concurrently. Use the matching `feature/`, `fix/`, `docs/`,
  `refactor/`, or `chore/` prefix. For cardless work, use a descriptive slug.
- For a board task, move the card to In Progress and leave a pickup comment
  when work starts. Leave a completion comment when the job is done. Make both
  comments as short as possible, in plain English; state the next step or
  handoff evidence, one topic per comment, without repeating the card. The
  reviewer or PR merger moves the card to Done.
- Push the branch and open a reviewable PR for repository changes unless the
  user explicitly asks otherwise. Handle applicable review feedback and
  report the delivered commit SHA. See the agent workflow runbook for status,
  review, and handoff details.

## Code boundaries

- Follow established patterns; prefer reusable, focused code and separated
  responsibilities over duplication.
- Keep `@/lib/prisma` access in `lib/services/**`. API routes and server
  actions parse input, call services, and map the response or redirect.
- Enforce project authorization in services.
- Read server environment values through `lib/env.server.ts`. Never commit
  credentials or tokens; the agent credential file is
  `.config/.nd-nexus-dash.env` (gitignored).

## Validation and documentation

- For code changes, run `npm run lint`, `npm run rls:check`, `npm test`,
  `npm run test:coverage`, and `npm run build` before handoff. Run
  `npm run test:e2e` for changed UI, auth, calendar, or upload flows. For
  Prisma, RLS, tenant ownership, or runtime database role changes, also run
  the PostgreSQL matrix in `docs/runbooks/rls-tenant-isolation.md`.
  Documentation-only changes need `git diff --check` and link/reference review.
- When preview validation is required, deploy the active branch ref and verify
  that the workflow checked out that ref. Record the workflow run and result.
  Follow `docs/runbooks/github-actions-workflows.md`.
- Update the affected documentation in the same PR. Log meaningful execution
  events in `journal.md`; record architecture decisions in `adr/decisions.md`
  or a focused ADR. Keep `project.md` architectural rather than a copy of the
  live task queue.
