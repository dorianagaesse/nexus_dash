# Current Task: TASK-059 Agent Access Implementation - Scoped API Tokens, Rotation, and Audit Trail

Dedicated task brief: [`tasks/task-059-agent-access-implementation.md`](./task-059-agent-access-implementation.md)

## Task ID
TASK-059

## Status
In review

## Objective
Enable secure non-human access through owner-managed, project-scoped API credentials that exchange into short-lived bearer tokens, enforce explicit scopes in the service layer, and leave an auditable trail for issuance, use, rotation, and revocation.

## Why Now
- Agent access is the next major auth boundary after the human session, sharing, and RLS foundation landed.
- The project already has the right primitives in place: verified human sessions, project-role authorization, request IDs, and service-layer ownership of persistence.
- Deferring this further would keep automation use cases blocked while leaving the auth roadmap half-finished.

## Scope Snapshot
- Add Prisma persistence for API credentials, scope grants, and auth audit events.
- Add owner-only create, rotate, revoke, and list flows in the project settings surface.
- Add API-key exchange into short-lived signed bearer tokens.
- Support bearer-token access on the project, task, and context APIs in scope for v1.
- Record lifecycle and usage audit events with request metadata.

## Acceptance Snapshot
- Project owners can create labeled, project-scoped agent credentials with explicit scopes.
- Raw API keys are shown once only and are never stored in plaintext.
- Revoked, expired, or rotated-out credentials cannot exchange for new bearer tokens.
- Supported project/task/context routes enforce project and scope boundaries correctly for agent callers.
- Calendar routes and binary attachment parity remain out of scope for agent v1.

## Notes
- The dedicated task brief remains the detailed implementation contract and should stay in sync with the code on this branch.
- Tracking docs, validation evidence, PR state, Copilot review handling, and preview deployment evidence must be updated in the same branch before handoff.
- Review/deploy status: PR `#112` is open against `main`; Copilot completed its initial review with 3 comments, all of which were addressed and resolved; latest head checks are green; preview deploy run `23801489971` was dispatched from `feature/task-059-agent-access` with `git_ref=feature/task-059-agent-access`.

---

Last Updated: 2026-03-31
Assigned To: User + Agent
