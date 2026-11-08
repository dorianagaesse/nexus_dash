# ND-663 Task data boundary validation

Base: `ac7b2fa3` (current `origin/main` when the isolated worktree was created).
The delivery commit is recorded in the PR; no production deployment or schema
migration is part of this change.

## Behavior and ownership evidence

- Existing public service/API tests retain create/update, partial edit, actor
  attribution/assignment, relations, filtering/search, lifecycle, lane ordering,
  notifications and response contracts.
- New public-service regressions provide a distinct caller client and an unusable
  global Prisma mock. They verify authorization before locking, edit/child/relation
  writes before hydration/activity, conflict hydration without writes, foreign
  project rejection and no activity after a failed child write.
- The real ESLint configuration rejects Task delegate access, aliases, raw SQL
  and direct legacy dashboard projections in the scoped application modules.
  It permits ordinary response DTO access and documented cross-domain operations.
  Data helpers reject global clients and independent transactions/actor contexts.
- The opt-in real-PostgreSQL harness verifies published-versus-draft attachment
  visibility in board, mutation, legacy dashboard and search results.
- The full PostgreSQL isolation matrix uses a separate non-superuser,
  `NOBYPASSRLS` runtime role. Realtime test stubs are installed before migrations
  in a separate disposable local database. It covers absent actors, cross-project
  CRUD, roles, child rows, history, revoked memberships and agent credentials.

## Local validation

Node 24.15.0, PostgreSQL 16 in a dedicated Docker container, Chromium, Windows.
The full unit/API/component run passed 2,398 tests with three opt-in tests skipped.
The final focused boundary/client/lane run passed all 46 tests. RLS inventory and
the real PostgreSQL isolation matrix passed. Production builds passed, the full
Chromium suite passed 129 tests (two gated checks skipped), and the final rebuilt
relation/revision browser run passed all four tests. Skips are the opt-in
large-board audit and immutable-preview authentication check; this refactor does
not require a hosted preview.

An initial coverage run passed the other 2,361 tests but timed out loading ESLint
configuration at 30 seconds during concurrent browser work. The setup allowance
is now 60 seconds (assertion timeouts are unchanged). The isolated full rerun
passed 2,399 tests with three opt-in tests skipped and all coverage thresholds:
94.34% statements, 88.64% branches, 97.54% functions and 95.47% lines.
Lint, release policy, whitespace and changed-document references also passed.

GitHub Quality Core, E2E Smoke, Tenant Isolation and Container Image passed for
application commit
`a00f47f3a01320fc095e676ddefd4c7a735482ff` in
[Quality Gates run 42427881143](https://github.com/dorianagaesse/nexus_dash/actions/runs/42427881143).
The first browser attempt hit an unchanged meeting-preparation dismissal
assertion that also passed locally; the identical application commit passed on
retry. Final evidence-only changes affect this report and the journal, not runtime
code or tests.

The supplemental repository-wide `tsc --noEmit` command reports pre-existing
plain-object route-param typing errors in tests. Production compilation uses the
repository's `tsconfig.build.json`; the required build is the production type gate.

## SQL count and latency comparison

Used the existing `tests/task-data-performance.test.ts` harness: 24 tasks, three
warmups and ten measured samples per operation, the same database/driver and
actor-context setting on base and branch. Seed/cleanup use the local admin role;
the separate isolation matrix above verifies the restricted runtime role.
Attachment assertions run before deleting those fixtures, so measured operations
retain the original attachment-free workload. No measured operation was changed.

Final repeat pair (milliseconds):

| Operation | Driver calls base / branch | p50 base / branch | p95 base / branch |
| --- | --- | --- | --- |
| Board read | 16 / 16 | 25.4 / 27.5 | 31.8 / 28.9 |
| Single-task update | 20 / 20 | 39.2 / 42.3 | 72.0 / 53.7 |
| Board reorder | 31 / 31 | 110.2 / 116.1 | 129.4 / 179.4 |

Investigation: the initial low-load baseline medians were 18.9/30.0/68.7 ms;
a branch run during concurrent suites rose to 31.7/86.0/152.0 ms. Repeating the
unchanged baseline on the same shared host also rose to 26.6/42.7/99.5 ms.
The final pair above puts median differences within 8%, with identical driver
counts in every sample. The reorder tail remains noisy; ten samples do not
establish a latency improvement or a production SLO. Inspection found no added
SQL, changed projections or reordered lane writes. This is evidence against a
query-work regression, not proof of identical production latency.

To reproduce, set a disposable local `DATABASE_URL`, enable
`NEXUSDASH_TEST_RLS_CONTEXT=enabled` and `ND545_PERFORMANCE=1`, then run:

```text
npx vitest run tests/task-data-performance.test.ts --maxWorkers=1
```

`ND545_REPORT_PATH` optionally writes the JSON measurements. Keep performance runs
separate from CPU/memory-heavy validation when comparing timings.
