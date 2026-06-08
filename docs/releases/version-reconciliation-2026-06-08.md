# Version Reconciliation - 2026-06-08

## Summary

NexusDash was at `v0.2.0` after TASK-132/#270 made `package.json` the
canonical product-version source. TASK-313/#329 implemented branch-based SemVer
governance and bumped the app to `v0.3.0`, but that only counted the governance
PR itself. The shipped history between `v0.2.0` and TASK-313 already contained
multiple non-doc feature releases.

Applying the TASK-313 policy retroactively, the current app version should be
`v0.18.0`.

## Applied Rule

- `feature/*` PRs that shipped non-doc product, runtime, or operational
  capability incremented the minor version and reset patch to `0`.
- Release-impacting `fix/*` PRs incremented patch until the next minor release.
- Documentation-only, task-tracking-only, dependency, and investigation report
  PRs did not move the product version.
- Commit count was ignored because it is build/repository metadata, not product
  release intent.

## Release Path

| PR | Branch | Classification | Result |
| --- | --- | --- | --- |
| #270 | `feature/task-132-version-update-system` | Baseline product metadata release | `v0.2.0` |
| #271 | `feature/task-268-github-actions-notification-email-scheduler` | Minor: notification email dispatch scheduler | `v0.3.0` |
| #274 | `fix/notification-email-dispatch-production-origin` | Patch: production dispatch target fix | `v0.3.1` |
| #275 | `fix/task-271-notification-email-no-repeat` | Patch: notification digest deduplication | `v0.3.2` |
| #278 | `feature/task-226-task-due-date-email-reminders` | Minor: task due-date email reminders | `v0.4.0` |
| #277 | `feature/task-265-notification-actor-attribution` | Minor: notification actor attribution | `v0.5.0` |
| #279 | `fix/task-226-due-reminder-rls` | Patch: due reminder RLS reconciliation | `v0.5.1` |
| #288 | `feature/task-273-cost-aware-scheduler` | Minor: scheduler cadence implementation | `v0.6.0` |
| #289 | `fix/task-273-notification-workflow-yaml` | Patch: scheduler workflow YAML repair | `v0.6.1` |
| #290 | `fix/task-273-rollback` | Patch: scheduler rollback | `v0.6.2` |
| #291 | `feature/task-273-cost-aware-scheduler-review` | Minor: scheduler cadence reimplementation | `v0.7.0` |
| #293 | `feature/task-266-pg-query-deprecation-cleanup` | Minor: runtime transaction serialization | `v0.8.0` |
| #305 | `feature/task-118-realtime-collaboration` | Minor: live project refresh | `v0.9.0` |
| #307 | `fix/task-306-mention-cursor-spacing` | Patch: mention cursor spacing fix | `v0.9.1` |
| #309 | `feature/task-307-agent-comment-identity` | Minor: agent comment identity | `v0.10.0` |
| #314 | `feature/task-276-performance-remediation` | Minor: dashboard mutation responsiveness | `v0.11.0` |
| #315 | `feature/task-308-smart-live-refresh` | Minor: smart live project refresh | `v0.12.0` |
| #316 | `feature/task-309-realtime-event-stream` | Minor: realtime SSE foundation | `v0.13.0` |
| #318 | `feature/task-311-product-latency-remediation` | Minor: typed realtime reconciliation | `v0.14.0` |
| #319 | `feature/task-312-hide-project-refresh-affordance` | Minor: hidden refresh reconciliation | `v0.15.0` |
| #320 | `feature/task-263-live-notification-updates` | Minor: realtime notification updates | `v0.16.0` |
| #326 | `feature/task-224-agent-roadmap-access` | Minor: agent roadmap API access | `v0.17.0` |
| #329 | `feature/task-313-version-governance` | Minor: version governance implementation | `v0.18.0` |

## Explicit Non-Movers

The audit intentionally did not count docs-only/task-tracking PRs, performance
investigation reports, Dependabot updates, and routine workflow/dependency
maintenance PRs. Examples include #272, #273, #276, #280, #287, #292, #294,
#296, #310, #311, #317, #327, and #328.
