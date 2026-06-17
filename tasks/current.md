# Current Task: TASK-315 Protected Preview Agent Diagnostics

## Task ID
TASK-315

## Status
Complete once PR #333 merges.

## Source
- GitHub issue #313: Investigate active agent credential returning
  `invalid-api-key` on preview token exchange.
- Follow-up reproduction confirmed the credential was valid and Vercel
  deployment protection intercepted direct requests before the app route.

## Objective
Document a deterministic, secret-safe way to distinguish Vercel preview
protection from NexusDash agent-key rejection and validate agent access against
protected previews with the correct authentication schemes.

## Root Cause
- A direct request to a protected preview can receive Vercel's HTML
  `401 Authentication Required` response before NexusDash handles the request.
- The raw agent API key must use `Authorization: ApiKey <key>`, the
  `x-agent-api-key` compatibility header, or the JSON body. `Bearer` is reserved
  for the short-lived token returned by a successful exchange.
- The copied agent env block configures NexusDash values; it does not bypass
  deployment-level Vercel protection.

## Acceptance Criteria
1. Preview validation docs explain how to identify a Vercel interception versus
   an app-owned JSON `invalid-api-key` response.
2. Protected-preview commands use `vercel curl` or an explicit protection
   bypass secret without exposing agent keys.
3. The raw-key exchange and returned bearer-token schemes are unambiguous.
4. Rotation/revocation validation still expects stale keys to fail with the
   app-owned JSON error.
5. The runbook includes audit/log signals and a concise troubleshooting
   decision tree.

## Definition Of Done
- [x] A dedicated protected-preview diagnostic runbook is added.
- [x] Existing agent preview validation and README references are updated.
- [x] Task tracking and journal evidence are current.
- [x] Documentation checks pass.
- [x] A ready-for-review PR is open and Copilot feedback is handled.
