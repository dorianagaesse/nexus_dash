# Vercel Usage and Spend Guardrails Runbook

This runbook covers how the team's metered usage and on-demand spend are
guarded, inspected, and reviewed. It exists because the legacy realtime stream
paths were the dominant Fluid compute cost driver; those paths are retired and
the bounded transports that replaced them remain under the same review.

Delivery values and billing figures are deliberately not recorded here. The
source of truth is the Vercel team settings plus the CLI commands below, run
from a checkout linked to the project (the repository root of the main
checkout, not a worktree).

For realtime transport selection and its rollback path, see
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

### Weekly CPU and memory targets

Post-remediation targets for a representative seven-day window (as agreed in
the realtime efficiency program):

- Fluid Active CPU: below 30 CPU minutes per seven-day window.
- Fluid Provisioned Memory: below 40 GB-hours per seven-day window.

Read the current window with `npx vercel usage` (see "Inspecting Usage"). A
window that exceeds either target is acceptable only when documented workload
growth explains the difference; record that evidence (traffic/user counts,
feature additions) on the active task card rather than assuming it.

Investigation threshold: when a seven-day window crosses 80% of either target
(24 CPU minutes or 32 GB-hours), treat it as an early-warning signal and
investigate with "Realtime Telemetry" plus `npx vercel usage` before the
target itself is breached.

### Threshold response

When a spend notification fires:

1. Inspect the cycle with `npx vercel usage` (see below).
2. Identify the driver. Historically Fluid Provisioned Memory dominates the
   infrastructure total, with Fluid Active CPU second.
3. Apply the cheapest mitigation first:
   - Realtime traffic: confirm Preview resolves to polling
     (`REALTIME_TRANSPORT`, see the env contract runbook). If Production
     Broadcast is the driver, apply the documented Production rollback
     (`REALTIME_TRANSPORT=polling` plus redeploy or promote) before
     considering a production pause: it stops the persistent-connection work
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

## Realtime Telemetry

The application owns a small realtime telemetry surface so abnormal compute
can be attributed to a route and transport mode instead of being inferred from
billing totals alone.

On-demand snapshot (operator endpoint; requires a signed-in human session
cookie - agent credentials are rejected):

```bash
curl -s <deployment-url>/api/observability/realtime \
  -H "cookie: nexusdash.session-token=<session>" | jq .metrics
```

The snapshot reports the deployment `environment` (Production and Preview are
distinguishable), `revision`, the resolved `transport`, `scope: "instance"`
(the counters are per serverless instance, not deployment-wide), per-route
counters, aggregated service timing, and the database query volume measured at
the PostgreSQL driver. It contains aggregate numbers and fixed metric names
only: no user IDs, emails, project IDs, or request payloads.

Counters:

- `activity.snapshotChecks` / `notifications.snapshotChecks`: snapshot requests
  served by `/api/projects/:id/activity` and
  `/api/account/notifications/summary` (the endpoints the client fallback
  loops poll and Broadcast subscriptions reconcile through; the full-list
  `/api/account/notifications` route is deliberately not counted).
- `activity.changesEmitted`: project activity change events persisted; these
  are the payloads realtime clients refresh for.
- `activity.pollingFallbacks` / `notifications.pollingFallbacks`: human poll
  requests received while the transport resolves to `broadcast`, excluding
  Broadcast subscribe-time reconciliation requests. The client could not hold
  its preferred connection and is in bounded polling fallback.
- `broadcast.tokenIssued` / `broadcast.tokenDenied`: Realtime token minting
  outcomes at the session endpoint. These are instance-local samples, not
  connection counts.

Sampled evidence: on deployment runtimes the aggregates are emitted as a
structured log record (scope `realtime.metrics`) - one sample at the
instance's first recorded event, then at most one more per minute, at the
next event after each interval. Each record is a cumulative sample at that
instant, tagged with environment and revision. Two limitations matter before
making volume claims from these records: the sample is written when its
triggering event is recorded, so work from that same request (including its
database queries) can land after the record, and counts accumulated between
samples on an instance recycled before the next sample are lost. Treat the
records as per-instance samples for attribution and order-of-magnitude
comparison across environments and revisions, not as exact accounting. The
endpoint snapshot is the live view while reproducing; the log records are the
history.

Counters are also per serverless function and per instance. Realtime token
counters are recorded in the function serving `/api/realtime/token`, while the
poll counters, service timing, and `database.queryCalls` are recorded in the
function serving the poll routes and this observability endpoint. Each
instance's snapshot only shows its own counters, so cross-function totals come
from the `realtime.metrics` log records, not a single endpoint response.

Attribution recipes:

- `broadcast.tokenIssued` / `broadcast.tokenDenied` come from the token
  function's `realtime.metrics` log records; the endpoint snapshot carries the
  poll counters, service timing, and `database.queryCalls`.
- High compute on the activity route with `activity.pollingFallbacks` rising
  while the transport is `broadcast`: clients are stuck in polling fallback -
  check token denials and socket failures before changing cadences.
- High compute while Broadcast is healthy on Production: look at mutation
  volume and channel fan-out rather than assuming a fallback.
- `database.queryCalls` is instance-wide driver volume, not per route: it
  counts every query the instance issues, including auth and session lookups.
  Use it to compare environments or revisions at similar traffic; do not read
  it as statements issued by the poll endpoints alone.

## Environments in Operational Review

Production and Preview can be reviewed independently:

- Deployments: `npx vercel ls` and the dashboard Deployments view label each
  deployment `Production` or `Preview`.
- Logs and observability: `npx vercel logs --environment production` and
  `npx vercel logs --environment preview` filter independently, and the
  dashboard observability views expose the same environment filter.
- Realtime transport evidence: ND-374 removed the SSE routes, so no stream
  function deploys and the retired `stream.transportDisabled` refusal records
  no longer appear. Preview defaults to bounded polling; Production defaults
  to Broadcast unless overridden.
- Realtime telemetry (ND-371): the `realtime.metrics` log records and the
  `/api/observability/realtime` snapshot carry an `environment` field, so the
  same counters can be compared per environment without consulting billing
  attribution.

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
  `polling` in Preview), so there are no persistent connections
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
- Weekly CPU/memory targets: `npx vercel usage` against the 30 CPU-minute and
  40 GB-hour seven-day targets; investigate at 80%.
- Realtime telemetry: `GET /api/observability/realtime` returns an
  environment-tagged snapshot, and `realtime.metrics` log records appear on
  deployment runtimes (token counters appear in the token function's log
  records, not the snapshot).
- Notifications: account notification settings show Spend Management enabled.
- Retention: Team Settings, Security & Privacy, Deployment Retention Policy
  shows the pre-production period in effect.
- This runbook and any related PR must not record billing amounts, account
  identifiers, or secret values.
