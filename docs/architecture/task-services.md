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
| `task-input.ts` | Service-side text normalization; transport validators stay in `lib/task-contracts.ts` |
| `task-read-use-cases.ts` | Actor context, agent read scope, and list/detail entry points |
| `task-data.ts` | Board query composition, list filters, scoped detail reads, and lazy Done archiving |
| `task-projections.ts` | Shared person/relation projections and exact board/mutation record shapes |
| `task-persistence.ts` | Mutation hydration, relation-pair edits, and ordered lane-position writes |
| `task-command-data.ts` | Exact edit/lifecycle state, lane tails/destinations, relation diagnostics, assignment notification context, and deletion-file projections |
| `task-write-data.ts` | Scalar content/attribution writes, lifecycle placement, archive/restore, assignment history, blocked follow-ups, and cascading deletion |
| `task-search-data.ts` | Project-scoped search documents, active-first ordering, and published attachment names |
| `task-dashboard-data.ts` | Legacy dashboard aggregate with its original Task projection and project/resource joins |
| `task-types.ts` | Shared command, result, response, and assignment types |
| `task-result.ts` | Consistent service errors and Prisma not-found classification |

Use-case modules establish the actor RLS context. Mutations and search require
the project role; board/detail and legacy dashboard reads retain their existing
principal predicates in addition to RLS. Keep authorization decisions in the
application layer; a transport validator or actor
assignment never grants project permissions. Internal helpers receive the
caller's `DbClient` explicitly. They do not open independent transactions or
fall back to a global database client.

The extraction preserves statement ordering and existing retry boundaries.
Revision locking still precedes update reads and writes. Assignment history,
notifications, task mutations, and durable activity writes retain their original
transaction client and ordering. Deletion keeps its existing storage cleanup and
error handling. Human and agent responses, relation diagnostics, and stable
public imports remain compatible.

Board and mutation projections exclude unpublished comment attachment drafts
(`isCommentDraft: false`), preserving the ND-610 publication boundary.

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

## Persistence contract

ND-663 completes Task-owned create/update, lifecycle, assignment/policy, search,
and legacy dashboard persistence. Named operations take the caller's `DbClient`
and scalar domain inputs; they do not expose Prisma argument bags, generic CRUD,
query callbacks, or a repository class. Result types are inferred from the exact
Prisma projections. Write contracts allow only the fields owned by that operation,
not arbitrary nested writes or revision operators. Query and projection changes
now have a concrete owner without another dependency-injection framework.

Application services still decide whether a relation is valid, which actor to
assign, when to notify, how a lane move behaves, and whether to retry. In
particular, human relation diagnostics can inspect another RLS-visible project;
agent diagnostics explicitly supply their bound project ID to prevent existence
leaks. Unique-ID command reads retain `projectId`, which use cases check before
writes. Command reads and writes require prior project authorization; these internal
helpers are not independently authorized public entry points.

Revision locks remain before edit reads, inside the caller's transaction.
Creation/history/relation/attachment ordering and update/child/history ordering
are unchanged. The database still owns revision increments. Hydration excludes
comment drafts, while deletion intentionally loads **all** file storage keys,
including drafts, for cleanup. Storage deletion and durable activity orchestration
stay in use cases; post-commit delivery stays with the existing activity pipeline.
No migration, encryption, transaction, or retry behavior is added here.

## Ownership inventory and explicit cross-domain exceptions

| Owner | Remaining access and reason |
| --- | --- |
| Task data modules listed above | Task content, relations, assignment history, follow-ups, command projections, search, board/detail and legacy dashboard reads. The legacy dashboard data operation retains project/resource joins to preserve SQL work and missing-project behavior. |
| `content-revision-service.ts` | Shared raw SQL row lock for Task, Resource and Meeting Note revisions. Use cases invoke it after authorization and before reading. Moving the shared lock would split its concurrency contract. |
| `task-policy.ts`, `task-assignment.ts` and `project-actor-service.ts` | Epic existence, live credential capability/label and actor registry reads belong to the Epic/identity boundaries. No direct Task persistence remains in Task policy or assignment. |
| `project-task-comment-service.ts` | Comment/reaction/mention persistence, draft publication and parent Task authorization/activity touches stay atomic with comment delivery. This is the discussion domain, not Task content editing. |
| `project-attachment-service.ts` | Upload staging/finalization, attachment metadata, parent authorization and Task activity touches stay with storage lifecycle orchestration. |
| `project-offboarding-service.ts` | Responsibility inventory and bulk Task reassignment/history remain atomic with Meeting Todo, membership and ownership changes. |
| `project-service.ts`, `project-epic-service.ts`, `my-work-service.ts` | Cross-domain project counts (including Task/attachment counts), Epic progress and personal-work aggregates retain their current joins/projections. Legacy full Task dashboard content now lives in `task-dashboard-data.ts`. |
| `project-agent-attention-service.ts` | Assignment and mention attention joins/projections belong to the agent inbox. |
| `project-notification-email-service.ts` | Operational due-date reminder SQL intentionally scans across projects in its scheduler context, outside actor-scoped Task use cases. |

These exceptions are a bounded migration inventory, not permission to add Task
content operations to unrelated services. Other domains are not migrated by this
PR. Changes to an exception's content access require reviewing its authorization,
transaction and eventual encryption needs explicitly.

## Later encrypted persistence

Content transforms can be introduced at `task-write-data.ts` writes and the
board/detail, mutation, command, search and legacy-dashboard read projections.
Search documents must decode fields before the existing plaintext matching;
relation titles and notification assignment context need the same treatment.
Follow-up content and assignment snapshots have their own named writes. Cross-domain
comment/attachment metadata, offboarding history, inboxes and reminder SQL in the
inventory must be included in an encryption rollout; this Task seam alone is not
a claim that every application read of Task data has migrated. No identity
transform hooks, ciphertext fields or keys are introduced ahead of that work.

The runtime request contract is owned by `lib/task-contracts.ts`. The public
facade re-exports its compatibility validators and command types; use cases
consume its canonical parsed commands. `task-input.ts` contains only existing
service-side text normalization and does not define another request contract.

Schema `.is()` reports boolean acceptance, including legacy values that parsing
normalizes. Use the successful `.parse()` result for typed command data; an
acceptance check does not narrow the raw request to the declared input type.

ESLint keeps routes/components on the public Task facades and prevents Task
internals from importing global Prisma. Pure Task helpers and Kanban UI have
their own scoped import restrictions; server components and other domains'
DTO imports remain valid. Scoped syntax checks also reject Task delegates,
raw SQL, delegate aliases and destructuring in Task application modules (including
search and the facade). Only the named data files may access Task persistence;
they cannot import global Prisma or establish their own actor context/transaction.
The tests exercise these rules through the real ESLint configuration. These are
lexical guardrails, not a whole-program proof against dynamic indirection. The
legacy project service permits Task counts but rejects new Task delegate operations
and inline Task dashboard projections.
The [pilot review](./task-pilot-review.md) records the
reviewed integration source, performance evidence, exceptions, and reuse gate.

Validate changes with the repository baseline in
[the local validation runbook](../runbooks/local-validation.md). Existing service
and route tests continue through the public facade, so they exercise delegation
without coupling callers to internal filenames.

ND-663 validation and the before/after SQL comparison are recorded in
[the boundary validation report](./task-data-boundary-validation.md).
