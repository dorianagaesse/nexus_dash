# Task application services

`lib/services/project-task-service.ts` is the public application-service entry
point. Routes, server components, and other domains keep importing its existing
functions and types. Task internals live under `lib/services/tasks/`:

| Module | Responsibility |
| --- | --- |
| `task-write-use-cases.ts` | Create and partial update orchestration, revision preconditions, attachment staging, assignment history, notifications, and activity writes |
| `task-lifecycle-use-cases.ts` | Status transitions, reorder, archive/restore, and deletion with attachment cleanup |
| `task-policy.ts` | Project-scoped relation/epic validation and live agent Done-move policy |
| `task-assignment.ts` | Actor resolution, durable agent attribution, assignment provenance/history, and assignment notifications |
| `task-input.ts` | Existing service-side value normalization and compatibility validators |
| `task-read-use-cases.ts` | Actor context, agent read scope, and list/detail entry points |
| `task-data.ts` | Board query composition, list filters, scoped detail reads, and lazy Done archiving |
| `task-projections.ts` | Shared person/relation projections and exact board/mutation record shapes |
| `task-persistence.ts` | Mutation hydration, relation-pair edits, and ordered lane-position writes |
| `task-types.ts` | Shared command, result, response, and assignment types |
| `task-result.ts` | Consistent service errors and Prisma not-found classification |

Use-case modules establish the actor RLS context and require the project role.
Keep those checks in the application layer; a transport validator or actor
assignment never grants project permissions. Internal helpers receive the
caller's `DbClient` explicitly. They do not open independent transactions or
fall back to a global database client.

The extraction preserves statement ordering and existing retry boundaries.
Revision locking still precedes update reads and writes. Assignment history,
notifications, task mutations, and durable activity writes retain their original
transaction client and ordering. Deletion keeps its existing storage cleanup and
error handling. Human and agent responses, relation diagnostics, and stable
public imports remain compatible.

Task data helpers require an explicit `DbClient`: no global client default,
transaction, authorization grant, retry loop, or post-commit publication lives
there. Public read wrappers establish actor context; mutation use cases pass
their existing scoped client through every relation and position operation.
Lane shifting preserves the original sequential write order, followed by the
task write and source-lane compaction. Revision locking, notifications, durable
history, activity, and retry decisions remain in application services.

Board and mutation projections share relation/person field definitions while
retaining their distinct attachment shapes and the mutation's conditional epic
projection. `project-service.ts` re-exports its existing Task reads and types;
new consumers can use the Task service facade. Routes and components never
import Task data modules directly.

Simple single-row writes, assignment history, policy lookups, and legacy
`getProjectDashboardById` remain direct service queries. Wrapping each Prisma
call adds no useful domain boundary. The focused data modules own reusable
query composition and multi-row relation/position operations.

Future encrypted persistence can transform sensitive Task fields in the read
queries, mutation projection/hydration, and write helpers without changing HTTP
routes. Search and the documented remaining direct writes must be included in
that later migration. This pilot adds no identity-transform scaffolding, keys,
ciphertext, dual reads, or encryption behavior.

The runtime request contract remains owned by `lib/task-contracts.ts` once that
migration lands. `task-input.ts` preserves the current service behavior during
that separate migration; it does not introduce another transport contract.

Validate changes with the repository baseline in
[the local validation runbook](../runbooks/local-validation.md). Existing service
and route tests continue through the public facade, so they exercise delegation
without coupling callers to internal filenames.
