# Project checklists

Open a project's **Todos** destination and use **Checklist** for small actions
that do not need a Kanban task or meeting note. Enter text and press Enter or
**Add item**. Each item can be edited inline, completed, and reopened from
**Completed**. **Created by me** narrows the shared list; it does not make an
item private. There is no global Todos destination in this change.

## Authorization and persistence

`ProjectTodo` is project-owned content with forced PostgreSQL RLS. Services
authorize the actor in the same RLS transaction as the read/write. Every item
mutation predicates on both `projectId` and item ID. Owners and editors can
write, viewers can read, and only owners can delete. The HTTP endpoints use
verified human sessions; agent tokens are not accepted by these new endpoints.
Existing meeting actions and agent identities are unchanged.

The service passes `task:read`, `task:write`, or `task:delete` to the shared
`requireProjectRole` contract introduced by ND-130. The checklist's restrictive
RLS adapter delegates to `app.has_project_capability(text,text)` as soon as that
function exists. Before ND-130 is installed, the existing project-role policies
remain mandatory. After installation, role and capability restrictions both
apply. This allows either migration order without copying capability grants or
changing the shared capability implementation. The adapter returns false for
a null decision and does not swallow provider errors.

## API contract

- `GET /api/projects/{projectId}/todos`: items and effective edit/delete flags.
- `POST /api/projects/{projectId}/todos`: `{ content }`, 1–500 trimmed characters.
- `PATCH /api/projects/{projectId}/todos/{todoId}`: `{ revision, content }` or
  `{ revision, completed }` (boolean); one operation per request.
- `DELETE /api/projects/{projectId}/todos/{todoId}`: `{ revision }`.

Create/update responses return `{ todo }`; delete returns `{ todo: null }`.
Item revisions increase on each accepted update. A stale revision, missing
item, or item from another project returns the same `409` conflict without
exposing foreign item metadata. The client reloads the authorized checklist
after a conflict, retains the draft, and asks the user to review before retrying.
Transport/server failures also retain text. Successful writes use the existing
project activity/version mechanism; this feature does not add a realtime
transport or alter meeting-todo completion.

## Validation

`tests/e2e/project-checklist.spec.ts` covers capture, inline editing, failure
recovery, persisted completion/reopening, owner deletion, read-only UI, revoked
membership, foreign IDs, and desktop/mobile layout. The project-todo service and
route suites cover malformed input, authorization before persistence, actor
spoofing, and stale writes.

The standard PostgreSQL matrix calls `scripts/test-project-todo-rls.mjs`, which
tests absent/foreign/revoked actors, role ceilings, cross-project moves, and a
transactional capability-provider double installed after checklist migrations.
Run the repository validation baseline and RLS matrix as documented in
[local validation](local-validation.md) and [tenant isolation](rls-tenant-isolation.md).
