# Current Task: TASK-224 Agent Roadmap Access

## Task ID
TASK-224

## Status
Completed on 2026-06-06 via PR #326.

## Source
- Execution queue task promoted on 2026-05-31.
- Agent access v1 currently supports project/task/context APIs, while roadmap
  APIs remain human-session-only.
- Roadmap v2 is now a core dashboard planning surface, so project planning
  agents need explicit scoped access instead of borrowing task scopes.

## Objective
Expand the project-scoped agent API contract so trusted agents can inspect and
manage project roadmap phases and events through dedicated roadmap scopes.

## Why This Matters
NexusDash agents are meant to participate in planning work, not only task
execution. Roadmap access must be explicit, least-privilege, auditable, and
documented so owners can grant planning capability without accidentally granting
task or context privileges.

## Current Behavior
- `ApiCredentialScope` supports project, task, and context scopes only.
- Agent token exchange validates and serializes only the current scope set.
- Roadmap API routes call `requireAuthenticatedApiUser`, which rejects bearer
  tokens and only accepts human sessions.
- `project-roadmap-service` enforces human project roles through
  `requireProjectRole`, with no `agentAccess` path.
- Hosted agent docs and OpenAPI omit roadmap endpoints.

## Architecture Direction
- Add dedicated roadmap scopes:
  - `roadmap:read` for roadmap phase/event listing.
  - `roadmap:write` for phase/event create, update, reorder, and move.
  - `roadmap:delete` for phase/event deletion.
- Keep project-scoped bearer tokens as the authentication mechanism; no new
  token type or unscoped agent surface.
- Reuse the existing route pattern from task/context APIs:
  `requireApiPrincipal`, `getAgentProjectAccessContext`, and
  `requireAgentProjectScopes`.
- Thread optional `agentAccess` into roadmap services so services continue to
  enforce authorization, not only route adapters.
- Keep roadmap mutations integrated with project activity version headers so
  dashboards continue to reconcile changes.
- Update credential UI, token exchange, onboarding copy, and OpenAPI in the
  same PR so the contract is discoverable and testable.

## Scope
- Add roadmap scope values to schema, runtime scope definitions, DB mapping,
  token validation, and credential UI.
- Add a Prisma migration for the `ApiCredentialScope` enum expansion.
- Convert roadmap API routes to accept human or agent principals.
- Enforce roadmap scopes in routes and roadmap services.
- Update hosted agent docs/OpenAPI with roadmap endpoints and schemas.
- Add route, service, token, and docs tests for roadmap scopes and bearer-token
  access.
- Mark TASK-263 complete now that PR #320 is merged.

## Out Of Scope
- Calendar agent access.
- Attachment binary parity beyond already-supported task/context routes.
- A separate managed realtime or MCP transport for agents.
- Changing human roadmap UI behavior beyond preserving existing responses and
  activity-version headers.

## Acceptance Criteria
1. Owners can create project agent credentials with `roadmap:read`,
   `roadmap:write`, and `roadmap:delete` scopes.
2. Agent bearer tokens preserve and validate the new roadmap scopes.
3. Agents with `roadmap:read` can list roadmap phases/events for their project.
4. Agents with `roadmap:write` can create/update phases and events, reorder
   phases/events, and move events.
5. Agents with `roadmap:delete` can delete phases/events; delete is not implied
   by read or write.
6. Agents without the required roadmap scope receive `403`, and agents scoped to
   another project receive `404`.
7. Human session behavior and existing roadmap UI/API responses remain
   compatible.
8. Hosted docs/OpenAPI advertise the roadmap contract and required scopes.

## Definition Of Done
- [x] Schema and migration include roadmap credential scopes.
- [x] Runtime scope definitions, credential UI, token exchange, and audit
      summaries handle the new scopes.
- [x] Roadmap routes and services enforce agent project/scope access.
- [x] Agent onboarding docs/OpenAPI include roadmap endpoints and examples.
- [x] Focused tests cover roadmap bearer access and scope denial.
- [x] `npm run lint`, `npm test`, `npm run test:coverage`, and `npm run build`
      pass.
- [x] A ready PR is opened and Copilot feedback is handled.

## Validation Evidence
- `npx prisma generate` passed through `npm ci` postinstall.
- Focused Vitest passed: 8 files / 40 tests.
- `npm run lint` passed.
- `npm test` passed with local validation env: 119 files passed, 2 skipped;
  889 tests passed, 2 skipped.
- `npm run test:coverage` passed with local validation env: 91.37%
  statements, 81.33% branches.
- `npm run build` passed with local validation env.
- `npm run db:migrate` passed against fresh local PostgreSQL on host port
  5433, applying the new enum migration successfully.
- PR #326 merged as `3d497c77a790a14e32c9cb20a85349d2e448239e`.
- Copilot review produced five test-contract comments; addressed in
  `f1f800c41498966acadd55940906acb1b99a2677` and resolved.
- GitHub checks passed after the review fix: `check-name`, `Quality Core
  (lint, test, coverage, build)`, `E2E Smoke (Playwright)`, and `Container
  Image (build + metadata artifact)`.
