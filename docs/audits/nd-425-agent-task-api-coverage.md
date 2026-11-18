# ND-425: Agent task-edit API coverage

Audit date: 8 November 2026. Source baseline:
`9d61fb5243f90931fe238fc359324be24f516548` (`origin/main`).
Scope: every persisted operation exposed by the current Kanban create dialog,
task detail modal, board drag/drop, and their attachment/comment controls.
Roadmap and epic boundaries are included because the brief explicitly names them.

## Result and evidence limits

Core task editing has agent equivalents. The original missing link-append
operation is fixed by **ND-424 / [GitHub #486](https://github.com/dorianagaesse/nexus_dash/issues/486)**;
additive relations are fixed by ND-451. Neither should be reopened as a new gap.
ND-649 / [PR #657](https://github.com/dorianagaesse/nexus_dash/pull/657)
is merged and restores attributed **context-card** uploads, not task attachment
attribution. A requested move of ND-649 to Done returned HTTP 403
`agent-done-move-disabled`; its reviewer/owner must perform that board move.

Six actionable findings remain, filed as ND-669 through ND-674 in the related
epic **Agent task API parity and actor-safe collaboration**. Each card is related
to ND-425 and has the report attached. Attribution work is also related to
ND-658 so persistent identity work and narrower fixes can converge.

This is a source/contract audit, not an end-to-end certification or a security
penetration test. It compares the baseline UI, route parsers, service policies,
Prisma model, existing test cases, and the hosted v1 OpenAPI fetched on the audit
date. Live requests were limited to authorized board work, reads, and the
requested Done transition. The ownership and nested-route findings below are
source-derived; production file access or reaction mutations were not probed.
Severity denotes implementation priority, not an independently reproduced
vulnerability rating. Existing tests were inspected, not rerun for this
documentation-only change.

## Coverage matrix

**Full** means the persisted UI outcome has a scoped agent equivalent, subject
to the same domain rules and documented agent capability restrictions.
**Partial** means execution, actor correctness, provider support, or published
contract coverage is incomplete. **None** means there is no agent path for the
specific outcome. Different request sequences can provide equivalent outcomes.

Paths below are relative to `/api/projects/{projectId}`. `T` means
`/tasks/{taskId}`, `C` means `T/comments/{commentId}`, and `A` means
`T/attachments`. All operations also require a valid project-bound token and
service-level project access; scopes alone do not grant another project's data.

| UI operation | Agent path and payload | Scope | Coverage and decision |
| --- | --- | --- | --- |
| Create a task | `POST /tasks` with `title` | `task:write` | **Full**: same Backlog default; title is 2–120 characters. Use the status route for a later move. |
| Set title at creation or edit it | `POST /tasks`; `PATCH T {title}` | `task:write` | **Full**; shared task contract and validation. |
| Add/remove/clear labels | Create/PATCH `labels: string[]` | `task:write` | **Full**: replace set; `[]` clears; at most eight labels, 40 characters each. Legacy `label` is not required. |
| Create/edit/clear rich description, formatting, lists and inline links | Create/PATCH `description` with sanitized rich text; `""` clears | `task:write` | **Full** for stored content; editor gestures are client behavior. Uploaded images depend on the file rows below. |
| Set/change/clear deadline | Create/PATCH `deadlineDate`; PATCH `null` clears | `task:write` | **Full**: `YYYY-MM-DD`; omitted PATCH fields are preserved. |
| Assign/change/remove epic, including quick selection | Create/PATCH `epicId`; PATCH `null` clears | `task:write` | **Full**: same-project validation. Discover epics with `GET /epics` (`task:read`). |
| Assign/reassign/unassign a human or active agent, including quick selection | Create/PATCH `assignee: {kind,id}` or `null` | `task:write` | **Full** write behavior with assignment provenance; discovery documentation is **Partial**, F6. Legacy `assigneeUserId` remains supported. |
| Search assignment/mention candidates | `GET /actors/search?query=...` | Any of `project:read`, `task:read`, `task:write` | **Partial**: implemented, scoped and bounded, absent from hosted agent endpoint catalog/OpenAPI; F6. |
| Add/remove related tasks | Create `relatedTaskIds`; PATCH replace set or `addRelatedTaskIds` / `removeRelatedTaskIds` | `task:write` | **Full**: undirected relations; additive operations preserve other pairs. Replacement and additive modes cannot be mixed. Read/search with `task:read`. |
| Move among Backlog, In Progress and Blocked | `POST T/status {status, position?}` | `task:write` | **Full**; also expressible through reorder. |
| Move to Done | Same status path or `POST /tasks/reorder` | `task:write` plus credential `canMoveTasksToDone` | **Full, intentionally gated**. Denial is permission enforcement, not missing coverage. Agents cannot grant themselves this capability. |
| Reorder within a lane or drag between lanes | `POST /tasks/reorder {columns:[{status,taskIds}]}` | `task:write` | **Full**: listed tasks receive their array positions; omitted tasks are not compacted. Send the intended lane order, or use single-task status for a targeted move. |
| Append a blocked follow-up | `PATCH T {blockedFollowUpEntry}` | `task:write` | **Full** while Blocked. Existing entries are append-only in both surfaces; no edit/delete gap. |
| Archive a Done task | `POST T/archive` | `task:write` | **Full**: only Done tasks; repeated archive is a no-op. |
| Restore an archived Done task | `DELETE T/archive` | `task:write` | **Full**; does not itself reopen the status. |
| Delete a task | `DELETE T` | `task:delete` | **Full** with the service's ownership/role checks and attachment cleanup. |
| Add link attachments during creation | `POST /tasks {attachmentLinks:[{name,url}]}` | `task:write` | **Full** operation; attachment-level uploader provenance is **Partial**, F1. |
| Add links to an existing task | `PATCH T {attachmentLinks:[{name,url}]}` | `task:write` | **Full** operation, fixed ND-424; appends without replacing files/links. Attachment provenance remains F1. |
| Upload a task file or pasted screenshot on R2, during/after creation | Create task, `POST A/upload-url`, signed `PUT`, `POST A/direct` | `task:write` | **Partial**: functional equivalent of background UI upload, but no durable credential uploader, F1. The signed storage PUT uses the issued target/headers. |
| Upload a file on local storage | Human UI uses multipart create or `POST A` | No supported agent path | **None**: agent multipart files are rejected; `POST A` requires a session; direct upload is unavailable on local storage. F5. |
| Cancel/retry unfinished R2 upload | `POST A/direct/cleanup {storageKey}`, then fresh upload flow | `task:write` | **Partial** actor boundary, F2: prefix/ownership uses human storage owner. UI queue cancellation itself is client-only. |
| Remove task link/file attachment | `DELETE A/{attachmentId}` | `task:write` | **Partial** actor correctness, F1/F2; endpoint exists with project, role/uploader and storage checks. It does not require `task:delete`. |
| Preview/open/download a file | `GET A/{attachmentId}/download?disposition=inline` or attachment disposition | `task:read` | **Full** for posted files; unpublished uploader isolation is **Partial**, F2. Image/PDF viewers are client-only. |
| Post plain/rich comment, including formatting and emoji text | `POST T/comments {content}` | `task:write` | **Full**; sanitization and 4,000 visible-text-character limit apply. Agent comments retain credential attribution. |
| Mention a human when posting | `POST T/comments` with content and `mentionSelections` | `task:write` | **Partial** documentation: runtime resolves selected member identities; human selection schema is omitted, F6. |
| Mention an agent when posting/editing | POST comments or `PATCH C` with exact visible token and `agentMentionSelections` | `task:write` | **Partial** contract round-trip: writes documented, returned `agentMentions` missing from schema, F6. Missing PATCH selections means an empty selection set, not preservation. |
| Attach files/images to a new comment; send attachment-only comment | Upload with `isCommentDraft:true`, then `POST T/comments {attachmentIds, content?}` | `task:write` | **Partial**: R2 works, but draft uploader is the human owner (F1/F2); local has no agent path (F5). Up to ten files; binding validates task and unbound state. |
| Remove a staged comment file | `DELETE A/{attachmentId}` | `task:write` | **Partial**, F2. Posted attachment moderation is also subject to the service's owner rules; arbitrary editors do not gain removal permission. |
| Edit own comment | `PATCH C {content, agentMentionSelections?}` | `task:write` | **Full** text edit: author credential must match; cannot edit the owner's human comment or another credential's comment. Attachments and original authorship are preserved. Mention schema caveats are F6. |
| Add/change/toggle off a comment reaction | `POST C/reactions {emoji}`; list via `GET C/reactions` | `task:write`; read `task:read` | **Partial**: routes accept agents but share human-owner reaction state and are unpublished, F3; parent matching is incomplete, F4. |
| Remove a reaction by ID | `DELETE C/reactions/{reactionId}` | `task:write` | **Partial**, F3/F4. UI uses POST toggle; DELETE is an additional implemented surface with the same identity issue. |
| Save after another editor has changed the task | `GET T` ETag, then `PATCH T` with `X-Content-If-Match` | `task:read` + `task:write` | **Full** optional guarded update: stale returns 412 with current content. Standard `If-Match` is rejected; local conflict UI and recovery storage are client-only. |
| Read/search tasks needed by pickers, including archived cards | `GET /tasks`, `GET /tasks/search`, `GET T` | `task:read` | **Full** supporting reads. Search returns IDs, count and truncation; hydrate selected IDs. |
| Manage epic records while organizing tasks | GET/POST `/epics`, PATCH/DELETE `/epics/{epicId}`, POST/DELETE archive | `task:read`, `task:write`, `task:delete` respectively | **Full** for the audited epic CRUD/archive surface; linking a task is the task PATCH above. |
| Move/reorder roadmap events among milestone phases | POST `/roadmap/events/move`, `/roadmap/events/reorder`, `/roadmap/phases/reorder`; roadmap GET/POST/PATCH/DELETE | `roadmap:read`, `roadmap:write`, `roadmap:delete` as appropriate | **Full** for event/phase operations. These are separate roadmap records, not Task membership fields. See the boundary decision below. |

The UI inventory is anchored in [create-task-dialog.tsx](../../components/create-task-dialog.tsx),
[task-detail-modal.tsx](../../components/kanban/task-detail-modal.tsx),
[kanban-board.tsx](../../components/kanban-board.tsx),
[task command payloads](../../components/kanban-board-task-commands.ts), and
[drag/drop persistence](../../components/kanban/hooks/use-kanban-drag-drop.ts).
The shared field inventory is [task-contracts.ts](../../lib/task-contracts.ts),
with [write use cases](../../lib/services/tasks/task-write-use-cases.ts),
[lifecycle rules](../../lib/services/tasks/task-lifecycle-use-cases.ts),
[Done capability policy](../../lib/services/tasks/task-policy.ts), and
[agent contract](../../lib/agent-onboarding.ts). These sources cover the matrix,
rather than inferring capability from a route name alone.

## Filed findings

### F1 — ND-669: task attachment actor provenance (P1)

[TaskAttachment](../../prisma/schema.prisma) has `uploadedByUserId` but lacks the
credential/kind/snapshot fields now present on ResourceAttachment. In
[project-attachment-service.ts](../../lib/services/project-attachment-service.ts),
`createTaskAttachmentsFromDraft` and `finalizeTaskAttachmentDirectUpload` store
only the human owner. `touchTaskActivity` updates only `updatedByUserId`, without
updating or clearing existing agent attribution. Task link append in
`updateTaskForProject` also delegates attachment creation without an uploader
credential. Successful transfer therefore does not establish correct provenance.

Recommended surface: extend existing attachment persistence, projections and
services, retaining human storage ownership separately. No new upload endpoint
is needed for R2. Add credential snapshots that survive lifecycle changes and
carry the acting identity through attachment deletion/activity. Coordinate with
ND-658; do not create a second incompatible identity model.

### F2 — ND-670: unpublished comment file ownership (P1)

`getTaskAttachmentDownload` checks a draft's `uploadedByUserId` against
`actorUserId`; `createTaskCommentForProject` selects bindable files by the same
user ID and `commentId:null`. The [comment service](../../lib/services/project-task-comment-service.ts)
and attachment service therefore cannot distinguish two credentials sharing an
owner from that owner's human session. Storage-key checks also bind to the human
owner. Existing project checks still apply; no cross-project bypass is asserted.

Recommended surface: enforce actual uploader identity across draft download,
binding, removal and applicable finalize/cleanup paths using F1's metadata.
Specify any owner moderation exception explicitly and preserve project-reader
access after publication. Validate human/A/B combinations and atomic binding with
isolated records, rather than exercising another actor's live draft.

### F3 — ND-671: reaction identity and discoverability (P1)

`TaskCommentReaction` stores only `userId`. `addTaskCommentReaction` accepts
`agentAccess` but finds, toggles and replaces reactions by `actorUserId`;
`removeTaskCommentReaction` compares the same owner ID. The response groups
human users and calculates `reacted` for that owner. A separate agent reaction
cannot be represented, and the owner's reaction can be altered by an agent call.
GET/POST reaction routes and DELETE-by-ID are absent from the agent catalog and
hosted OpenAPI despite accepting bearer principals.

Recommended surface: actor-aware persistence/ownership and response projection
on the existing routes, with lifecycle snapshots and regression cases for a
human plus two credentials. Publish the resulting routes, toggle semantics,
scopes and errors together. Merely documenting today's owner-sharing behavior
would not close the identity gap.

### F4 — ND-672: nested reaction target validation (P2)

The reaction GET/POST route passes `commentId` but not `taskId` to its service.
DELETE passes only `reactionId` and project/actor information. Services verify
the discovered object's project but cannot compare the whole supplied URL.
A wrong task/comment parent in the same project is therefore not rejected by
these checks. This is an adjacent contract-correctness finding for both human
and agent callers, not a claim that project isolation is absent.

Recommended surface: pass all parent IDs into existing service calls and enforce
project → task → comment → reaction matching before any read/write. Add route
and service tests covering same-project wrong parents as well as cross-project
denials. Keep this independent of F3's identity migration.

### F5 — ND-673: local-storage task file uploads (P2)

`parseCreateTaskMultipartInput` rejects agent `attachmentFiles` with
`agent-file-attachments-not-supported`. The form attachment route calls
`requireAuthenticatedApiUser`. `createTaskAttachmentUploadTarget` returns
“Direct upload is not available for the current storage provider.” when the
provider cannot issue signed uploads. This leaves no local-storage agent upload
equivalent, including for comment drafts. Link attachments remain supported.

Recommended surface: scope-enable a focused multipart task upload path (or an
equivalent route) with `task:write`, real uploader attribution and draft rules.
Creating the task first is acceptable if documented; atomic multipart task
creation need not be added just to mimic the UI transport. Preserve R2 and human
paths, validation and cleanup. Context-card local uploads are explicitly outside
this task and outside this Kanban audit's coverage claim.

### F6 — ND-674: actor discovery and mention contract (P2)

[searchProjectActors](../../lib/services/project-actor-service.ts) accepts any
of `project:read`, `task:read`, `task:write`, but `/actors/search` is absent from
the endpoint catalog/OpenAPI. Task comment creation parses `mentionSelections`
for human disambiguation, while its public schema omits the field. Runtime
comment records return `agentMentions`, but `TaskCommentRecord` omits it.
Editing defaults absent `agentMentionSelections` to an empty list, making the
missing response contract relevant to preserving tags. The update schema's raw
`content.maxLength:4000` also misstates a service limit measured on extracted
visible text, so a valid formatted comment can exceed that raw string length.

Recommended surface: publish the existing actor-search endpoint and complete
comment input/output schemas/examples; verify the true OR scope rule and bounds
with contract tests. Explain full selection replacement on PATCH. Do not promise
human mention notifications on edit: both UI and API currently omit that behavior.

## Explicit exclusions and decisions

- **Link rename/URL edit in place:** the current task modal has add/remove/open,
  not an edit-existing-link control, and the attachment item route exports only
  DELETE. This is absent in both surfaces, not a human-only task-edit gap.
  Delete/re-add is available when authorized. The old workflow runbook assertion
  that in-place editing is a Kanban UI operation is corrected with this report.
- **Task-to-roadmap linkage:** at this baseline the Task contract/model has no
  milestone foreign key and the Kanban controller has no task-to-roadmap write.
  The roadmap panel moves RoadmapEvent records through the documented roadmap
  API. Do not infer an unimplemented Task field from the older wording of ND-402.
  Adding real Task/milestone linkage would be separate product work, deferred
  here because it is not a current human Kanban operation.
- **Delete comments, edit/delete blocked entries, edit posted comment attachment
  sets, edit task reference numbers:** not offered as task-edit controls in the
  audited UI. No agent-parity endpoint is proposed. Posted attachment deletion
  remains governed by existing owner rules, not arbitrary comment-text editing.
- **Autosave timing, discard/recovery, modal state, filter preferences, copying
  share links, image zoom, file queues and keyboard drag gestures:** client
  interactions over covered reads/writes; they need no separate agent route.
  Optional `X-Content-If-Match` already supplies guarded task writes.
- **Done permission administration:** intentionally owner-only; ND-649's denial
  is not grounds to change grants or use a different identity.
- **Directed blockers and artifact history:** already tracked by ND-460 and
  ND-485; do not duplicate them as shipped Kanban gaps. General capability and
  identity changes remain with ND-130 and ND-658. The earlier session-API audit
  ND-257 is not proof of agent coverage, and the broad security audit ND-667 is
  separate work.

## Verification and handoff

Inspected regression suites include task create/update/status/reorder/relations,
task attachment routes/services, comment create/update/agent mentions/reactions,
actor search, agent onboarding/OpenAPI, and task modal controls/comments. These
establish existing intended behavior; they do not substitute for the isolated
ownership and parent-mismatch regressions requested in the follow-up cards.

The live project task inventory (including archived results) and epic registry
were searched before filing. Existing ND-424, ND-451, ND-649, ND-658, ND-130,
ND-460 and ND-485 were considered explicitly. New cards were read back to verify
Backlog placement, labels, rationale/criteria, report attachment, epic membership
and bilateral relation to ND-425. Epic membership and completion status belong
on the board; this document is the dated evidence snapshot.

Documentation validation: `git diff --check` and local Markdown link/reference
review. No runtime code or schema is changed by this audit PR; the code-change
test/build and preview requirements apply to the implementation follow-ups.
