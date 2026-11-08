# Dependabot maintenance audit — 2026-11-08

## PR decisions

All three open Dependabot PRs were reviewed. No dependency alerts or update
schedules were disabled to clear the queue.

| PR | Decision | Evidence |
| --- | --- | --- |
| [#666](https://github.com/dorianagaesse/nexus_dash/pull/666), eslint-config-next 16.4.4 | Squash merged as `4c6fa0d98937487412a890e358416e9b9c147202` | Config/plugin patch update; branch policy, quality core, E2E, tenant isolation and container checks passed in [Quality Gates](https://github.com/dorianagaesse/nexus_dash/actions/runs/42172659829). |
| [#667](https://github.com/dorianagaesse/nexus_dash/pull/667), Playwright 1.64.1 | Squash merged as `0b43fd9878fc77fd339f78a583dcdba993763e07` | Matching test, Playwright and core patch versions; all five checks passed in [Quality Gates](https://github.com/dorianagaesse/nexus_dash/actions/runs/42174020950). |
| [#668](https://github.com/dorianagaesse/nexus_dash/pull/668), Vitest 5.1.0 | Closed; retain the working 4.1.12 toolchain | [CI](https://github.com/dorianagaesse/nexus_dash/actions/runs/42174058576) failed during `npm ci` with ERESOLVE: coverage-v8 4.1.12 requires exactly Vitest 4.1.12. This was an installation conflict, not a test failure. A future update must upgrade both together. |

The two merged PRs were unchanged; their existing complete CI was used for
the merge decision. The automation maintenance follow-up uses a separate
branch based on main after both merges. The root checkout's existing local
changes were preserved.

## What behaved as expected

- Friday dependency updates ran. Safe groups [#664](https://github.com/dorianagaesse/nexus_dash/pull/664)
  and [#665](https://github.com/dorianagaesse/nexus_dash/pull/665) were merged;
  the individual Playwright, Next lint config and Vitest updates were placed in
  manual review, consistent with the configured exclusions.
- [Auto-triage reconciliation](https://github.com/dorianagaesse/nexus_dash/actions/runs/42176119978)
  saw #667's green checks but correctly declined to merge its manual-review
  lane. Skipped triage runs on unrelated human PRs are expected.
- The latest scheduled [Dependency Security run](https://github.com/dorianagaesse/nexus_dash/actions/runs/41403581046)
  succeeded: production and full-tree audits reported zero high/critical
  findings. The install output still reported moderate findings; a successful
  high-severity gate does not mean there are no vulnerabilities.

## What did not behave as intended

- The [November 2 scheduled repair run](https://github.com/dorianagaesse/nexus_dash/actions/runs/41420208219)
  selected then-open Vitest PR #634, but its Copilot token failed the GitHub
  authentication preflight with HTTP 401. No repair executed. Dependabot
  subsequently superseded #634 with #668.
- A fresh [November 8 authentication-only run](https://github.com/dorianagaesse/nexus_dash/actions/runs/42466641623)
  reproduced HTTP 401. This is an external credential problem. The repository
  owner must replace `COPILOT_ACTIONS_TOKEN` with a valid token that can make
  Copilot requests, then run the authentication-only check again. The audit
  did not read or replace that secret.
- Earlier green runs can be scan-only: the [October 26 run](https://github.com/dorianagaesse/nexus_dash/actions/runs/40301349118)
  had no repair targets and skipped both repair and authentication jobs. That
  success is not evidence of healthy Copilot credentials.
- Auto-triage and repair's required-check lists omitted the existing
  `Tenant Isolation (PostgreSQL RLS)` job. The maintenance change adds it to
  both lists, including repair failure detection and mirrored statuses. This
  prevents treating an absent/pending isolation check as complete in triage
  and allows the scanner to detect an isolation-only failure. No claim is
  made that an unsafe merge actually occurred.
- Vitest and its coverage provider were not grouped. The maintenance change
  groups `vitest` and `@vitest/*` for version updates, including major updates,
  while retaining manual review, following the [GitHub grouping reference](https://docs.github.com/en/code-security/reference/supply-chain-security/dependabot-options-reference#groups).
  No Vitest major migration is included.
- The workflow runbook incorrectly promised a skipped summary for missing
  repair credentials; the current workflow fails authentication instead. The
  runbook now describes the actual behavior and recovery check.

## Remaining operational action

Restore the Copilot secret and confirm the authentication-only workflow
passes. Clearing today's PR queue does not stop future scheduled Dependabot
updates. A future grouped Vitest migration still needs complete validation.
