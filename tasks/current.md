# Current Task: TASK-269 GitHub Actions Workflow Cleanup

## Task ID
TASK-269

## Status
Implementation complete - awaiting maintainer review

## Source
- Backlog entry:
  `tasks/task-269-github-actions-workflow-cleanup.md`.
- User direction on 2026-05-25: own TASK-269 end to end, decide whether the
  current GitHub Actions workflows are all necessary, clean up what is needed,
  and execute without waiting for more input.

## Objective
Audit and simplify the repository's GitHub Actions workflow surface so each
workflow has a clear owner, trigger, permission boundary, secret/env contract,
artifact output, and operator path.

The task should preserve shipped product behavior. Changes should focus on
workflow hygiene: removing stale assumptions, reducing duplicated shell logic
where it creates maintenance risk, making failures easier to interpret, and
aligning README/runbook documentation with the current workflow contract.

## Current Baseline
- Active workflow files:
  - `.github/workflows/check-branch-names.yml`
  - `.github/workflows/quality-gates.yml`
  - `.github/workflows/deploy-vercel.yml`
  - `.github/workflows/notification-email-dispatch.yml`
  - `.github/workflows/dependency-security.yml`
  - `.github/workflows/dependabot-auto-triage.yml`
  - `.github/workflows/dependabot-repair-agent.yml`
- These workflows cover distinct responsibilities today: branch policy,
  PR/main quality gates, staged Vercel deployment/promote/rollback, the
  temporary notification email scheduler bridge, dependency audit artifacts,
  safe Dependabot auto-triage/merge, and Copilot-assisted Dependabot repair.
- TASK-273 tightened notification email dispatch to a 30-minute GitHub Actions
  bridge while keeping the app-owned queue and protected dispatcher.
- Deploy workflow logic currently repeats Vercel secret/env setup and several
  validation snippets across automatic and manual jobs.
- `gh workflow view` showed recent `Dependency Security` scheduled failures.
  Log inspection identified a workflow quoting bug in its inline Node snippets,
  in addition to any actual audit findings.
- `npm audit --omit=dev --audit-level=high` still reports a high-severity
  `next` advisory; the dependency update itself is tracked separately as
  TASK-274.

## Scope
- Inventory all active workflow files and decide whether each workflow remains
  necessary.
- Keep workflows with distinct operational ownership; remove or consolidate
  only if there is clear duplication or dead behavior.
- Tighten workflow permissions, env validation, summaries, and operator-facing
  errors where safe.
- Fix concrete workflow bugs discovered during the audit.
- Reduce duplicated deploy-workflow shell logic when it lowers maintenance
  risk without changing deploy/promote/rollback behavior.
- Update README and runbooks with the final workflow inventory and contracts.
- Update tracking docs and journal with the TASK-269 decision and validation.

## Acceptance Criteria
1. Every active workflow has a documented purpose, trigger set, permission
   boundary, required secrets/env, artifacts, and operator path.
2. The audit explicitly answers whether each existing workflow is still
   necessary.
3. Any cleanup preserves functional coverage for quality gates, branch policy,
   Vercel deploy/promote/rollback, notification email dispatch, dependency
   security, Dependabot auto-triage, and Copilot repair.
4. Workflow YAML has clear failure messages for missing required configuration
   and emits useful summaries where operators need them.
5. README/runbook references match the final workflow behavior.

## Definition Of Done
- `tasks/current.md` is updated before implementation with this execution
  contract.
- Workflow YAML cleanup is minimal and behavior-preserving unless a concrete
  workflow bug is found.
- Documentation records the workflow inventory and any deliberate no-delete
  decisions.
- Local validation passes or any blocker is recorded in `journal.md`.
- A ready PR is opened, GitHub checks are monitored, and Copilot review
  feedback is handled; merge remains a maintainer decision.

## Validation Plan
- `git diff --check`
- Workflow syntax/shape inspection with `gh workflow view` for each active
  workflow.
- `npm run lint`
- `npm test`
- `npm run test:coverage`
- `npm run build`
- PR checks for branch-name, quality gates, and workflow-specific failures.

## Out Of Scope
- Product behavior changes.
- Migrating notification scheduling away from GitHub Actions.
- Replacing Vercel deployment strategy.
- Changing Dependabot safe-lane policy beyond clarifying workflow ownership.
- Upgrading framework/dependency versions to resolve current audit findings;
  that is TASK-274.
