# Agent workflow

Open this runbook when selecting or creating a Nexus Dash task, preparing a
branch or PR, or handing off preview evidence. `AGENTS.md` contains the short
repository-wide contract.

## Task source and status

The Nexus Dash project at <https://nexus-dash.app> is the source of truth for
task status, sequence, labels, epics, relationships, and descriptions. The
active card description is its brief; `tasks/current.md` was retired and
`tasks/backlog.md` is a migration record. If choosing work from the board,
check In Progress first, then Backlog in lane order. A direct user request may
also define a small cardless docs or maintenance change.

Agent credentials belong in `.config/.nd-nexus-dash.env` (gitignored); use
`.nd-nexus-dash.example.env` as the contract template. Exchange the API key
at `/api/auth/agent/token` for a short-lived bearer token. Never commit or
print a key or token.

For a board task, read its acceptance criteria before implementation. Tighten
missing or vague criteria, especially for auth, deployment, runtime
validation, or external-service changes. Capture required secrets, local
prerequisites, and review or preview assumptions on the card when relevant.
Move the card to In Progress when starting work with
`POST /api/projects/{projectId}/tasks/{taskId}/status`. Do not move it to Done;
the reviewer or PR merger does that. Add a short handoff comment only when
there is a decision, validation result, blocker, or follow-up worth recording.

## Creating and refining tasks

Search the live project for an existing or overlapping outcome first. A new
card should be independently understandable:

- Use a concise, outcome-oriented title of at most 120 characters and one
  canonical work-type label: `feature`, `fix`, `docs`, `refactor`, or `chore`.
- Start the description with `Rationale:`, then state the intended scope and
  testable `Acceptance Criteria:`. Add `Definition Of Done:` when delivery or
  validation needs further clarification.
- Keep one implementation outcome per task. Represent dependencies using
  Related Tasks rather than repeated `Dependencies:` prose.
- Attach counterpart GitHub issues or external resources as link attachments
  (`attachmentLinks` entries shaped as `{ name, url }`). The task update API
  appends links; removal uses the attachment DELETE route.

Read a newly created card back through the agent API and verify its lane,
description, labels, attachments, and relationships. The hosted API guide is
`/docs/agent/v1`; its OpenAPI document is
`/api/docs/agent/v1/openapi.json`. Do not put credentials in card content.

For epics, keep membership in linked tasks and dependencies in Related Tasks.
Start the epic description with a complete `Recommended order:` path through
its linked task keys, joined by `->`, and follow it with a short rationale.
Refresh the path when membership or sequence changes.

## Branch, PR, and review

Use one branch and one PR per task. For a board card, include its ID in the
branch and PR title. For cardless work, use a descriptive slug. Branch from
current `origin/main` with the appropriate work-type prefix. Use a separate
worktree when the root checkout is dirty or another agent is active. The
`npm run worktree:create -- TASK-XXX slug` helper accepts legacy `TASK-XXX`
IDs; use `git worktree add` for `ND-XXX` or cardless work. Do not mix unrelated
work or commit directly to `main`.

Push after meaningful progress and again before handoff. Open a reviewable PR
once the change is ready; use a draft only when the user requests one or the
change genuinely is not reviewable yet. Wait for the initial automated review
outcome. Address relevant comments, reply and resolve addressed threads, and
explain suggestions that are intentionally declined. The handoff identifies
the commit SHA and validation performed.

## Validation and preview

`AGENTS.md` defines the required validation baseline. Use
`docs/runbooks/local-validation.md` for local setup and
`docs/runbooks/rls-tenant-isolation.md` for database security changes.

When acceptance criteria or review require a preview, dispatch
`deploy-vercel.yml` with `action=deploy-preview` and an explicit
`git_ref=<active-branch-or-sha>`. Wait for that workflow run, verify in its
logs which ref was checked out, and record the preview URL or artifact. The
workflow's `headBranch` display alone does not prove the checkout ref.
Use `PLAYWRIGHT_BASE_URL=<preview-url>` for Playwright checks against that
deployment. See `docs/runbooks/github-actions-workflows.md` for the workflow
contract and `docs/runbooks/protected-preview-agent-access.md` when testing
agent access on a protected preview.

## Documentation at handoff

Update affected user or operator docs with the change. Record meaningful
execution events, blockers, decisions, and validation outcomes in `journal.md`.
Record architecture-impacting decisions in `adr/decisions.md`; add a focused
ADR only when deeper rationale is needed. Keep live task status on the board,
not in `project.md` or `tasks/backlog.md`.
