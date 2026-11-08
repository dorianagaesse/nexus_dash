# Meeting Notes request contracts

`lib/meeting-note-contracts.ts` owns the shared JSON field coercions for the
collection POST and detail PATCH routes. Its parsers accept unknown input and
return either a transport error or typed parsed command data. Callers consume
the successful `data`; parsing does not narrow the original raw payload.
The module stays pure and has no service, database, Next.js, or Task-schema
dependency. This applies the [reviewed Task pilot approach](./task-pilot-review.md)
to the next bounded domain.

| Input concern | Preserved behavior |
| --- | --- |
| Create defaults | Missing or malformed object fields receive the existing empty string, null, or empty-array defaults; business validation remains in services. |
| Partial updates | Omitted fields stay absent. Explicit empty strings/arrays remain writes. Nonstring date/status values retain their existing null clear/reset semantics. |
| Participants and labels | Guest strings and object participants retain their coercion; labels retain string members. Service normalization still owns names, membership checks, and label policy. |
| Actions | Preserve optional ids/dates, omitted or invalid assignee as undefined, explicit null as clearing, and trimmed valid human, agent, or participant ids. Permissive nested object-member handling is unchanged. |
| Visibility | Omitted, null, and blank values stay absent. Private remains private; public/team aliases normalize to team. Invalid values retain their existing error code. |
| Rich content | Parsed strings reach the existing service normalization and sanitization unchanged. |

Both routes now reject non-object JSON with the existing
`400 { "error": "invalid-request-body" }` shape. This handles malformed
request roots, including the former create-side null exception; it does not
tighten the intentional create-field defaults.

Routes retain authentication before JSON parsing. PATCH retains content
precondition validation before JSON parsing and its existing field-shape
error precedence. Parsed commands include only known content fields; actor,
project, note, and revision identities still come from authenticated route
context and the content-precondition header. Services retain authorization,
business validation, private-note policy, persistence, and revision locking.
Response serialization, activity headers, ETags, and errors stay in the routes.

`tests/api/project-meeting-notes.route.test.ts` exercises these public seams,
including legacy nested inputs, true partial updates and explicit clears,
identity injection attempts, malformed bodies, and auth/revision precedence.
