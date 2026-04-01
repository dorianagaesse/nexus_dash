# Current Task: TASK-115 Agent Onboarding v1 - Hosted Docs, OpenAPI Surface, and In-App Setup UX

Dedicated task brief: [`tasks/task-115-agent-onboarding-v1.md`](./task-115-agent-onboarding-v1.md)

## Task ID
TASK-115

## Status
In progress

## Objective
Make NexusDash's agent-facing surface discoverable without repository access by
shipping hosted agent docs, a machine-readable OpenAPI contract for the
supported agent API, and in-app onboarding UX that helps humans provision
project-scoped credentials and hand the right setup information to external
agents.

## Why Now
- TASK-059 established the core security model for project-scoped agent access,
  but the product still lacks a usable entry point for real external agent
  adoption.
- Users should not need to clone the repository just to understand how an agent
  can authenticate and operate safely inside NexusDash.
- Locking a narrow, versioned onboarding surface now will keep the private agent
  boundary explicit before any future MCP/public-platform work expands the
  integration story.

## Scope Snapshot
- Add a hosted human-readable agent onboarding surface that explains auth flow,
  scopes, supported routes, errors, and common workflows.
- Add a machine-readable OpenAPI description for the stable agent-facing API v1
  only.
- Add account-level developer onboarding entry points so users can find the docs
  and integration contract from within the product.
- Extend project-level agent access UI with copy-friendly project-specific
  bootstrap details.
- Keep docs and onboarding aligned with the already-supported
  project/task/context agent surface and explicitly document what remains
  unsupported.

## Acceptance Snapshot
- A signed-in user can find agent integration guidance from account settings
  without leaving the app or opening the repo.
- A project owner can retrieve project-specific onboarding details alongside
  agent credential management.
- NexusDash exposes a versioned OpenAPI contract for the currently supported
  agent API v1 surface.
- Hosted docs clearly explain the exchange flow, bearer-token usage, scopes,
  supported operations, and unsupported areas.
- The onboarding UX stays aligned with current product styling and does not
  over-promise unsupported agent capabilities.

## Notes
- This task is intentionally layered on top of TASK-059 and should preserve its
  auth, scope, and runtime boundaries rather than redesigning them.
- Scope discipline matters: document only the stable agent-ready v1 API surface
  (token exchange, project read, task operations, context-card operations).
- MCP is intentionally out of scope for this task; ship a strong hosted
  docs/OpenAPI/onboarding baseline first.

---

Last Updated: 2026-04-01
Assigned To: Agent
