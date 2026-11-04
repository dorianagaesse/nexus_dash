# Tasks pilot review

Reviewed implementation baseline: `9e31da66a484e0bbf987a3b3ed54f7a9c64c3c44`,
tree `fa472e0bae20b495bf6b00017d5705af73e4a4dd`
([ND-545 PR #653](https://github.com/dorianagaesse/nexus_dash/pull/653)).
This includes the user-merged runtime contracts (#649), Kanban hooks (#651),
application-service extraction (#652), and scoped data access (#653).
ND-546 preserves that implementation and adds scoped import checks and this
review. The pure person validator and boolean schema acceptance already landed
in #649; its create/update/bulk compiler fixtures remain unchanged here.

The findings below support reusing this bounded pattern for Meeting Notes
contracts. They do not grant merge approval. The user reviews and merges #654
before the next task proceeds. Its PR and board completion comment record
validation for the actual delivery head; the old pre-cleanup integration is
historical evidence. Later Task implementation changes need review against
these ownership and behavior invariants.

## Findings

| Concern | Finding |
| --- | --- |
| Ownership | Existing top-level directories remain. Public Task/project service facades hide cohesive use cases and data helpers; Kanban composes four lifecycle hooks. |
| Contracts | `lib/task-contracts.ts` owns parsing, command types, and OpenAPI builders. Use cases consume its commands; `task-input.ts` only trims text. Existing tests compare runtime field sets with the published agent schemas. |
| Application services | Scope/role checks, actor context, revision locks, retries, attribution/history, notifications, and activity retain their ordering and ownership. |
| Persistence | Read wrappers establish actor context. Query, projection, relation, and lane helpers receive that client explicitly. No global fallback or independent transaction was introduced. |
| Import graph | The reviewed Task modules and public service seams have no runtime cycles; type-only projection references do not create runtime facade dependencies. |
| Reviewability | Public callers and their behavioral tests remain stable. Existing lane tests cover sequential downward/upward writes, project-scoped destination shifts, and source compaction. |
| Observed drift | `task-person.ts` reached `node:crypto` through a service validator. The #649 correction calls the same underlying pure discriminator validator directly; the lint rule prevents service imports from returning. |
| Schema typing | Legacy/coerced raw values can be accepted without satisfying the declared input shape. Schema `.is()` returns boolean after #649; parsed commands provide typed normalized data. A compiler fixture runs inside the ordinary test suite to prevent unsound narrowing and preserve input/output inference. |

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

The ordinary test suite lints forbidden and supported imports through the real
ESLint configuration, including `node:fs/promises` and bare `fs/promises`,
public facades, pure helpers, and caller-scoped clients. These are lexical
import checks; transitive dependencies and dynamic loading still need review.

These checks are scoped to the pilot. Server components such as the
authenticated app shell may still call their application services. Existing
DTO type imports in other UI areas remain allowed. The pilot does not require
unrelated domains to migrate their imports or introduce repository wrappers.

## Performance and limits

The ND-545 reconciliation comparison in #653 used the same 24-task fixture,
three warmups and ten samples per operation, and preserved driver-call counts. These small samples describe extraction overhead;
they are not production latency targets.

| Operation | Driver calls before/after | p50 ms before/after | p95 ms before/after |
| --- | --- | --- | --- |
| Board read | 16 / 16 | 21.0 / 21.9 | 41.6 / 52.9 |
| Single-task update | 20 / 20 | 29.3 / 30.0 | 70.2 / 54.9 |
| Board reorder | 31 / 31 | 59.8 / 58.1 | 108.4 / 109.3 |

Host paging noise in an earlier run exceeded these differences. No added query
or statement work was found. Keep the existing sequential lane-write ordering.

The board still owns selected-task editing, discussion, recovery, and attachment
orchestration. Simple service writes and the legacy dashboard read remain
direct. Board and mutation attachment projections intentionally differ; both
exclude unpublished comment attachment drafts. Further extraction should follow
concrete change pressure.

Future encrypted persistence must cover the documented remaining writes and
search as well as the focused data seam. The pilot documents those integration
points and avoids speculative identity-transform wrappers.

## Bounded next use

Use focused runtime contracts, cohesive use cases behind public facades,
explicit transaction-client data helpers, and UI hooks grouped by lifecycle.
Keep authorization in application services and behavioral tests at public
seams. The [service guidance](./task-services.md) and
[Kanban guidance](../kanban-controller-boundaries.md) describe the concrete owners.

Meeting Notes (ND-547) is the next contract migration after user review and
merge of this pilot: its collection and detail routes duplicate participant,
label, and action parsing. Reuse the parser/command approach for those request contracts while
preserving create defaults, partial updates, visibility, revision preconditions,
errors, and response shapes. Broader Meeting Notes restructuring remains a
separate decision.
