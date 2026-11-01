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
| `task-persistence.ts` | Existing mutation response projection and canonical relation-pair persistence helpers |
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

`task-persistence.ts` is the handoff seam for the focused data-access work.
`loadTaskMutationPayload(db, ...)`, `replaceTaskRelations({ db, ... })`, and
`editTaskRelationPairs({ db, ... })` retain their existing projections, queries,
and result shapes. Consolidating board-read projections and extracting complex
query composition should build on this seam while preserving actor-scoped
transactions. Simple application writes remain visible in the use cases until
a focused persistence interface improves their ownership.

The runtime request contract remains owned by `lib/task-contracts.ts` once that
migration lands. `task-input.ts` preserves the current service behavior during
that separate migration; it does not introduce another transport contract.

Validate changes with the repository baseline in
[the local validation runbook](../runbooks/local-validation.md). Existing service
and route tests continue through the public facade, so they exercise delegation
without coupling callers to internal filenames.
