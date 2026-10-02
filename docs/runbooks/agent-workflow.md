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
`.nd-nexus-dash.example.env` as the contract template. Copy it to the
gitignored path and fill in real values when first needed. Exchange the API
key at `/api/auth/agent/token` for a short-lived bearer token at runtime.
Never commit or print a key or token.

For a board task, read its description and acceptance criteria before
implementation. Consult `project.md` for architectural orientation and
`README.md` for runtime, environment, or test details as the task requires.
Tighten missing or vague criteria, especially for auth, deployment, runtime
validation, or external-service changes. Capture local prerequisites (such as
PostgreSQL reachability), required secrets and environment assumptions, and
review or preview assumptions on the card; link the relevant runbook when
preview validation is expected. If the selected task is complete or invalid,
pick the next one from In Progress, then Backlog in lane order.

When starting a board task, move the card to In Progress with
`POST /api/projects/{projectId}/tasks/{taskId}/status` and
`{"status": "In Progress"}`. Leave a short pickup comment saying what you
will do next. When the job is done, leave a short completion comment with the
result and relevant PR, validation, decision, blocker, or follow-up. Write
plain English, as short as possible, one topic per comment; do not repeat the
task description. Never move the card to Done: the reviewer or PR merger does
that, even if an older brief or generated quickstart says otherwise.

## Creating and refining tasks

Search the live project for an existing or overlapping outcome first. A new
card should be independently understandable:

- Use a concise, outcome-oriented title of at most 120 characters. Compact
  card views truncate long titles, though the full title remains visible when
  opened. Add one canonical work-type label: `feature`, `fix`, `docs`,
  `refactor`, or `chore`; add priority or program labels only when supported.
- Start the description with `Rationale:`, then state the intended scope and
  testable `Acceptance Criteria:`. Keep it short enough to scan and omit
  padding and file-by-file walkthroughs. Add `Definition Of Done:` when
  delivery or validation needs further clarification.
- Keep one implementation outcome per task. Represent dependencies using
  Related Tasks rather than repeated `Dependencies:` prose. Split outcomes
  that can be delivered independently, then relate the resulting cards. Use
  description prose for sequencing only when the relationship cannot convey it.
- Attach counterpart GitHub issues or external resources as link attachments
  at creation (`attachmentLinks` entries shaped as `{ name, url }`), rather
  than burying URLs in the description. To add a link later, PATCH
  `/api/projects/{projectId}/tasks/{taskId}` with `attachmentLinks`; this
  appends and preserves existing attachments. Remove a link or file with
  `DELETE /api/projects/{projectId}/tasks/{taskId}/attachments/{attachmentId}`.
  Editing a link's name or URL in place remains a kanban UI operation; the
  wider agent API edit gaps are tracked in ND-425.

Read a newly created card back through the agent API and verify its lane,
description, labels, attachments, and relationships. Creation is incomplete
until the stored card matches the intended contract and contains no secrets.
The hosted API guide is `/docs/agent/v1`; its OpenAPI document is
`/api/docs/agent/v1/openapi.json`.

For epics, keep membership in linked tasks and dependencies in Related Tasks;
do not put dependency lists, split manifests, or staging notes in the epic
description. Start with a `Recommended order:` path covering every linked
task key, joined by `->` without ellipses, and follow with a short rationale.
Refresh the path when membership or sequence changes.

## Implementation quality

Follow repository patterns and write clean, maintainable code. Prefer reuse
and focused abstractions over duplication; separate responsibilities and use
SOLID principles where they help shape services, components, and utilities.

## Branch, PR, and review

An issue should map to one Nexus Dash task; identify or create its card before
implementation. Use one branch and one PR per task. For a board card, include
its ID in the branch and PR title; do not use generic titles such as `[codex]`.
For cardless work, use a descriptive slug. Start the branch from current
`origin/main` before implementation, for example with
`git switch -c <prefix>/<id>-<slug> origin/main`. Choose `feature/` for planned
product work, `fix/` for bugs or remediations, `docs/` for documentation,
`refactor/` for behavior-preserving restructuring, and `chore/` for other
maintenance. CI permits `dependabot/` for Dependabot-authored PRs.

Use a separate worktree when the root checkout is dirty or another agent is
active. The `npm run worktree:create -- TASK-XXX slug` helper accepts legacy
`TASK-XXX` IDs, creates or reuses the task branch, and uses a sibling
directory such as `../nexus_dash_task124`. Use `git worktree add` for `ND-XXX`
or cardless work.
Keep the root checkout free for coordination when agents work concurrently.
Do not mix unrelated work or commit directly to `main`.

Push after meaningful progress and again before handoff. Open a reviewable PR
once the change is ready; use a draft only when the user requests one or the
change genuinely is not reviewable yet. Wait for the initial automated review
outcome. Address relevant comments, reply and resolve addressed threads, and
explain suggestions that are intentionally declined. The handoff identifies
the commit SHA and validation performed. A completed Copilot review with no
comments is a clean review state with nothing to address. Reuse the same PR
for further work on that task and keep its remote branch current.

## Validation and preview

`AGENTS.md` defines the required validation baseline. Use
`docs/runbooks/local-validation.md` for local setup and
`docs/runbooks/rls-tenant-isolation.md` for database security changes.
For the real PostgreSQL matrix, run `npm run test:rls:setup` followed by
`npm run test:rls`. For deployment-affecting changes, also validate the
contracts in `README.md`, `docs/runbooks/vercel-env-contract-and-secrets.md`,
and `docs/runbooks/database-connection-hardening.md`.

When acceptance criteria or review require a preview, dispatch
`deploy-vercel.yml` with `action=deploy-preview` and an explicit
`git_ref=<active-branch-or-sha>`. Wait for that workflow run, verify in its
logs which ref was checked out, and record the preview URL or artifact. The
workflow's `headBranch` display alone does not prove the checkout ref.
Use `PLAYWRIGHT_BASE_URL=<preview-url>` for Playwright checks against that
deployment. See `docs/runbooks/github-actions-workflows.md` for the workflow
contract and `docs/runbooks/protected-preview-agent-access.md` when testing
agent access on a protected preview. The preview URL also appears in the
`preview-deployment` artifact and job summary. For UI-heavy changes, browser
automation against the preview is encouraged; record the URL and whether the
check was Playwright, browser automation, or both.

The manual path is:

```bash
gh workflow run deploy-vercel.yml -f action=deploy-preview -f git_ref=<branch-or-sha>
gh run list --workflow deploy-vercel.yml --event workflow_dispatch --limit 10
gh run watch <selected-run-id> --exit-status
gh run download <selected-run-id> -n preview-deployment --dir .tmp/preview
```

Select and verify the run for this dispatch before downloading its artifact.
For Playwright against the deployed preview, set `PLAYWRIGHT_BASE_URL` to the
URL in `.tmp/preview/preview-deployment.txt`. In PowerShell:

```pwsh
$env:PLAYWRIGHT_BASE_URL = (Get-Content -Raw .tmp/preview/preview-deployment.txt).Trim()
npx playwright test tests/e2e/smoke-project-task-calendar.spec.ts
```

## Documentation at handoff

Update affected user or operator docs with the change. Record meaningful
execution events, blockers, decisions, and validation outcomes in `journal.md`.
Record architecture-impacting decisions in `adr/decisions.md`; add a focused
ADR only when deeper rationale is needed. Keep live task status on the board,
not in `project.md` or `tasks/backlog.md`.

Before handoff, confirm the card's acceptance criteria are met, required
validation is green, and the card and relevant tracking docs are consistent.
