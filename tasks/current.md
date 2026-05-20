# Current Task: TASK-269 GitHub Actions Workflow Cleanup

## Task ID
TASK-269

## Status
Queued

## Source
- User request after PR #270, PR #271, and PR #272 merged:
  add GitHub Actions workflow cleanup to the top of the backlog.
- `tasks/backlog.md` entry:
  "GitHub Actions workflow cleanup - simplify CI/CD, scheduled jobs, and
  maintenance automation."
- Dedicated brief:
  `tasks/task-269-github-actions-workflow-cleanup.md`.

## Objective
Audit and simplify the repository's GitHub Actions workflows so CI, staged
Vercel deployment, notification email scheduling, dependency security, and
maintenance automation have clear ownership, minimal duplicated logic, and
operator-friendly failure modes.

## Current Baseline
- Quality gates, branch-name checks, staged Vercel deploy/promote/rollback,
  dependency security, Dependabot triage, Copilot repair, and notification
  email dispatch are all active workflow concerns.
- TASK-268 intentionally moved notification email scheduling to a GitHub
  Actions 3-hour production bridge while QStash remains out of the current
  production path.
- TASK-132 added deterministic app version metadata injection to the Vercel
  deploy workflow.
- TASK-259/TASK-272 tightened database env validation and documentation around
  Supabase runtime/admin connection shapes.

## Scope
- Inventory `.github/workflows/**` and document each workflow's owner,
  trigger, required secrets, permissions, artifacts, and expected operator path.
- Remove dead, duplicated, or workaround-shaped workflow logic that no longer
  matches the current production model.
- Normalize reusable env resolution and summaries where workflows share the
  same Vercel, metadata, database, or notification-dispatch assumptions.
- Confirm scheduled jobs have the least practical permissions, explicit
  failure output, and no accidental dependency on interactive environment
  approvals.
- Keep product behavior unchanged unless a workflow bug is found and fixed.

## Acceptance Criteria
1. Every active GitHub Actions workflow has a clear purpose, trigger set,
   permissions block, and documented secret/env contract.
2. Obsolete QStash-era or pre-rotation scheduler/deploy assumptions are removed
   or explicitly marked historical.
3. Notification email dispatch, deploy/promote/rollback, quality gates,
   dependency security, Dependabot triage, and Copilot repair workflows remain
   functionally covered.
4. Workflow summaries and failure messages are clear enough for an operator to
   identify the failing step without reading the whole YAML file.
5. README/runbook references match the final workflow behavior.

## Definition Of Done
- Workflow YAML changes are minimal and behavior-preserving except for
  intentional cleanup fixes.
- Documentation reflects the final workflow contract.
- Relevant workflow syntax and local validation pass.
- The branch is pushed, a PR is opened, Copilot/check feedback is monitored,
  and the handoff includes the delivered commit SHA.

## Validation Plan
- `git diff --check`
- `npm run lint` if workflow-adjacent scripts or docs linting are touched.
- Use `gh workflow view <workflow>` for workflow inspection and, when a manual
  workflow must be exercised, dispatch it explicitly with `gh workflow run
  <workflow> --ref <branch>` plus the required fields.
- Validate YAML through normal PR checks.
- Monitor PR checks for branch-name, quality gates, and any workflow-specific
  failures.

## Out Of Scope
- Replacing the TASK-268 GitHub Actions scheduler bridge with QStash, Vercel
  Cron, or another managed scheduler.
- Changing product notification email delivery semantics.
- Changing Vercel production/staging database credentials or secrets.
- Redesigning Dependabot/Copilot repair policy unless stale workflow logic makes
  that necessary.
