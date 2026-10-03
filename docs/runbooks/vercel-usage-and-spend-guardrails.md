# Vercel Usage and Spend Guardrails Runbook

This runbook covers how the team's metered usage and on-demand spend are
guarded, inspected, and reviewed. It exists because the realtime SSE paths were
the dominant Fluid compute cost driver, and the remediation program is still
rolling out.

Delivery values and billing figures are deliberately not recorded here. The
source of truth is the Vercel team settings plus the CLI commands below, run
from a checkout linked to the project (the repository root of the main
checkout, not a worktree).

For the realtime transport kill switch and its rollback path, see
`docs/runbooks/vercel-env-contract-and-secrets.md`.

## Guardrails in Place

### Spend Management budget

- A team-level on-demand budget is configured in Vercel Spend Management.
- Notifications fire automatically at 50%, 75%, and 100% of the budget.
- The agreed action is notify-only: the budget does not pause production
  deployments. Pausing production is a hard outage (visitors receive `503`
  until deployments are manually resumed per project), so it stays a human
  decision rather than an automatic one.

Inspect from a linked checkout:

```bash
npx vercel budgets inspect   # current cycle spend against the budget
npx vercel budgets list      # configured budget(s)
```

Change it (owner or billing role):

```bash
npx vercel budgets set --amount <dollars> [--pause | --no-pause] [--webhook <url>]
```

Changing the budget, enabling auto-pause, or removing the budget is an owner
decision. If auto-pause is ever enabled, remember that it only pauses
production deployments, does not stop other metered products, and requires
manual per-project resumption that is not undone by raising the budget later.

### Threshold response

When a spend notification fires:

1. Inspect the cycle with `npx vercel usage` (see below).
2. Identify the driver. Historically Fluid Provisioned Memory dominates the
   infrastructure total, with Fluid Active CPU second.
3. Apply the cheapest mitigation first:
   - Realtime/stream traffic: confirm Preview resolves to polling
     (`REALTIME_TRANSPORT`, see the env contract runbook). If Production
     streams are the driver, apply the same documented Production rollback
     (`REALTIME_TRANSPORT=polling` plus redeploy or promote) before
     considering a production pause: it stops the per-second stream work
     without taking the site down.
   - Review whether the remaining server-side polling cadence can be reduced.
     Adaptive polling and cross-tab coordination are tracked on the board
     (ND-369, ND-370).
   - Only then consider deliberately pausing production deployments, which is
     a hard outage and requires manual per-project resume.
4. Record what fired and what was changed on the relevant task card.

### Notifications

- Spend notification channels and thresholds are configured per member in
  account notification settings: web and email fire at the configured
  thresholds; SMS is available at the 100% threshold only and requires a
  verified phone number.
- Every owner or billing member should keep Spend Management alerts enabled.
  Re-verify after member or account changes.

## Inspecting Usage

Billing usage is attributed per project and region. It is not split by
environment: Preview and Production deployments draw from the same project
usage, so environment attribution comes from logs and observability (see
"Environments in Operational Review"), not from the billing breakdown.

Current cycle, credit balance, and per-service totals:

```bash
npx vercel usage
```

This lists the metered services that matter operationally, including Fluid
Provisioned Memory, Fluid Active CPU, function invocations, observability
events, and transfer, plus the cycle's credit used/remaining.

Breakdowns and grouping:

```bash
npx vercel usage --group-by project
npx vercel usage --group-by region
npx vercel usage --breakdown daily
npx vercel usage --from 2026-10-01 --to 2026-10-07 --json
```

Function execution runs in the team's configured region (currently Washington,
D.C., USA / `iad1`); edge and CDN traffic is served globally, which is why the
region grouping shows both a global section and one section per active region.

Per-route inspection:

- Request logs carry the route path per request:
  `npx vercel logs --environment production -n 200 --json` (or `--environment
  preview`).
- The dashboard Observability views group the same data by route and function,
  which shows the noisiest paths without streaming logs.

Credit behavior (Pro plan, current team shape):

- Included credit is monthly, per deploying seat, and applies to metered
  infrastructure usage before any on-demand charges accrue.
- Unused credit does not roll over; it expires at the end of the month and
  resets with the next cycle.
- On-demand exposure is whatever metered usage exceeds the included credit.
  Under the notify-only action above, the budget alerts but does not cap or
  stop that usage. Subscriptions (seats) and add-ons are billed separately
  from on-demand usage.

Taxes:

- Invoices include applicable taxes based on the team's billing profile; the
  tax treatment of seats, on-demand usage, and any top-ups follows the billing
  country and is not configured in this repository. Check Billing settings and
  the invoice for the authoritative figures.

## Environments in Operational Review

Production and Preview can be reviewed independently:

- Deployments: `npx vercel ls` and the dashboard Deployments view label each
  deployment `Production` or `Preview`.
- Logs and observability: `npx vercel logs --environment production` and
  `npx vercel logs --environment preview` filter independently, and the
  dashboard observability views expose the same environment filter.
- Realtime transport evidence: the refusal log record added by ND-368
  (`stream.transportDisabled`) only appears where the transport resolves to
  polling, which by default is Preview. Presence on Preview and absence on
  Production is the expected operational signature.

## One Deploying Seat

- The team runs a single Pro seat. That seat covers development, deploys, and
  administration; additional seats are only needed for additional humans and
  are billed per seat.
- CI/CD does not need its own seat: preview and production deploys run through
  the GitHub Actions workflows with the team's deploy credentials.
- Included credit scales with seat count; adding a seat adds cost and credit
  together. Do not add seats to "buy" credit.

## Preview Retention and Stale-Tab Hygiene

Retention is a team policy. Verify the effective values in Team Settings,
Security & Privacy, Deployment Retention Policy:

- Pre-production deployments (Preview): one month.
- Canceled: 30 days; errored: 90 days; production: one year (Vercel Pro
  defaults).
- Retention never deletes the newest deployments, the most recent ready
  production deployments, or anything currently aliased.
- Deployments marked for deletion keep a 30-day recovery window before their
  resources are permanently removed.
- Per-project overrides can exist under project settings; the team policy is
  the baseline. Retention changes are owner actions.

Stale-tab hygiene:

- Preview browsers use bounded polling (`REALTIME_TRANSPORT` defaults to
  `polling` in Preview), so there are no persistent SSE connections
  generating per-second server-side database work.
- Client polling is bounded and adaptive: project activity every 10s and
  notifications every 20s while the tab is visible, no periodic requests while
  the tab is hidden, an immediate check when it becomes visible again, and
  exponential backoff (capped at 60s) on consecutive failures.
- Practical policy: treat Preview sessions as disposable. Close them when a
  testing pass ends, do not leave Preview dashboards pinned in a browser for
  days, and let the retention policy age out the deployments themselves.

## Verification Checklist

- Budget and cycle spend: `npx vercel budgets inspect`.
- Notifications: account notification settings show Spend Management enabled.
- Retention: Team Settings, Security & Privacy, Deployment Retention Policy
  shows the pre-production period in effect.
- This runbook and any related PR must not record billing amounts, account
  identifiers, or secret values.
