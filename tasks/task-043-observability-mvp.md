# TASK-043 Observability MVP

## Goal
Provide a production-friendly minimum observability baseline so issues are detected quickly and triaged with enough context.

## Scope
- Add health endpoints:
  - `GET /api/health/live` (process liveness)
  - `GET /api/health/ready` (runtime readiness + database connectivity)
- Add structured server logger utility and adopt it across server actions, services, and API route payload-validation logs.
- Add API request correlation via `x-request-id` middleware for all `/api/*` requests.
- Add automated tests for health route success/failure behavior.
- Document observability usage in `README.md`.

## Acceptance
- Health endpoints return explicit status payloads with no-store caching.
- Readiness returns `503` on database connectivity failure.
- Server-side logs are emitted as structured JSON through a shared logger helper.
- API responses include `x-request-id`.
- Test suite covers new health endpoints and passes quality gates.

## Definition of Done
- `npm run lint` passes.
- `npm test` passes.
- `npm run test:coverage` passes.
- `npm run build` passes.
- PR opened with green CI checks.
- Copilot review comments triaged and resolved.

