# Tasks pilot review

Reviewed source: `8e701a6d46c48f9b7e583c76c5d966a8c11d33d4`, tree
`529c32742f729c4e32b19558cc0a9861f3dbbcb0` ([integration PR #645](https://github.com/dorianagaesse/nexus_dash/pull/645)).
This source combines the runtime contracts, Kanban hooks, application-service
extraction, and scoped data-access changes. This review also replaces the
Task person helper's service import with its existing pure discriminator
validator and adds the import checks below.

The source review found no blocking ownership, transaction, or behavior issue.
Before Meeting Notes migration starts, required checks must pass on this
integrated Task source and the review changes. Later Task source changes
require another review; squash merges or retargeting must preserve the reviewed
Task code. The delivery PR and board completion comment record the final
validated commit and workflow evidence.

## Findings

| Concern | Finding |
| --- | --- |
| Ownership | Existing top-level directories remain. Public Task/project service facades hide cohesive use cases and data helpers; Kanban composes four lifecycle hooks. |
| Contracts | `lib/task-contracts.ts` owns parsing, command types, and OpenAPI builders. Use cases consume its commands; `task-input.ts` only trims text. Existing tests compare runtime field sets with the published agent schemas. |
| Application services | Scope/role checks, actor context, revision locks, retries, attribution/history, notifications, and activity retain their ordering and ownership. |
| Persistence | Read wrappers establish actor context. Query, projection, relation, and lane helpers receive that client explicitly. No global fallback or independent transaction was introduced. |
| Import graph | The reviewed Task modules and public service seams have no runtime cycles; type-only projection references do not create runtime facade dependencies. |
| Reviewability | Public callers and their behavioral tests remain stable. New lane tests cover sequential same-lane writes and project-scoped destination shifts. |
| Observed drift | `task-person.ts` reached `node:crypto` through a service validator. It now calls the same underlying pure discriminator validator directly. |

Review preserved task CRUD/status/reorder behavior, agent relation redaction,
conflict/retry boundaries, attachment response shapes and cleanup, durable
history, post-commit publication, and keyboard settlement authority. Existing
contract, route, service, component, browser, and PostgreSQL isolation suites
remain the behavior and security evidence.

## Enforced imports

- Pure `lib/task-*.ts` helpers cannot import Node built-ins, server services,
  delivery modules, or UI components.
- Kanban UI modules use domain/HTTP contracts and cannot import services.
- Routes and components use public Task service facades rather than
  `lib/services/tasks/**` internals.
- Task service internals use their caller's actor-scoped client instead of
  importing global Prisma.

These checks are scoped to the pilot. Server components such as the
authenticated app shell may still call their application services. Existing
DTO type imports in other UI areas remain allowed. The pilot does not require
unrelated domains to migrate their imports or introduce repository wrappers.

## Performance and limits

The paired local PostgreSQL comparison used the same 24-task fixture and
preserved driver-call counts. These small samples describe extraction overhead;
they are not production latency targets.

| Operation | Driver calls before/after | p50 ms before/after | p95 ms before/after |
| --- | --- | --- | --- |
| Board read | 16 / 16 | 13.2 / 14.9 | 24.6 / 27.4 |
| Single-task update | 20 / 20 | 28.8 / 26.1 | 41.0 / 29.6 |
| Board reorder | 31 / 31 | 49.5 / 51.7 | 82.6 / 69.6 |

Host paging noise in an earlier run exceeded these differences. No added query
or statement work was found. Keep the existing sequential lane-write ordering.

The board still owns selected-task editing, discussion, recovery, and attachment
orchestration. Simple service writes and the legacy dashboard read remain
direct. Board and mutation attachment projections intentionally differ.
Further extraction should follow concrete change pressure.

Future encrypted persistence must cover the documented remaining writes and
search as well as the focused data seam. The pilot documents those integration
points and avoids speculative identity-transform wrappers.

## Bounded next use

Use focused runtime contracts, cohesive use cases behind public facades,
explicit transaction-client data helpers, and UI hooks grouped by lifecycle.
Keep authorization in application services and behavioral tests at public
seams. The [service guidance](./task-services.md) and
[Kanban guidance](../kanban-controller-boundaries.md) describe the concrete owners.

Meeting Notes is the next contract migration after the validation gate above:
its collection and detail routes duplicate participant, label, and action
parsing. Reuse the parser/command approach for those request contracts while
preserving create defaults, partial updates, visibility, revision preconditions,
errors, and response shapes. Broader Meeting Notes restructuring remains a
separate decision.
