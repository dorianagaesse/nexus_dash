# Conditional content edits

ND-565 is the additive server foundation for the ND-432 autosave contract.
It does not enable Live, require headers from existing clients, publish agent
v2, or retire v1.

## Browser and agent contract

Task and context-card single-record GET/PATCH routes return `contentRevision`
and `ETag`. Meeting-note routes expose the same
contract to authenticated humans. List and mutation representations carry the
revision so clients can retain the base they edited.

Authoring responses explicitly disable browser and CDN storage. Vercel still
re-evaluates standard `If-Match` against a successful response's advanced ETag,
producing a platform 412 after an accepted database write. Use
`X-Content-If-Match` for content writes. Standard `If-Match` fails with HTTP 400
`edit-precondition-transport` before mutation, including when both headers
are supplied. The deployed Preview probe verifies accepted writes and JSON
conflict responses.

Use the exact ETag in the next PATCH's `X-Content-If-Match` header. For example, a task
ETag is `"task:<entity-id>:<revision>"`. Meeting and context prefixes are
`meeting-note` and `context-card`. Send only the changed fields. Meeting-note
participants/todos and context-card fields are preserved when omitted; explicit
empty arrays clear a supplied collection.

- Missing header: accepted during this additive compatibility release.
- Invalid, weak, wildcard, multi-value, or wrong-entity header: HTTP 400,
  `edit-precondition-invalid`.
- Stale revision: HTTP 412, `edit-conflict`, `contentRevision`, and the latest
  authorized entity in `current`; the response ETag identifies that entity's
  current content revision. The stale payload and mutation side effects are
  not applied.
- Deleted or inaccessible record: normal project authorization/not-found
  behavior. Preserve the browser recovery copy for copy-out.

Explicit Save and a future Live adapter use this same conditional PATCH path.
The client may rebase disjoint fields or ask the user to choose between local
and latest values, then submit against the newly reviewed ETag. It must never
retry an overlapping edit without a precondition.

## Persistence and concurrency

Services authorize the project before locking the requested aggregate with
`SELECT ... FOR UPDATE`. The revision comparison, representation read, content
mutation, and normal transactional side effects share the actor RLS
transaction. Guarded edits force a transaction even in local configurations
that normally disable actor RLS contexts.

PostgreSQL invoker triggers own revision advancement. They cover legacy writes,
scalar commands and owner offboarding functions as well as service PATCHes.
Task relations and meeting participant/todo writes advance their parent
aggregate. Task comments, attachments, and timestamp/attribution-only parent
updates do not change the authoring revision. A content no-op retains its
revision. Nested writes advance each affected aggregate once per transaction;
the transaction-local marker uses one bounded JSON setting rather than a new
configuration key for every entity. Triggers retain forced RLS and do not
grant another project's content visibility or mutation rights.

## Release gates

The remaining ND-433/ND-434 work owns client integration, required browser and
negotiated agent v2 preconditions, the announced v1 sunset, durable coalesced
side effects, and measured latency/load gates. Live flags remain off until
those gates pass. Existing browser forms and v1 clients remain compatible
through this foundation release.

Validation uses the normal repository checks, the real PostgreSQL isolation
matrix, and `tests/e2e/nd-565-content-revisions.spec.ts` against an isolated
database. The browser probe checks simultaneous task saves, stale rejection
without activity growth, comment revision stability, legacy writes, partial
meeting updates, todo invalidation, and conditional context edits. Preview
validation follows [the workflow runbook](github-actions-workflows.md).
