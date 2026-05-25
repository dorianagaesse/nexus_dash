# TASK-269 GitHub Actions Workflow Cleanup

## Task ID
TASK-269

## Status
Implementation complete - awaiting maintainer review

Implementation branch: `chore/task-269-workflow-cleanup`

## Objective
Audit and simplify the repository's GitHub Actions workflows so CI, staged
Vercel deployment, notification email scheduling, dependency security, and
maintenance automation have clear ownership, minimal duplicated logic, and
operator-friendly failure modes.

## Rationale
Recent production work touched several workflows and exposed recurring friction:
environment variables are resolved in several places, scheduled notification
dispatch is intentionally a temporary GitHub Actions bridge, staged deployment
has production safety requirements, and dependency maintenance includes both
deterministic automation and Copilot-assisted repair. The workflow set is
powerful, but it needs a focused hygiene pass before more operational behavior
is layered onto it.

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

## Audit Outcome

TASK-269 keeps all seven active workflows because each has distinct ownership:
branch policy, quality gates, Vercel deploy/promote/rollback, notification
email dispatch, dependency audit, safe Dependabot auto-triage, and Copilot
repair. The cleanup target is least-privilege permissions plus a durable
operator inventory, not workflow deletion.

The audit also found a concrete `dependency-security.yml` bug: inline `node -e`
snippets used JavaScript template literals inside shell double quotes, so Bash
expanded backtick and `${...}` fragments before Node executed. The workflow now
uses quoted heredocs for those summaries and failures.

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
- A PR is opened and CI/Copilot feedback is handled.

## Validation Plan
- `git diff --check`
- `npm run lint` if workflow-adjacent scripts or docs linting are touched.
- Use `gh workflow view <workflow>` for workflow inspection and, when a manual
  workflow must be exercised, dispatch it explicitly with `gh workflow run
  <workflow> --ref <branch>` plus the required fields.
- Validate YAML through the normal PR checks.
- Monitor PR checks for branch-name, quality gates, and any workflow-specific
  failures.
