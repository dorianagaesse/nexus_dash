# Protected Preview Agent Access Diagnostics

Use this runbook when an agent credential appears `Active` in Project settings
but token exchange against a Vercel preview fails.

## Two Independent Authentication Layers

A protected preview has two gates:

1. Vercel deployment protection decides whether the request may reach the
   deployment.
2. NexusDash validates the project agent API key at
   `POST /api/auth/agent/token`.

The copied NexusDash env block configures the second layer only. It does not
bypass Vercel deployment protection.

## Correct NexusDash Authentication Schemes

Exchange the one-time raw API key with the canonical header:

```text
Authorization: ApiKey <raw-agent-api-key>
```

`x-agent-api-key: <raw-agent-api-key>` and a JSON `apiKey` body remain
compatibility alternatives.

Do not send the raw API key as `Authorization: Bearer`. `Bearer` is reserved for
the short-lived access token returned by a successful exchange.

## Preferred Protected-Preview Check

Vercel CLI can target a deployment and handle its protection layer. Keep the
raw key in an environment variable so it is not copied into shell history,
logs, issue comments, or PR descriptions.

```bash
npx vercel curl /api/auth/agent/token \
  --deployment https://your-preview.vercel.app \
  -- \
  --request POST \
  --header "Authorization: ApiKey ${NEXUSDASH_API_KEY}"
```

PowerShell:

```pwsh
npx vercel curl /api/auth/agent/token `
  --deployment https://your-preview.vercel.app `
  -- `
  --request POST `
  --header "Authorization: ApiKey $env:NEXUSDASH_API_KEY"
```

For non-interactive automation, pass the configured Vercel protection bypass
secret separately from the NexusDash API key:

```bash
npx vercel curl /api/auth/agent/token \
  --deployment https://your-preview.vercel.app \
  --protection-bypass "${VERCEL_AUTOMATION_BYPASS_SECRET}" \
  -- \
  --request POST \
  --header "Authorization: ApiKey ${NEXUSDASH_API_KEY}"
```

Never commit either secret or print command tracing that expands them.

## Distinguish Platform Interception From App Rejection

| Signal | Vercel protection intercepted | NexusDash rejected the key |
| --- | --- | --- |
| Status | Usually `401` | `401` |
| Content type | HTML | JSON |
| Body | Vercel `Authentication Required` page | `{"error":"invalid-api-key"}` |
| NexusDash request/audit evidence | No route or exchange event | App request reached token exchange; failed-attempt controls apply |
| Fix | Authenticate to/bypass preview protection | Use the current raw key, or rotate/recreate the credential |

Do not classify a response as `invalid-api-key` from the status code alone.
Inspect the response content type and body first.

## Diagnostic Sequence

1. Confirm the exact preview URL matches `NEXUSDASH_BASE_URL`.
2. Confirm Project settings shows the intended credential as `Active`.
3. Use `vercel curl` against `/api/health/live` to verify preview access.
4. Exchange the raw key with `Authorization: ApiKey`, not `Bearer`.
5. Confirm a successful JSON response includes `accessToken`, `projectId`,
   `expiresAt`, and `scopes`.
6. Call a scoped project route with
   `Authorization: Bearer <returned-access-token>`.
7. Check the owner-visible audit trail for `Token exchanged` and subsequent
   request use.

If Vercel returns HTML, fix preview access first. Rotating the NexusDash
credential cannot change a request that never reached the app.

If NexusDash returns JSON `invalid-api-key`, verify that the raw key belongs to
the displayed public ID and environment. Raw keys are shown once; an env file
can remain stale after rotation or revocation even though the UI correctly
shows the replacement credential as active.

## Rotation And Revocation Assertions

After rotating a credential:

- the old raw key must return NexusDash JSON `invalid-api-key`;
- the newly displayed raw key must exchange successfully;
- the credential public ID and audit trail should identify the current
  credential without exposing either secret.

After revocation:

- Project settings must show `Revoked`, not `Active`;
- the revoked raw key must return NexusDash JSON `invalid-api-key`;
- no new bearer token may be issued.

## Secret-Safe Evidence

Safe validation evidence includes:

- deployment URL;
- HTTP status and content type;
- app error code;
- credential label and public ID;
- NexusDash request ID or Vercel trace ID;
- audit action and timestamp.

Never record the raw API key, returned bearer token, protection bypass secret,
or full authorization headers.
