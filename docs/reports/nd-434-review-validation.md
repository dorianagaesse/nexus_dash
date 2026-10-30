# ND-434 review validation

Historical evidence from 2026-10-29. The recovery notices and review controls
described here were superseded by the 2026-10-30 invisible-recovery product
requirement in `adr/task-432-autosave-contract.md`. They are not current UI
requirements or release instructions.

## Safety boundary

Calendar edit requests require one strong provider ETag in `expectedEtag`.
The server rejects missing values with 428 and invalid, weak, wildcard, or
multiple values with 400 before issuing a provider write. Google 412 responses
preserve the local draft. Creation remains explicit and needs no precondition.

The version-1 recovery envelope remains compatible with older Calendar drafts
that contain no ETag. Their text is restored, but a recovery conflict prevents
Save, including programmatic form submission. Reviewing the current event
adopts its ETag; a missing provider revision continues to block Save.

## Reproduction

Use the isolated local PostgreSQL setup in
[`local-validation.md`](../runbooks/local-validation.md), then run:

```powershell
npm run test:e2e -- tests/e2e/nd-434-authoring-recovery.spec.ts tests/e2e/nd-434-context-save-budget.spec.ts
```

The budget fixture uses two authenticated editors and a real context card.
It observes 31 seconds of idle time, 120 draft changes across both editors over
at least 30 seconds, explicit same-field conflict/review, and 20 measured
conditional API saves after two warmups. It attaches `context-save-budget.json`
to the Playwright report and deletes its project afterward. API latency is
request/response wall time, with route time from `Server-Timing`; it is not a
click-to-dialog-close measurement or an isolated database query-time measure.

## Results (2026-10-29)

Preview workflow [40960231850](https://github.com/dorianagaesse/nexus_dash/actions/runs/40960231850)
completed successfully with `action=deploy-preview` and
`git_ref=feature/nd-434-context-calendar-preconditions`. The Checkout step's
`git log -1 --format=%H` output is
`1499f830a17f713721dd5b7c4424c0ead4aa96c3`; workflow environment metadata
contains the same SHA. Deployment identity, Preview environment, database
readiness, stable alias, and private Broadcast verification passed.

- [Immutable Preview](https://nexus-dash-305adss3y-dorian-agaesses-projects.vercel.app)
- [Stable auth alias](https://nexus-dash-dorianagaesse-3732-dorian-agaesses-projects.vercel.app)

The subsequent `00059d6` commit only repairs the fixture's second-browser
configuration and section locator; deployed application code is identical.
All five focused Playwright tests passed against the immutable Preview,
including pre-ETag draft review, conditional retry, provider 412 recovery,
non-publication during create recovery, and the real context-card budget
fixture. Desktop and 390px Calendar recovery screenshots were inspected.
Calendar provider responses are mocked in the browser tests; API/provider
tests separately verify actual `If-Match` forwarding and error mapping.

| Measurement | Local PostgreSQL / production build | Immutable Preview |
| --- | ---: | ---: |
| Concurrent authenticated editors | 2 | 2 |
| Idle observation | 31 s | 31 s |
| Idle save writes | 0 | 0 |
| Active draft changes | 120 | 120 |
| Active observation | 33.9 s | 35.4 s |
| Timed save writes | 0 | 0 |
| Explicit same-field save / stale save / reviewed retry | 200 / 412 / 200 | 200 / 412 / 200 |
| Accepted revisions for that interaction | 2 | 2 |
| Notification / email row increase | 0 / 0 | 0 / 0 |
| Explicit API wall p50 / p95 (20 samples, 2 warmups) | 52.3 / 65.4 ms | 268.1 / 477.8 ms |
| Route p50 / p95 (`Server-Timing`) | 45.4 / 56.4 ms | 127.1 / 347.0 ms |

Raw results: [`nd-434-context-save-budget.json`](./nd-434-context-save-budget.json).
Idle/active drafting left the stored context-card revision unchanged; accepted
explicit edits preserved the untouched content. No periodic mutation traffic
or mutation-driven notification/database amplification occurred in this window.
These finite observations do not establish a sustained production-load or
database-query-time budget for Live.

Local validation passed: lint, RLS inventory, 2,188 tests (2 skipped), coverage
(93.59% statements, 86.04% branches, 96.13% functions, 95.02% lines), production
build, and the real PostgreSQL isolation matrix. The matrix used a disposable
database with the Realtime stub installed before migrations.

## Release gate

`LIVE_SAVE_ENABLED_SURFACES` remains empty. Zero timed mutations mean draft
persistence introduces no mutation-driven database or notification work. Normal
dashboard polling reads remain outside this claim. This evidence does not
authorize enabling Live: the ND-428/ND-429 surface-specific latency/query budget,
autosave invalidation/summary cadence, and applicable agent compatibility gates
must still pass before enabling context-card Live.
