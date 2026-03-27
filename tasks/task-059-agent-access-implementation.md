# Current Task: TASK-059 Agent Access Implementation - Scoped API Tokens, Rotation, and Audit Trail

## Task ID
TASK-059

## Status
Planned (first implementation brief)

## Objective
Enable secure non-human access through owner-managed, project-scoped API credentials that exchange into short-lived bearer tokens, enforce explicit scopes in the service layer, and leave an auditable trail for issuance, use, rotation, and revocation.

## Why This Task Matters
- NexusDash already has a strong human auth baseline, but agents still need a safe way to act on projects without borrowing a browser session or user cookie.
- The current codebase now has the right foundations for this work: verified human sessions, project-role authorization, RLS-backed service execution, request IDs, and a mature project/task/context surface.
- If agent access is added carelessly, it can punch through the same safety boundaries that recent auth, sharing, and RLS tasks worked to establish.

## Current Baseline Confirmed In Repo
- Interactive auth is database-session based; API routes currently authenticate humans through `requireAuthenticatedApiUser(...)` and pass a single `actorUserId` string into services.
- Protected persistence paths run through `withActorRlsContext(...)`, which currently sets only `app.user_id` for PostgreSQL RLS evaluation.
- Project authorization is enforced in `lib/services/**` via human membership/role checks such as `requireProjectRole(...)`.
- Attachment storage and direct-upload validation use `actorUserId` in object-key lineage (`v1/{actorUserId}/{projectId}/...`), so agent identity touches storage design, not just HTTP auth.
- Calendar access is user-scoped through stored Google OAuth credentials, which does not naturally map to non-human actors yet.
- Middleware already propagates `x-request-id`, giving us a solid base for auth audit correlation.

## Working Assumptions For The First Implementation
- Human browser auth remains unchanged: cookie-backed DB sessions stay the only interactive auth model.
- Agent auth ships as a separate bearer-token path and must not reuse or mint browser sessions.
- Credentials should be project-scoped in v1 so owners can reason about blast radius clearly from the project they are authorizing.
- Long-lived secrets are shown once, hashed at rest, and only used to obtain short-lived signed access tokens.
- Access tokens should be short-lived (target 5-15 minutes) and carry explicit scopes plus project constraints.
- Default-deny remains the rule: an agent must pass both credential validity checks and scope/project authorization checks.
- Initial agent rollout should focus on project/task/context APIs and defer calendar operations until delegated-calendar semantics are designed explicitly.
- Initial agent rollout should also defer binary attachment upload/download parity until storage-key ownership and uploader attribution rules are locked for non-human actors.

## Scope
- Add persistence for project-scoped API credentials, project/scope grants, and auth audit events.
- Add owner-managed create, rotate, revoke, and list flows for agent credentials.
- Add an API-key-to-access-token exchange endpoint that returns short-lived signed bearer tokens.
- Introduce a shared request-auth helper that can resolve either a human session or an agent bearer token into a consistent actor context.
- Enforce agent scopes on the supported project/task/context API routes and service entry points.
- Record audit events for credential lifecycle actions and meaningful token usage.
- Add automated coverage for credential lifecycle, scope allow/deny behavior, expiry, revocation, and cross-project isolation.

## Out of Scope
- Public third-party developer platform positioning, external docs, or API-versioning strategy.
- Calendar mutation/read support for agents while Google credentials remain user-owned OAuth assets.
- Direct file upload, direct-upload cleanup, and signed-download parity for agents in the first pass.
- Replacing the human session system or broadening SSR/server-action auth around agents.
- Organization-wide or multi-project credentials in the first pass.

## Acceptance Criteria
- A project owner can create an agent credential with an explicit label, bounded project access, and explicit scopes.
- The raw secret is displayed once at creation/rotation time and is never stored in plaintext.
- An active credential can exchange for a short-lived bearer token; revoked, expired, or rotated-out credentials cannot.
- Supported project/task/context API routes accept bearer tokens and enforce scope/project constraints correctly.
- Cross-project access is denied even when the credential owner is authorized elsewhere.
- Rotation and revocation are reflected immediately for future token exchanges, with short-lived token expiry limiting residual access.
- Audit data captures creation, rotation, revocation, token exchange, and request use with enough metadata to investigate misuse.
- Human session behavior and existing project-sharing flows continue to work unchanged.
- Local validation baseline passes, with any environment blockers documented.

## Recommended First-Cut Design
1. Keep credentials project-scoped in v1.
2. Model one long-lived credential record plus explicit per-scope grants rather than encoding everything into one opaque blob.
3. Exchange the long-lived secret at a dedicated auth endpoint for a short-lived signed access token.
4. Resolve bearer tokens into an actor context shaped for services, for example:
   - `kind: "agent"`
   - `credentialId`
   - `projectId`
   - `ownerUserId`
   - `scopes`
   - `requestId`
5. Add agent-aware authorization helpers for supported APIs instead of trying to force agent behavior through the exact same human-role checks.
6. Reuse existing project/task/context routes where safe, but only after a shared auth layer can distinguish human versus agent callers cleanly.

## Key Design Tension To Solve Before Coding Deeply
- Current service authorization is human-role oriented:
  - `viewer` = read-only
  - `editor` = mutate most content but not delete
  - `owner` = full control
- TASK-085 already notes a different intended agent behavior:
  - owner agent = full CRUD
  - contributor agent = full CRUD except project deletion
- Because of that mismatch, simply pretending an agent is a human `editor` will under-authorize deletes, while pretending it is an `owner` will over-authorize project-level actions.
- The safest path is to make agent authorization explicit at the auth/service boundary rather than relying on human membership-role equivalence.

## Proposed Implementation Plan
1. Define the v1 agent surface and scope taxonomy before touching route code.
2. Add Prisma models + migration for credentials, scope grants, and audit events.
3. Add credential secret generation, hashing, verification, rotation, and revocation services.
4. Add token signing/verification utilities plus required server env validation for the signing secret.
5. Introduce a principal-resolution helper for API routes that can authenticate either a human session or an agent bearer token.
6. Add agent-aware authorization helpers for the first supported project/task/context endpoints.
7. Add owner-facing management UI in the project owner surface so credentials stay visibly project-scoped.
8. Add regression coverage across auth helpers, services, and selected API routes.

## Candidate Scope Taxonomy For V1
- `project:read`
- `task:read`
- `task:write`
- `task:delete`
- `context:read`
- `context:write`
- `context:delete`

Notes:
- Keep delete scopes explicit instead of folding them into generic write access.
- Do not include `calendar:*` or attachment-binary scopes in v1.
- If project metadata mutation is needed later, add a dedicated `project:write` scope instead of inheriting it accidentally.

## Likely File Ownership / Touch Points
- `prisma/schema.prisma`
- `prisma/migrations/*`
- `lib/env.server.ts`
- `lib/auth/api-guard.ts` or a new adjacent principal-auth module
- `lib/services/project-access-service.ts`
- `lib/services/rls-context.ts`
- Selected `app/api/projects/**` routes
- Project owner settings UI under `components/project-dashboard/**`
- New tests under `tests/lib/**` and `tests/api/**`

## Future Concerns And Follow-Up Paths
### 1. RLS identity model
- Fastest v1 path: resolve an agent to an owning user for DB visibility, then enforce agent scopes before service actions.
- Risk: if any path accidentally skips agent-specific checks and relies only on human role gates, the owner-backed RLS subject can over-authorize requests.
- Future path: extend DB actor context beyond `app.user_id` if true first-class non-human DB principals become necessary.

### 2. Attachment/storage parity
- Current storage keys encode `actorUserId`, and direct-upload finalize/cleanup paths validate that lineage.
- Future path A: give each credential a stable synthetic uploader identity.
- Future path B: store agent uploads under owner lineage but record credential attribution separately.
- Defer this until core token auth is proven.

### 3. Calendar semantics
- Current Google Calendar credentials are user-scoped and OAuth-derived.
- Future path: explicit delegated-user execution model or project-owned integration credential, but not an implicit carry-over from human auth.

### 4. Audit retention and UX
- Basic write-on-event audit is enough for v1, but later work may need filtering, retention policy, and an owner-facing audit viewer.

### 5. Public API trajectory
- This task should create a safe internal/private agent boundary first.
- If a broader public API follows later, build versioning and external documentation on top of the scoped-token model rather than stretching the first implementation prematurely.

## Validation Plan
- `npm run lint`
- `npm test`
- `npm run test:coverage`
- `npm run build`
- `npm run test:e2e` if the supported API/UI management surface expands enough to justify it and local PostgreSQL is available

---

Last Updated: 2026-03-27
Assigned To: User + Agent
