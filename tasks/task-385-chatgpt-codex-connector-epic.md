# TASK-385 ChatGPT and Codex Connector Epic

## Status

Pending (non-executable Epic split into TASK-386 through TASK-405).

## Objective

Allow an authenticated user to discover and operate their authorized NexusDash
projects from ChatGPT and supported Codex surfaces, including a new mobile
conversation, without depending on a local computer or manually supplying an
`.env` file.

The initial integration uses a remotely hosted NexusDash MCP server protected
by OAuth 2.1 and packaged as a private plugin. Account, workspace, and client
availability must be confirmed by TASK-386 before implementation assumptions
are locked.

## Expected User Outcomes

From a supported ChatGPT or Codex surface, an authenticated user can:

- find and read authorized projects, Epics, tasks, comments, context cards,
  and roadmap data;
- filter tasks by project, Epic, label, status, or text;
- create and partially update a task;
- move a task to another status;
- add a task comment;
- reconnect from a new conversation without a local configuration file; and
- retain the same effective permissions enforced by NexusDash.

The existing Agent REST API remains supported and regression-tested.

## Architecture Principles

- Keep the existing Agent REST API and reuse the same internal application
  services and authorization rules from both transports.
- Expose a stable public HTTPS MCP endpoint, preferably `/mcp`, using
  Streamable HTTP.
- Protect private data and actions with OAuth 2.1 Authorization Code + PKCE,
  short-lived access tokens, and revocable rotating refresh tokens.
- Keep the MCP tool endpoint disabled by default and fail closed when OAuth
  enforcement or required metadata is absent, invalid, or misconfigured; no
  unauthenticated implementation window may expose tool discovery or calls.
- Publish the protected-resource and authorization-server metadata required by
  MCP clients, including correct `resource` propagation and a supported client
  registration strategy.
- Never embed a NexusDash API key or another static user secret in the plugin.
- Separate read and write tools and expose no permanent-delete tool in v1.
- Issue only the OAuth scopes required by the v1 tool catalog; context-card and
  roadmap write scopes remain unavailable until corresponding tools and
  authorization coverage are separately approved.
- Authorize account-level `list_projects` through a distinct project-discovery
  capability that returns only memberships visible to the current user;
  require project-bound scopes again for every project-specific operation.
- Return concise, structured, paginated, model-readable results.
- Annotate tool behavior, including read-only, destructive, and idempotent
  characteristics, and require a server-validated, short-lived confirmation
  intent for writes classified as sensitive rather than relying only on client
  prompt behavior.
- Treat relation changes as explicit additions or removals that preserve
  unmentioned links; any complete replacement operation must be separately
  named, preview its effect, and require confirmation.
- Keep the transport compatible with the selected serverless deployment model
  and prevent sensitive data from entering logs or metrics.

## Initial Tool Catalog

- `list_projects`
- `get_project_summary`
- `list_epics`
- `search_tasks`
- `list_tasks`
- `get_task`
- `list_task_comments`
- `create_task`
- `update_task`
- `move_task`
- `add_task_comment`
- `list_context_cards`
- `get_roadmap`

## Out Of Scope For V1

- Public marketplace publication.
- A custom MCP user interface.
- Permanent deletion of a task, context card, or other resource.
- Replacement or removal of the Agent REST API.
- AI services that are not compatible with the selected MCP/plugin contract.
- Autonomous mutations without an explicit user request or appropriate
  confirmation.

## Acceptance Criteria

1. A stable MCP server is reachable over public HTTPS and protected by the
   selected OAuth 2.1 flow.
2. The MCP tool endpoint stays disabled or rejects access before OAuth
   enforcement is active and fails closed for missing or invalid auth config.
3. No static NexusDash user secret is sent to or stored in ChatGPT or Codex.
4. NexusDash project membership, role, and capability checks apply to every
   tool call and prevent cross-project or cross-user access.
5. The initial read and write tools work from the confirmed ChatGPT surfaces
   and any confirmed Codex surfaces.
6. Subject to TASK-386 availability findings, the owner can install and use the
   private plugin on supported web, desktop, and mobile clients.
7. A new conversation can rediscover the connected NexusDash tools without a
   local machine or local `.env` file.
8. Sensitive writes present an accurate confirmation naming the resource and
   operation and cannot execute without a server-validated intent bound to the
   user, tool, resource, and proposed change.
9. No permanent-delete tool is discoverable or callable in v1.
10. The Agent REST API and its regression suite continue to pass.
11. Preview validation covers transport, OAuth, authorization, schemas, tool
    selection, confirmations, audit output, and REST non-regression before
    production deployment.
12. Calls, authorization refusals, and failures are observable without logging
    tokens, secrets, or unnecessarily sensitive content.
13. Revocation, disconnect, rollback, diagnostics, and emergency disablement
    procedures are documented and exercised.

## Runtime Assumptions

- Local and CI validation have a reachable PostgreSQL database that satisfies
  the repository's migration and runtime-role contract in
  [`docs/runbooks/local-validation.md`](../docs/runbooks/local-validation.md)
  and
  [`docs/runbooks/database-connection-hardening.md`](../docs/runbooks/database-connection-hardening.md).
- Preview and production retain separate database, OAuth, signing, encryption,
  and plugin credentials. Required server variables and secrets are declared
  through `lib/env.server.ts` and documented without values in
  [`docs/runbooks/vercel-env-contract-and-secrets.md`](../docs/runbooks/vercel-env-contract-and-secrets.md).
- TASK-387 decides whether MCP request handling is stateless or uses durable
  session state and verifies that the selected design fits the Vercel runtime.
- TASK-395 reuses the existing NexusDash user identity only where the ADR shows
  that login, consent, token issuance, refresh, revocation, and audit semantics
  remain safe and explicit.
- Public preview and production origins can expose stable HTTPS MCP, OAuth
  metadata, authorization, callback, revocation, health, and diagnostic paths.
- TASK-386 is the authority for which ChatGPT and Codex clients can be included
  in acceptance at validation time; an unavailable or policy-disabled surface
  is documented rather than silently assumed.
- The Agent REST API remains enabled throughout delivery and is validated from
  the same branch and environment as the MCP connector.

## Validation And Evidence Contract

- Run the repository baseline from `agent.md`: lint, RLS inventory, unit/API
  tests, coverage, and production build; add the real PostgreSQL RLS matrix
  whenever models, migrations, runtime roles, or tenant policies change.
- Add focused automated evidence for MCP initialization/discovery, every tool
  schema and handler, OAuth metadata and PKCE, token expiry/refresh/revocation,
  capability enforcement, confirmations, redaction, pagination, and Agent REST
  non-regression.
- Use synthetic or sanitized fixtures for evaluations and stored validation
  artifacts. Redact sensitive arguments, results, content, and identifiers;
  retain only the minimum evidence and duration defined before evaluation by
  TASK-397 and operationalized by the connector runbook in TASK-405.
- Trigger the explicit branch through `deploy-vercel.yml` using `git_ref`, then
  retain the workflow run, checked-out ref and revision, immutable preview URL,
  environment/database identity, and artifact evidence described by
  [`docs/runbooks/github-actions-workflows.md`](../docs/runbooks/github-actions-workflows.md).
- Validate the immutable preview endpoint with MCP Inspector before connecting
  the private plugin, then execute the TASK-401 evaluation suite and the
  supported-client journeys recorded by TASK-386.
- Exercise authorization failure, disconnect, compromised-session revocation,
  credential rotation, rollback, and emergency disablement without recording
  raw tokens or secrets. Reuse the safe preview-access evidence practices in
  [`docs/runbooks/protected-preview-agent-access.md`](../docs/runbooks/protected-preview-agent-access.md).
- Record final validation outcomes, residual client/rollout limitations,
  production smoke evidence, and rollback readiness in the task briefs,
  journal, and connector operations runbook before closing the Epic.

## Definition Of Done

- TASK-386 records the supported account, workspace, ChatGPT, and Codex
  surfaces in a dated evidence report and any rollout limitations that
  constrain acceptance.
- The architecture ADR, tool catalog, security policy, OAuth/scopes model, and
  shared-service boundaries are approved and represented by executable tasks.
- The remote MCP server, read/write tools, OAuth flow, authorization mapping,
  annotations, confirmations, security controls, audit, and observability meet
  the Epic acceptance criteria.
- The private plugin and NexusDash skill are versioned for preview and
  production without embedded static user credentials or permanent-delete
  tools.
- Automated tests, agent evaluations, preview validation, and supported-client
  journeys pass without regressing the Agent REST API.
- The production-readiness runbook covers and exercises revocation, disconnect,
  rollback, diagnostics, credential isolation, and emergency disablement before
  production rollout; the final production smoke test passes.
- TASK-386 through TASK-405 are complete and `tasks/current.md`, the backlog,
  journal, ADR index, product documentation, and relevant runbooks reflect the
  delivered system.

## Delivery Tasks

| Source item | NexusDash task | Outcome |
| --- | --- | --- |
| ND-MCP-00 | TASK-386 | Confirm account, workspace, and client availability. |
| ND-MCP-01 | TASK-387 | Record the technical architecture and deployment model. |
| ND-MCP-02 | TASK-388 | Define the initial MCP tool contracts, including project and comment discovery. |
| ND-MCP-03 | TASK-389 | Define tool security and confirmation policy. |
| ND-MCP-04 | TASK-390 | Consolidate shared REST/MCP application services. |
| ND-MCP-05 | TASK-391 | Build the Streamable HTTP MCP server. |
| ND-MCP-06 | TASK-392 | Implement read tools. |
| ND-MCP-07 | TASK-393 | Implement write tools. |
| ND-MCP-08 | TASK-394 | Add annotations and confirmation behavior. |
| ND-MCP-09 | TASK-395 | Implement OAuth 2.1 for MCP. |
| ND-MCP-10 | TASK-396 | Map OAuth scopes to NexusDash permissions. |
| ND-MCP-11 | TASK-397 | Add security controls, quotas, audit, and metrics. |
| ND-MCP-12 | TASK-398 | Create the NexusDash plugin skill. |
| ND-MCP-13 | TASK-399 | Package the private plugin. |
| ND-MCP-14 | TASK-400 | Add automated integration and regression coverage. |
| ND-MCP-15 | TASK-401 | Build the agent evaluation suite. |
| ND-MCP-16 | TASK-402 | Deploy and validate the complete preview path. |
| ND-MCP-17 | TASK-403 | Validate supported web, desktop, and mobile journeys. |
| ND-MCP-18 | TASK-404 | Complete production security and deployment gates. |
| ND-MCP-19 | TASK-405 | Prepare and exercise the production-readiness and operations runbook. |

## Official Product References

- [Build an MCP server](https://developers.openai.com/plugins/concepts/mcp-server)
- [Plugin authentication](https://developers.openai.com/plugins/build/auth)
- [Connect and test a plugin](https://developers.openai.com/plugins/deploy/connect-chatgpt)
- [Plugins in ChatGPT and Codex](https://learn.chatgpt.com/docs/plugins)
