# ND-375 production realtime investigation

Investigation date: 8 November 2026 (Europe/Paris).
Status: investigation complete; configuration repair and release validation pending.
Hosting decision: retain Vercel Pro, as chosen by Dorian on 8 November 2026.

## Conclusion

The SSE retirement and polling-efficiency work produced a substantial measured
reduction in Vercel consumption. Production is configured for Broadcast, but
its preferred Supabase publishable key is rejected by Supabase. Observed
clients are using the supported polling fallback. The cost improvement is
therefore evidence of the remediation's value, not proof of healthy production
Broadcast delivery.

The immediate repair is a Production environment correction followed by staged
private-channel validation. There is no measured reason here to migrate hosting
or upgrade Supabase merely to fix this authentication failure.

No Production runtime settings, deployments, schema, or test fixtures were
changed during this investigation. The Nexus Dash task was moved to In Progress,
and the hosting decision and pickup were recorded on the card.

## What is running

| Layer | Observed state | Evidence and limits |
| --- | --- | --- |
| Live application | Production revision `0c5bd59ca339fec8d7bd18ecf66ae2125528b25a`, deployment `dpl_7shpvGHaP7k7uXGFtBocwqzvhJsq` | Domain lookup through Vercel inspect and deployment API; production runtime log revision agrees. Newer staged deployments do not establish what the production domain serves. |
| Legacy SSE | Both retired stream routes return HTTP 404 | Earlier live probes in this review; no claim of a historical route-level invocation total. |
| Production transport | `broadcast` | All 29 recent sampled realtime records report Broadcast. This is the configured mode, not a client connection-success counter. |
| Production browser authentication | Eight `/api/realtime/token` requests returned HTTP 200 in the three-hour request-log sample | App-session token issuance works for those requests. This does not validate the API key, JWT signature, or private-channel authorization at Supabase. |
| Production fallback | Activity and notification polling fallbacks are observed | Every sampled activity/notification poll counter equals its fallback counter. Healthy subscribers could still exist outside this sample. |
| Preview | Separate Supabase project; both configured publishable-key settings validate; all 82 recent realtime samples report `polling` | Correct default for Preview. This does not prove a fresh explicit Broadcast preview test. |
| Supabase billing | User confirms Free; supplied Usage screenshot shows zero Realtime messages and peak connections | Screenshot covers the billing cycle 16 October–16 November, not the Vercel seven-day comparison. The selected project's reference is not visible in the screenshot. |
| Database health | Seven-day CPU, memory, connections, and query-load history remain unverified | Existing local DB credentials were stale and rejected; Supabase management/dashboard access was not available. Live application readiness is not a database-load assessment. |

### Runtime sample scope

Production realtime log query: 7 November 2026, 22:44:50–23:44:50 UTC
(23:44:50 on 7 November–00:44:50 on 8 November in Paris).
The query returned 29 records without pagination or excluded intervals.
The counter maxima in these records were:

| Counter | Maximum observed cumulative value |
| --- | ---: |
| `activity.snapshotChecks` | 20 |
| `activity.pollingFallbacks` | 20 |
| `notifications.snapshotChecks` | 14 |
| `notifications.pollingFallbacks` | 14 |
| `broadcast.tokenIssued` | 6 |
| `broadcast.tokenDenied` | 0 |

These are sampled cumulative instance counters. Do not sum them, treat their
maxima as fleet totals, or interpret equal poll/fallback counters as a failure
rate across all browser subscriptions. Subscribe-time reconciliation is
excluded from the fallback counters by the server routes.

## Root cause and direct checks

`getSupabasePublishableKey()` in `lib/env.server.ts` always prefers a nonempty
`SUPABASE_PUBLISHABLE_KEY`. It only uses `SUPABASE_API_KEY` if the preferred
setting is absent. It does not retry the legacy setting after a provider
rejection. Both Production values checked here are publishable keys, not
privileged secret/service-role keys.

Using freshly pulled Production environment values, with whitespace handled
the same way as the application:

| Environment/setting | Auth settings request | Realtime WebSocket upgrade |
| --- | --- | --- |
| Production `SUPABASE_PUBLISHABLE_KEY` | HTTP 401, `Invalid API key` | HTTP 401, `Invalid API key` |
| Production `SUPABASE_API_KEY` | HTTP 200 | HTTP 101, `Switching Protocols` |
| Preview `SUPABASE_PUBLISHABLE_KEY` | HTTP 200 | Not repeated in this investigation |
| Preview `SUPABASE_API_KEY` | HTTP 200 | Not repeated in this investigation |

The HTTP checks used `/auth/v1/settings` with the publishable key in the
`apikey` header. WebSocket checks used `/realtime/v1/websocket` with the same
key and an upgrade request. They did not join private topics, send Broadcast
events, or alter data. No key values are included in this report.

This establishes a provider-authentication failure in the preferred Production
setting. It does not distinguish a revoked, mistyped, or wrong-project key.
The app's token response passes this preferred key to its browser client, so
an app-token HTTP 200 can be followed immediately by a gateway HTTP 401. The
client then demotes to bounded polling. That mechanism is consistent with the
production fallback samples and the supplied zero-Realtime usage screenshot.

The deployment snapshot includes the expected Supabase configuration names and
no `REALTIME_TRANSPORT` override. The signing secret is present, but its value
and compatibility with Production were not independently verified. The old
build-time polling-pin hypothesis is not supported: ND-611 removed those pins,
and actual production runtime logs resolve to Broadcast.

The transport/configuration files inspected on `ac7b2fa3` have no diff against
the live `0c5bd59` revision. No browser-side gateway error capture was available;
the key failure was reproduced directly with current Production settings.

## Cost result and its interpretation

Vercel daily billing buckets 31 October–6 November 2026, Production and Preview
combined, cross-checked between daily breakdown and project grouping:

| Metric | Pre-remediation seven-day baseline | Measured seven billing days | Change | Program target |
| --- | ---: | ---: | ---: | ---: |
| Fluid Active CPU | 123 minutes | 31.29 minutes | 74.56% lower | Below 30 minutes; narrowly missed |
| Fluid Provisioned Memory | 153.6 GB-hours | 1.79 GB-hours | 98.84% lower | Below 40 GB-hours; met |
| Function invocations | Not captured in the original baseline | 20,947 | No comparable reduction claim | Bounded growth |
| Build CPU | Not captured in the original baseline | 156 minutes | Separate from Fluid runtime CPU | Review deployment activity |

The CLI reports daily billing buckets; these are not an exact seven-day Paris
hourly interval. Workload was not normalized between periods. The current
window also contains ordinary development/deployment and agent activity.

Billing combines Preview and Production; the recent environment-tagged log
samples cannot allocate the seven-day CPU or memory totals between them.
The historical incident investigation found both environments contributed.
Most current metered cost is associated with builds and deployment/function
storage, but that does not establish which environment dominates runtime cost.
Billing amounts and account identifiers are deliberately omitted from this
repository report.

## Recommended plan

1. **Correct the Production publishable-key setting.** Use a currently valid
   publishable key belonging to the Production Supabase project for
   `SUPABASE_PUBLISHABLE_KEY`. The valid publishable value already configured
   under `SUPABASE_API_KEY` is a candidate, subject to the same preflight at
   execution time. Preserve Preview isolation and the signing-secret boundary.
   Editing a project environment does not repair an existing deployment; stage
   a new deployment so its runtime receives the correction.
2. **Add a promotion preflight for the resolved key.** Run a bounded provider
   authentication check using the same modern-before-legacy precedence as the
   app. Reject a provider 401 before migrations or alias changes. Root-page
   HTTP 200 and database readiness are insufficient. Keep keys out of logs.
   A gateway preflight is an early gate, not a substitute for private joins.
3. **Validate private Broadcast on the staged release.** Check the exact
   revision, token issuance, authorized project/user subscriptions, unauthorized
   join and client-publish denial, two-session project/notification delivery,
   token renewal, duplicate/hidden-tab coordination, and visibility recovery.
   Healthy visible clients should not require recurring fallback polls.
   Force a provider failure and verify bounded polling still preserves
   freshness, then verify recovery. Use disposable fixtures in Preview for
   destructive/security cases and a controlled Production acceptance check.
4. **Promote through the existing user-owned release boundary.** After the
   staged evidence is reviewable, promote the verified revision. Confirm the
   production domain's revision and capture successful browser subscription
   and delivery evidence, not only the configured transport string. Retain the
   documented polling rollback; do not restore the old SSE loops.
5. **Finish the operational review.** Capture nonzero Realtime activity under
   controlled use, available database CPU/memory/connection charts, and a new
   representative seven-day Vercel usage window after the verified correction.
   Supabase Free exposes report history up to 24 hours, so use dated snapshots
   or an existing metrics collector for the week; do not claim unavailable
   historical charts. Retain Vercel Pro and Supabase Free unless actual usage
   or operational requirements justify a different decision.

Revisit hosting/plan assumptions if workload changes, included credit is under
pressure, collaboration reliability degrades, or resource growth persists.
CPU already exceeds the program's 24-minute investigation warning and narrowly
exceeds its 30-minute target, so the next review must investigate that result
rather than treating both original targets as passed.

ND-375 should remain open until the release and review evidence is recorded.
Create a focused fix card for the Production key correction and promotion
guard before implementation; the investigation searched the board and found
no matching card. The attempted creation was rejected by automatic approval
review with `blocked by policy`, so no follow-up card was created.

## References

- [Runtime configuration contract](../runbooks/vercel-env-contract-and-secrets.md)
- [Usage and spend review procedure](../runbooks/vercel-usage-and-spend-guardrails.md)
- [Deployment and private Broadcast verification workflow](../runbooks/github-actions-workflows.md)
- [Earlier fallback/load-test evidence](nd-374-realtime-load-test.md)
- [Supabase API-key roles and usage](https://supabase.com/docs/guides/getting-started/api-keys)
- [Supabase report availability by plan](https://supabase.com/docs/guides/observability/reports)
