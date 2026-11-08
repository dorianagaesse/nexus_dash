# Personal todos

Open a project's **Todos** page and enter text in **Add a todo for yourself**.
Press Enter or **Add todo**. The item joins the same list as meeting actions;
there is no second checklist. **Only you** means other project members,
including owners, cannot see it. **Project members** marks meeting actions,
which retain their existing visibility even when the meeting notes are private.

Use the existing **Open** / **Completed** views to complete and reopen items.
**Assigned to me** includes your personal todos; **Unassigned** includes only
unassigned meeting actions. Personal todos cannot be reassigned or shared.
Use the pencil to edit inline and the delete button to remove your own item
with confirmation. Owners/editors can manage their own personal todos;
viewers can read their saved personal todos but cannot change them.

## Authorization and persistence

`ProjectTodo` uses forced PostgreSQL RLS and actor-bound service transactions.
Every read, count, update and delete is scoped to `projectId` and
`createdByUserId`; mutations also require item ID and revision. Membership
revocation removes access. Human session endpoints reject agent tokens, and
RLS rejects agent contexts even when attributed to the human creator.
Project owners have no privacy override. Creator-less rows remain hidden.

The shared ND-130 access guard and restrictive capability adapter apply
`task:read` to reads and `task:write` to personal modifications, including
own-item deletion. Role ceilings still apply. The adapter delegates to
`app.has_project_capability(text,text)` once installed, supports either
migration order, denies null decisions, and does not swallow provider errors.
The forward privacy migration supersedes the initial shared-checklist policies
without changing already-applied migrations or deleting data.

## API contract

- `GET /api/projects/{projectId}/todos`: the caller's items and edit/delete flags.
- `POST /api/projects/{projectId}/todos`: `{ content }`, 1-500 trimmed characters.
- `PATCH /api/projects/{projectId}/todos/{todoId}`: `{ revision, content }` or
  `{ revision, completed }`; one operation per request.
- `DELETE /api/projects/{projectId}/todos/{todoId}`: `{ revision }`.

Create/update return `{ todo }`; delete returns `{ todo: null }`. A stale,
missing, other-person or foreign-project ID returns the same `409` without
exposing metadata. Failed saves retain drafts. On conflict, refreshed data
lets the user review the latest version before saving their retained text.
A removed or filtered-out item keeps its unsaved editor recoverable.

Personal mutations do not emit project-wide activity or notifications. The
existing client-local mutation lifecycle refreshes the signed-in user's badge;
the summary adds only that user's open personal todos to meeting-action counts.
No agent identity or realtime transport is added by this feature.

## Validation

`tests/e2e/personal-todos.spec.ts` covers the unified list, capture/edit/recovery,
completion/reopening, own deletion, owner/member privacy, viewer role ceilings,
revocation, foreign IDs, navigation counts, mobile/desktop, dark mode, reduced
motion, and text scaling. Existing meeting-todo flows remain regression tests.
Service/route/component tests cover creator predicates, actor spoofing,
capability denials, stale writes and draft recovery.

The PostgreSQL matrix in `scripts/test-project-todo-rls.mjs` tests creator-only
read/write/delete, owner denial, agent denial, role ceilings, revocation,
forged creators, cross-project moves, and a capability provider installed after
the migrations. Run [local validation](local-validation.md) and the
[tenant-isolation matrix](rls-tenant-isolation.md).
