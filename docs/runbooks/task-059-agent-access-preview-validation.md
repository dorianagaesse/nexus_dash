# TASK-059 Preview Validation Runbook

This runbook validates project-scoped agent access end to end on a protected
preview deployment.

## Goal

Confirm that preview is healthy, owners can manage credentials, agents can
exchange keys into bearer tokens, scoped routes behave correctly, audit events
are recorded, and rotation/revocation take effect immediately for new exchanges.

## Preconditions

- Target preview deployment is live for `feature/task-059-agent-access`.
- If preview protection is enabled, use `vercel curl` for scripted checks.
- Use a disposable project owned by a disposable verified user, or a dedicated
  non-production owner account.
- Keep validation data isolated and delete it after the run.
- If preview boot previously failed with `500`, confirm
  `AGENT_TOKEN_SIGNING_SECRET` reached the preview runtime before continuing.

## Required Assertions

1. Preview boot
   - `GET /` returns `200`.
   - `GET /api/health/live` returns `200` with `status: "ok"`.

2. Owner-managed credential creation
   - Owner can create a project credential with explicit scopes.
   - Response shows the raw API key once.
   - Owner summary lists the new credential as `active`.

3. Token exchange
   - `POST /api/auth/agent/token` with the raw API key returns `200`.
   - Response includes bearer token, `projectId`, `expiresAt`, and scopes.

4. Project read scope
   - `GET /api/projects/:projectId` with the bearer token returns `200`.

5. Task scope enforcement
   - `POST /api/projects/:projectId/tasks` with `task:write` returns `201`.
   - `GET /api/projects/:projectId/tasks` with `task:read` returns `200`.
   - `PATCH /api/projects/:projectId/tasks/:taskId` with `task:write` returns
     `200`.
   - `DELETE /api/projects/:projectId/tasks/:taskId` without `task:delete`
     returns `403`.

6. Context scope enforcement
   - `POST /api/projects/:projectId/context-cards` with `context:write`
     returns `201`.
   - `GET /api/projects/:projectId/context-cards` with `context:read` returns
     `200`.
   - `PATCH /api/projects/:projectId/context-cards/:cardId` with
     `context:write` returns `200`.
   - `DELETE /api/projects/:projectId/context-cards/:cardId` without
     `context:delete` returns `403`.

7. Audit visibility
   - Owner `GET /api/projects/:projectId/agent-access` returns `200`.
   - Recent events include at least `token_exchanged` and `request_used`.
   - Credential metadata reflects `lastExchangedAt` and `lastUsedAt`.

8. Rotation
   - Owner `POST /api/projects/:projectId/agent-access/:credentialId/rotate`
     returns `200` and a new raw API key.
   - Old API key exchange returns `401 invalid-api-key`.
   - New API key exchange returns `200`.

9. Revocation
   - Owner `DELETE /api/projects/:projectId/agent-access/:credentialId`
     returns `200`.
   - Revoked API key exchange returns `401 invalid-api-key`.

10. Cleanup
    - Delete the disposable project and disposable owner user/session.
    - Confirm no validation-only credentials or data remain in preview.

## Recommended Execution Notes

- Prefer explicit request IDs on scripted calls so Vercel logs can be filtered
- For a one-off local/manual validation helper, keep the script in
  `/tmp/agent-access-smoke.ps1` or `/tmp/agent-access-smoke.sh`; `/tmp/` is
  already gitignored in this repo.
- If the smoke helper becomes part of the team's recurring validation flow,
  promote it out of `/tmp/` into a versioned shared location such as
  `scripts/manual/` and document its inputs in this runbook.
  quickly if any assertion fails.
- Use credential labels prefixed with `preview-validation-` so audit and cleanup
  are easy to trace.
- Use a valid context-card color from `lib/context-card-colors.ts` for scripted
  context-card creation. `#DFF3F9` is a known-good sample.
- When scripted requests run against protected preview, prefer:

```bash
npx vercel curl /api/health/live --deployment <preview-url>
```

- For JSON routes, send request bodies with `curl --data-binary @file.json` to
  avoid shell escaping mistakes.

## Cleanup Notes

- Delete disposable preview users whose emails match
  `task059-preview-*@nexusdash.local`; the schema's cascades remove their
  sessions, project-owned records, and agent credentials created for validation.
- Remove any locally pulled preview env files and JSON artifacts after sign-off.

## Sign-Off Rule

TASK-059 is ready to merge only when all assertions above pass on the deployed
preview and cleanup is complete.
