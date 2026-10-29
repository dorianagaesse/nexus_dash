# ND-434 review validation

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

## Release gate

`LIVE_SAVE_ENABLED_SURFACES` remains empty. Zero timed mutations mean draft
persistence introduces no mutation-driven database or notification work. Normal
dashboard polling reads remain outside this claim. This evidence does not
authorize enabling Live: the ND-428/ND-429 surface-specific latency/query budget,
autosave invalidation/summary cadence, and applicable agent compatibility gates
must still pass before enabling context-card Live.
