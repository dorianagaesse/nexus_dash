# GitHub Actions Workflows Runbook

This runbook is the operating inventory for the active NexusDash GitHub Actions
workflows. TASK-269 audited the workflow set and kept all seven workflows
because each owns a distinct operational lane.

## Inventory

| Workflow | File | Purpose | Triggers | Permissions | Secrets / env | Artifacts / outputs |
| --- | --- | --- | --- | --- | --- | --- |
| Check Branch Name | `.github/workflows/check-branch-names.yml` | Enforce branch naming for human and Dependabot PRs. | `pull_request`, `workflow_dispatch` | none | none | check result only |
| Quality Gates | `.github/workflows/quality-gates.yml` | Run RLS inventory validation, lint, unit/API tests, coverage, build, a least-privilege PostgreSQL tenant-isolation matrix, Playwright smoke, and container-image build. | `pull_request`, `push` to `main`, `workflow_dispatch` | `contents: read` | local CI placeholders for DB/email/agent signing; separate admin/runtime PostgreSQL URLs in the isolation job | Playwright report on failure; container image metadata |
| Deploy Vercel (CD + Rollback) | `.github/workflows/deploy-vercel.yml` | Create staged production deployments after green `main`, and run manual preview deploy, staged deploy, promote, or rollback. | successful `Quality Gates` workflow on `main`, `workflow_dispatch` | `contents: read` | Vercel project/token secrets, database/migration URLs, production runtime secrets, OAuth/R2/email/agent secrets as needed | preview/staged deployment URL artifacts and job summaries |
| Notification Email Dispatch Scheduler | `.github/workflows/notification-email-dispatch.yml` | Call the protected notification email dispatcher on the active no-new-cost production cadence. | schedule every 30 minutes, `workflow_dispatch` | none | `NOTIFICATION_EMAIL_DISPATCH_SECRET` or legacy `CRON_SECRET` | dispatcher response and parsed summary in job summary |
| Dependency Security | `.github/workflows/dependency-security.yml` | Run the scheduled/manual npm audit baseline and persist audit JSON. | weekly schedule, `workflow_dispatch` | `contents: read` | none | production/full npm audit JSON |
| Dependabot Auto Triage | `.github/workflows/dependabot-auto-triage.yml` | Label and approve safe Dependabot lanes, then merge safe green Dependabot PRs. | `pull_request_target` for Dependabot, `workflow_run` after required PR checks | per-job `contents`, `issues`, and `pull-requests` write where needed | `GITHUB_TOKEN` | labels/reviews/merge state; no artifact |
| Dependabot Repair Agent | `.github/workflows/dependabot-repair-agent.yml` | Scan red Dependabot PRs and use Copilot CLI to open repo-owned repair PRs when possible. | weekly schedule, `workflow_dispatch` | per-job read for scan; write for repair PR creation/status updates | `COPILOT_ACTIONS_TOKEN` to activate Copilot CLI; `GITHUB_TOKEN` | PR comments/branches created by repair script; job summary when skipped |

## Audit Decision

All seven workflows remain necessary:

- Branch policy stays separate from expensive CI so invalid PR branch names fail
  quickly and clearly.
- Quality Gates owns product validation and container-build proof.
- Deploy Vercel owns deploy, promote, and rollback because those actions need
  production/preview environments and Vercel secrets.
- Notification Email Dispatch remains separate from deploy because it is an
  operational scheduler, not a release step.
- Dependency Security remains separate from Dependabot automation because it is
  a repository-wide audit baseline with artifacts.
- Dependabot Auto Triage remains deterministic and bounded to known safe lanes.
- Dependabot Repair Agent remains separate because it uses Copilot credentials
  and may create superseding repo-owned PRs, but does not merge them.

No workflow was deleted in TASK-269. The cleanup tightened token permissions for
workflows that do not need repository access and documented each workflow's
contract so future cleanup can compare against an explicit baseline.

TASK-269 also fixed the Dependency Security workflow's inline JavaScript shell
quoting. Recent scheduled failures were partly caused by Bash expanding
JavaScript template literals before Node could run them; the workflow now uses
quoted heredocs so future failures represent the audit result itself.

## Operator Paths

### PR Validation

1. Open a non-draft PR from an allowed branch prefix.
2. Confirm `Check Branch Name` passes.
3. Confirm `Quality Core`, `Tenant Isolation`, `E2E Smoke`, and
   `Container Image` pass.
4. Review any uploaded Playwright report if E2E fails.

### Preview Deploy

Run `.github/workflows/deploy-vercel.yml` manually:

- `action=deploy-preview`
- `git_ref=<branch-or-sha>`

Use the `preview-deployment` artifact or job summary URL for preview smoke.

### Staged Production Deploy

Automatic path:

1. Merge to `main`.
2. Wait for `Quality Gates` on `main`.
3. `Deploy Vercel (CD + Rollback)` creates a staged production deployment.
4. Promote the staged URL manually with `action=promote`.

Manual path:

- `action=deploy-production-staged`
- optional `git_ref=<branch-or-sha>`

Rollback path:

- `action=rollback`
- `deployment_id_or_url=<known-good-deployment>`

### Notification Email Dispatch

Scheduled production dispatch runs every 30 minutes. Manual dispatch can target
production or an allowed NexusDash preview URL via `target_url`. The workflow
summary shows the dispatcher response and parsed send/reconciliation metrics.

### Dependency Maintenance

- `Dependency Security` runs every Monday at 07:00 UTC and can be run manually.
- Dependabot opens grouped dependency PRs from `.github/dependabot.yml`.
- `Dependabot Auto Triage` labels safe lanes and merges only safe Dependabot
  PRs after required checks pass.
- `Dependabot Repair Agent` runs every Monday at 09:15 UTC. It needs
  `COPILOT_ACTIONS_TOKEN`; without that secret it records a skip summary.

## Change Rules

- Keep new workflows single-purpose and add them to this inventory in the same
  PR.
- Add an explicit `permissions` block. Use `permissions: {}` for workflows that
  do not need repository token access.
- Keep deployment-affecting changes aligned with
  `docs/runbooks/vercel-env-contract-and-secrets.md`.
- Keep notification scheduler changes aligned with
  `docs/runbooks/notification-email-dispatch.md`.
- Do not send production secrets to arbitrary manual-dispatch targets.
