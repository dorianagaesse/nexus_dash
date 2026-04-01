# TASK-115 Agent Onboarding v1 - Hosted Docs, OpenAPI Surface, and In-App Setup UX

## Task ID
TASK-115

## Status
In progress

## Objective
Make NexusDash's agent-facing surface discoverable without repository access by
shipping hosted docs, a machine-readable OpenAPI contract, and in-app onboarding
UX that helps users provision project-scoped credentials and hand the right
setup details to external agents.

## Why This Task Matters
- TASK-059 established a secure project-scoped agent auth model, but users still
  have no first-class way to understand how to integrate an external agent with
  NexusDash.
- Asking users or agent operators to clone the repository just to read a task
  brief or search routes is not a sustainable product experience.
- The product now needs an explicit "agent onboarding" layer that teaches the
  current supported surface without stretching into unsupported areas like
  calendar execution, binary attachment parity, or MCP.

## Current Baseline Confirmed In Repo
- Project owners can already create, rotate, revoke, and inspect project-scoped
  agent credentials from the project owner surface.
- Agent callers can exchange a long-lived API key at
  `POST /api/auth/agent/token` into a short-lived bearer token and then access
  supported project/task/context endpoints based on granted scopes.
- The current agent-facing surface is private and product-internal; there is no
  hosted OpenAPI spec, no in-app integration guide, and no dedicated external
  onboarding route yet.
- Account settings exist and already host user-level operational settings such
  as Google Calendar connection management.

## Working Assumptions For This Task
- The existing TASK-059 security model remains the source of truth:
  project-scoped credentials, short-lived bearer tokens, explicit scopes, and
  owner-only credential management.
- Agent onboarding should be discoverable from within the product, without
  repository access.
- The first delivered contract should stay narrow and private: document only the
  routes that are already safe and supported for agent callers.
- A human-readable guide and a machine-readable contract should ship together.
- MCP remains intentionally out of scope for now; this task should make a future
  MCP layer easier, not attempt to implement it.

## Scope
- Add a hosted agent-onboarding documentation surface in the app.
- Add a versioned OpenAPI v1 contract for the supported agent API surface.
- Add account-level developer onboarding entry points that explain agent auth,
  scopes, supported operations, and where to find the machine-readable contract.
- Extend the project owner agent-access panel with project-specific quickstart
  details and copy-friendly environment/bootstrap guidance.
- Add regression coverage for the new docs/onboarding rendering and any API docs
  route(s) introduced by the task.

## Out of Scope
- MCP server implementation or MCP registry publishing.
- Broad public developer platform positioning or general-public API guarantees.
- Agent support for Google Calendar APIs.
- Agent support for binary attachment upload/download parity.
- Reworking the underlying agent token, credential, or scope model.
- Generating SDKs in this first pass.

## Acceptance Criteria
- A signed-in user can find agent integration guidance from account settings.
- A project owner can find project-scoped onboarding help directly from the
  agent-access owner surface.
- NexusDash exposes a versioned OpenAPI contract for the stable agent API v1
  surface.
- Hosted docs clearly explain:
  - how to use the API key exchange flow
  - how bearer tokens are used afterward
  - what scopes exist and what they permit
  - which endpoints are supported in v1
  - what remains unsupported by design
- Project-specific onboarding includes a copy-friendly env/bootstrap example
  that references the right base URL, docs URL, OpenAPI URL, and project ID.
- The UI stays aligned with the existing account/settings and project owner
  styling.

## Proposed Product Shape
### 1. Account-level developer entry
- Add a user-facing "Developers" section under `/account/settings`.
- This surface should answer:
  - what agent access is
  - how auth works
  - how scopes work
  - where the OpenAPI spec lives
  - where project-scoped credentials are managed

### 2. Project-level onboarding help
- Extend the existing project owner agent-access panel so it includes:
  - a quickstart summary
  - the current project ID
  - a copy-friendly env example
  - links to hosted docs and OpenAPI
  - reminder text that credentials are project-scoped and owner-managed

### 3. Hosted docs + OpenAPI
- Add a hosted docs route such as `/docs/agent/v1`.
- Add a machine-readable route such as `/api/docs/agent/v1/openapi.json`.
- Keep the docs/UI route readable for humans and the JSON route stable for
  tools.

## OpenAPI v1 Surface To Cover
- `POST /api/auth/agent/token`
- `GET /api/projects/{projectId}`
- `GET /api/projects/{projectId}/tasks`
- `POST /api/projects/{projectId}/tasks`
- `PATCH /api/projects/{projectId}/tasks/{taskId}`
- `POST /api/projects/{projectId}/tasks/reorder`
- `POST /api/projects/{projectId}/tasks/{taskId}/archive`
- `DELETE /api/projects/{projectId}/tasks/{taskId}/archive`
- `DELETE /api/projects/{projectId}/tasks/{taskId}`
- `GET /api/projects/{projectId}/context-cards`
- `POST /api/projects/{projectId}/context-cards`
- `PATCH /api/projects/{projectId}/context-cards/{cardId}`
- `DELETE /api/projects/{projectId}/context-cards/{cardId}`

Notes:
- Document auth headers, common error responses, and scope requirements.
- Be explicit that owner-only credential-management routes are product UX/admin
  surfaces, not part of the agent execution contract.

## Key Design Tensions
### 1. Human docs vs machine contract
- Markdown/prose alone is not enough for tool import.
- OpenAPI alone is not enough to teach users the product semantics.
- The task should ship both, with one clear source of truth for each purpose.

### 2. Versioning discipline
- The first hosted agent surface should be explicitly versioned.
- Avoid exposing unstable internal routes or broad "all app API" claims.

### 3. Scope clarity
- The docs must make permission boundaries explicit so users do not assume that
  "agent access" means full product automation.

## Likely Touch Points
- `app/account/settings/**`
- `components/account/**`
- `components/project-dashboard/project-dashboard-owner-agent-access-panel.tsx`
- `app/docs/**` or similar docs route
- `app/api/docs/**` or similar OpenAPI route
- Supporting helpers under `lib/**`
- Tests under `tests/app/**`, `tests/components/**`, and `tests/api/**`

## Validation Plan
- Local prerequisite: TASK-059 branch state must be the base for this task so
  the agent-access routes and UI already exist.
- Runtime prerequisite: docs/examples must derive URLs from safe runtime config
  or request context rather than hard-coded deployment assumptions.
- Deploy prerequisite: preview deploy must run from
  `feature/task-115-agent-onboarding` once the branch is ready.
- `npm run lint`
- `npm test`
- `npm run test:coverage`
- `npm run build`
- `npm run test:e2e` if the onboarding UX materially changes authenticated
  settings/project flows enough to justify smoke coverage and local PostgreSQL is
  available

---

Last Updated: 2026-04-01
Assigned To: User + Agent
