# ND-375 production realtime investigation

Investigation date: 8 November 2026 (Europe/Paris).
Status: investigation complete; preferred key corrected and fresh deployment
staged; manual cross-session task delivery confirmed; production promotion and
remaining operational checks pending.
Hosting decision: retain Vercel Pro, as chosen by Dorian on 8 November 2026.

## Conclusion

The SSE retirement and polling-efficiency work produced a substantial measured
reduction in Vercel consumption. The original production investigation found
Broadcast configured with a rejected preferred Supabase publishable key and
observed clients using the supported polling fallback. Dorian subsequently
corrected the setting, and a fresh staged deployment now passes gateway checks
and the manual cross-session task-delivery check below. The earlier cost
improvement is evidence of the remediation's value, not proof that production
Broadcast was healthy during that measurement window.

The environment correction and a staged project-delivery check are complete;
production promotion and the remaining validation are separate release steps.
There is no measured reason here to migrate hosting or upgrade Supabase merely
to fix this authentication failure.

### Configuration correction and staged release, 8 November 2026

After Dorian saved the corrected Production `SUPABASE_PUBLISHABLE_KEY`, a fresh
environment pull confirmed it matches the verified publishable value under
`SUPABASE_API_KEY`. The preferred key now receives HTTP 200 from Auth settings
and HTTP 101 from the Realtime WebSocket upgrade.

[Workflow run 42469846601](https://github.com/dorianagaesse/nexus_dash/actions/runs/42469846601)
staged the existing live source revision
`0c5bd59ca339fec8d7bd18ecf66ae2125528b25a` with the corrected environment.
Checkout logs, the deployment metadata, and readiness agree on that revision;
the workflow's `headBranch`/`headSha` alone were not used as checkout evidence.

The resulting [staged deployment](https://nexus-dash-dq8jyyns7-dorian-agaesses-projects.vercel.app)
is Ready, serves `/` and `/api/health/ready` with HTTP 200, and has no aliases.
Its ID is `dpl_2QF7kBTw64Lb2XBT2v45jvR5cjqc`. The run did not apply migrations
or promote production. Gateway HTTP 101 is not a substitute for authenticated
subscription and delivery checks.

### Staged signed-in checks, 8 November 2026

Dorian signed into the staged deployment, created a task, refreshed, and
reported no visible or console errors. Staged request logs show two successful
token requests. A sampled instance reported two activity snapshot checks and
zero activity polling fallbacks. Notifications had four initial fallback
requests; after the refresh, the request timeline showed no further summary
polling between 10:12:52 and 10:15:05 UTC. This is a short observation, not proof
that notification fallback never occurs.

For a separate delivery check, Dorian opened the same staged project in normal
and Incognito windows, kept both visible, and confirmed that creating a task
in one appeared automatically in the other without refreshing or changing
focus. This is manual cross-session project-update evidence beyond local
optimistic rendering and same-profile tab coordination. Browser automation
access was unavailable, so the visible delivery result is user-reported.

Notification event delivery, a new token-renewal run, unauthorized-topic/client
publish denial, forced-outage recovery, and the database-load review were not
repeated during this manual check. Earlier automated Preview/security evidence
is linked below; it must not be relabeled as a fresh Production test.

The initial investigation changed no runtime settings, deployments, schema,
or test fixtures. Dorian then corrected the preferred Production setting, and
the agent created the staged deployment described above. No production alias
was promoted by this work. The Nexus Dash task remains In Progress.

## Original investigation snapshot

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

1. **Production publishable-key correction: completed and staged.** Use a currently valid
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
3. **Complete staged Broadcast validation.** Manual cross-session task delivery
   is confirmed above. Check the exact
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
