# ND-187 Shared Discussion and Subscription Contracts

Date: 2026-10-10
Status: Proposed; implementation and surface scope remain review gates

## Context and delivery boundary

ND-187 currently asks for reusable discussion, mentions, reactions, and explicit
watchers across meeting notes, context cards, epics, and roadmap items. DeepSeek's
2026-10-10 scope review and handoff identify this as a staged program. ND-189
separately owns notification preferences and followed artifact changes. This ADR
is the architecture milestone, not evidence that the runtime acceptance criteria
are complete. The board owns scope, sequencing, and implementation status.

Verified against `origin/main` at `f1873ac`:

- `TaskComment`, `TaskCommentAgentMention`, and `TaskCommentReaction` in
  [the schema](../prisma/schema.prisma) reference tasks/comments directly.
- [The task comment service](../lib/services/project-task-comment-service.ts)
  already implements rich text, attachments, human mentions, credential mentions,
  author-only edits, and reaction toggles. Reactions identify a user, including
  when invoked by an agent acting through its owner; they are not yet independent
  agent reactions. A message edit synchronizes agent mentions but does not send
  new human mention notifications.
- [Agent attention](../lib/services/project-agent-attention-service.ts) exposes
  task-comment mention events with stable identifiers and cursors.
- No discussion or subscription tables exist for the other surfaces.

AC3 becomes a shared behavior contract: consolidate and preserve the shipped
rules, explicitly identify intentional extensions, and require every new surface
to use that contract. Do not describe the earlier piecemeal implementation as a
single original design.

## Storage decision

Use one `DiscussionThread` and one `DiscussionMessage` family, with typed,
foreign-key-backed artifact references. Reject an unconstrained
`artifactType + artifactId` pair: it cannot prevent orphaned or cross-project
threads in the database. Reject independent message tables per surface: they
would duplicate attribution, subscriptions, mention delivery, and policy logic.

Proposed entities (names are implementation contracts, not existing models):

| Entity | Identity and invariants |
| --- | --- |
| `DiscussionThread` | `id`, `projectId`, and exactly one non-null target FK: `taskId`, `meetingNoteId`, `resourceId`, `epicId`, `roadmapPhaseId`, or `roadmapEventId`. One thread per target. |
| `DiscussionMessage` | `id`, `threadId`, sanitized `content`, original `createdAt`, nullable edit timestamp, author user/credential references, explicit actor kind, stable author key, and credential/display snapshots. |
| `DiscussionAgentMention` | Message, target credential, label snapshot, creator actor snapshot, and original event timestamp; unique live message/credential pair. |
| `DiscussionReaction` | Message, stable reaction actor key, optional user/credential references, display snapshot, emoji, and timestamp; one active reaction per actor/message, preserving toggle/switch semantics. |
| `DiscussionSubscription` | Thread, stable subscriber actor key, user or credential reference, creation timestamp; unique thread/subscriber. Existence means explicitly watching discussion. |

`DiscussionThread` gets a SQL exactly-one-target CHECK plus a unique constraint
on each target FK. Every target FK includes `projectId` and references a unique
`(id, projectId)` key on the target. Add those parent keys where absent;
`RoadmapPhase` already has one. Thread-to-project and target-to-thread deletion
cascade. A roadmap event keeps its own thread when regrouped within the project;
it does not inherit the milestone's thread. Prevent target and project mutation
on an existing thread. Thread creation is lazy and race-safe through the target
unique constraint. Empty reads return an empty thread without creating a row.

Children derive their tenant through their thread; do not accept independently
writable child `projectId` values. If a child needs a denormalized project key for
an index or policy, enforce its consistency with a composite FK. Attachments
remain artifact-owned. During task extraction `TaskAttachment.commentId` binds
to the migrated message ID, keeping file IDs, storage keys, and download URLs.
New surfaces must use their authorized upload/bind path and validate the message
and attachment share a target before accepting a binding. Do not migrate blobs.

Stable actor keys distinguish `human:<userId>` and `agent:<credentialId>`; a
credential owner is an authorization principal, not the author/subscriber.
Snapshots survive credential deletion. They cannot confer edit or subscription
rights after credential revocation/deletion. For migrated legacy reactions,
record the existing user actor; the old rows cannot reveal which credential
invoked a reaction. New actor-aware reaction behavior must be documented and
verified before it is enabled through task compatibility routes.

## Shared authorization and attribution

All database access stays in `lib/services/**`, under `withActorRlsContext`, with
explicit project/target predicates as well as forced PostgreSQL RLS. Thread,
message, reaction, mention, and subscription models enter the RLS inventory;
child policies derive ownership through the thread and its FK-backed parent.

| Operation | Human rule | Agent rule |
| --- | --- | --- |
| Read discussion | Current project viewer or higher; target must be accessible. | Current credential in this project plus the target read scope and owner's project access. |
| Post/edit discussion | Editor or owner; only the exact author may edit. | Target write scope plus owner's editor access; only the exact author credential may edit. |
| React | Editor or owner; manage only own reaction. | Same write/access requirements; manage only this actor's reaction. |
| Watch/unwatch | Viewer or higher; manage only own subscription. | Target read scope plus owner's access; manage only this credential's subscription. |
| Delete artifact | Existing artifact deletion policy. | Existing artifact delete scope and role policy, where supported. |

Watching is personal state, so a viewer may watch without gaining content-write
rights. Neither an artifact owner nor a credential owner can subscribe other
actors. Watcher counts/listing must not expose inaccessible actors; the baseline
UI needs only the current actor's watch state. Subscription RLS restricts writes
to the subscriber principal, while services additionally distinguish credentials
sharing that principal. There is no client-supplied author or credential owner.
Validate credential membership, expiry, revocation, and scopes at request time.

For task compatibility preserve `/tasks/{taskId}/comments/**`, IDs, response
shapes, errors, attachment caps, content limit (4,000 plain-text characters),
rich-text sanitization, `task:read`/`task:write` checks, and credential label plus
`(agent)` attribution. An agent owner's session cannot edit the agent's message;
a credential cannot edit its owner's human message or a sibling credential's
message. Credential label snapshots identify historical authors even if renamed.
Do not grant new surfaces access via `project:read` or `attention:read` alone.

Context and roadmap can reuse their existing artifact scopes. Meeting and epic
scopes do not exist in [the scope registry](../lib/agent-access.ts): their rollout
must introduce explicit read/write grants, owner controls, OpenAPI documentation,
and parity tests, without automatically broadening existing credentials. Human
UI rollout may precede that addition, but must not claim agent parity until the
scoped API is delivered. `attention:read` continues to authorize only the current
agent's attention feed, with project access and explicit artifact predicates.

## Mentions, notifications, and watchers

Parse mentions through the existing rich-text/member/agent resolution rules.
An invalid explicit agent selection rejects the whole write. Mentions target
current project actors, never arbitrary user IDs from the client. Preserve stable
agent-mention event IDs and creation timestamps when unchanged; removed mentions
are removed, and re-added mentions create new events as today. Revoked/deleted
credentials retain historical display attribution but receive no new events.

Human self-mentions do not notify that human. Agent mentions of the credential's
human owner remain eligible: these are different actors. Deduplicate recipients
when mention and watch reasons overlap, retaining all reasons in metadata.
Posting does not automatically subscribe the author, creator, assignee, project
owner, or all members. Watch/unwatch does not create a discussion notification.
Reactions and ordinary message edits do not notify watchers. Preserve current
task edit behavior for human mentions; adding edit-time delivery requires an
explicit separate decision rather than a silent extraction change.

A watched **new message** emits one candidate per subscribed actor after a
transactional message write. Re-check project access and active credential state
before delivery; a removed member or revoked credential receives nothing.
Human subscribers use the notification center and existing email orchestration.
Agent subscribers use an actor-scoped attention stream; do not send their
watch events to the credential owner's human inbox. No default email broadcast.
Each candidate carries its actor, thread/message, target, occurrence time, and
reasons (`mentioned` and/or `watching discussion`). Every delivered notification
explains the reason and links to the target and focused message. Each rollout
must implement and test opening that link, including a closed modal or archived
artifact; unsupported links must not ship.

The message/mention mutation and a durable delivery intent commit together.
Delivery failure must not lose the intent or fail an already committed comment.
Retry with a deterministic recipient/event key compatible with
`Notification`'s `(recipientUserId, sourceType, sourceId)` uniqueness. The extraction
first preserves current task notification source identifiers to avoid duplicates
in old inbox/email records. Adding the durable intent worker and watcher fanout
is a separate milestone, with migration and failure/retry tests. Realtime carries
invalidation/version signals through the established activity path, not a second
thread transport or notification payload broadcast to all project members.

### Boundary with ND-189

ND-187 owns the discussion schema, exact actor subscription identity,
watch/unwatch service and UI, new-message delivery intents, and target/message
link resolution. ND-189 owns per-channel notification preferences, policy that
filters candidates, and producers for ownership, assignment, handoff, completion,
and followed **artifact changes**. One shared preference evaluator filters human
in-app/email and agent delivery as applicable; each surface must not invent one.

An explicit discussion watch is distinct from following all artifact changes.
ND-189 may reuse thread target resolution and actor keys; it must not interpret a
thread subscription as consent to every artifact event. Deliver migration without
watcher fanout first. Enable watcher fanout only once ND-189's shared preference
contract is available (or supplied by a jointly scoped milestone). Define channel
opt-out behavior and reason precedence there. Watch state must not claim delivery
is active before that gate. No duplicate subscription tables or competing event
producers. This is the proposed ownership boundary for board review.

## Retention and deletion

- Archive/status changes keep the thread and history; content access follows the
  archived artifact's existing access rules. Watch delivery still requires a new
  message and active access, not an archival event.
- Hard artifact/project deletion cascades messages, reactions, agent mentions,
  and subscriptions. Resolve related inbox entries and cancel pending delivery
  intents/email items so stale links do not trigger later mail. Use source keys
  and target metadata to locate them; do not depend on live message joins after
  the cascade. Already delivered email cannot be recalled.
- There is no new message-delete endpoint or timer-based purge in this milestone.
  Editing preserves author identity and creation time and updates edit metadata.
  Durable collaboration history remains a separate audit contract; do not turn
  it into an unbounded copy of every discussion body.
- Preserve existing human account-deletion cascades during task migration rather
  than silently retaining deleted users' text. Credential deletion sets nullable
  references to null and retains kind/key/label snapshots; live subscriptions for
  that credential are deleted. No subscription with a null identity can deliver.
- Task attachments retain the existing `commentId` SET NULL behavior if a message
  disappears while the task survives. Artifact deletion uses existing storage
  cleanup; collect keys before cascading and record failed cleanup for retry.
  Retention changes and attachment retention for new surfaces must be tested as
  part of their rollout, not inferred from a text discussion implementation.

## Migration and compatibility gates

Use an expand/backfill/cutover/contract sequence with one authoritative write
path. A backfill run must be restartable and run under the privileged migration
connection; runtime remains on the separate non-bypass RLS role.

1. Add tables, parent uniqueness, constraints, RLS policies/inventory, and indexes.
   Leave deployed task handlers writing the legacy model. Backfill one thread per
   task with comments and copy messages, reactions, and mention rows, preserving
   their IDs, timestamps, snapshots, and references. Do not create subscriptions
   from historic authors/mentions. Empty tasks need no thread.
2. Fence comment writes for the final delta and cutover; drain in-flight requests,
   copy the delta, verify parity, then deploy/resume on the shared service. Old
   instances must not continue writing legacy rows after resumption. Provide the
   operator procedure and a bounded write interruption in that PR. Do not rely
   on an unfenced background backfill or untested dual writes.
3. Move task handlers to thin compatibility adapters. Keep task URLs, task counts,
   edited comment responses, reactions, file bindings, notification source keys,
   attention item IDs/cursors, and realtime reconciliation behavior equivalent.
   Compare per-task counts and ordered content, null edit timestamps, author
   snapshots, attachment bindings, reaction groups, and mention timestamps.
4. Rollback before resuming writes can restore the legacy adapter. After shared
   writes resume, rollback must reverse-copy new/edited/deleted data under the
   same fence and verify parity; switching code alone would lose discussion.
   Retain legacy tables until this operator path is proven. Drop them in a later
   contract migration only after a verified release, backup, and rollback review.

The extraction must pass the full [local validation baseline](../docs/runbooks/local-validation.md),
[RLS matrix](../docs/runbooks/rls-tenant-isolation.md), and branch-scoped preview
validation. Required cases include absent actor, cross-project forged target,
wrong thread/message/attachment, revoked member/credential, shared credential
owner with distinct agents, foreign reaction/subscription edits, deleted author,
archive versus hard delete, duplicate concurrent creates/watch toggles, migration
restart/parity, and rollback after post-cutover writes. No widening existing API
scopes or attention feeds during storage migration.

## Rollout review gates

The card's four named surfaces remain the proposed scope; meeting notes are the
pilot, followed by context cards, epics, and roadmap. Roadmap milestones and
events are distinct targets. This order is a recommendation pending product
confirmation, not an assumption that has changed the card's acceptance criteria.
Each surface delivers a shared thread UI, rich-text mentions, explicit watch
state, actor-aware reactions, authorization, working deep links, and tests. Use
one reusable composer/thread component and surface adapters for target resolution
and authorized upload/link behavior. Each PR updates its affected documentation
and provides preview evidence; the parent card remains In Progress until the
reviewer accepts the agreed implementation outcomes.

Split implementation into independently reviewable linked board cards only after
searching for duplicates. Keep one branch/PR per card. The proposed stages are
storage extraction/migration, discussion subscriptions and durable delivery
(coordinated with ND-189), and one rollout per surface. If the product instead
selects foundation-only or a narrower pilot, update the board brief and this ADR
before claiming ND-187 complete.
