# Portable agent identities

Project Settings → Agent access opens the identity list. An owner creates an
identity (for example **Oscar**, role label **Orchestrator**), chooses scopes,
and separately grants **Allow moving tasks to Done**. Labels grant no access.
An identity's ID is permanent. Use that ID for assignments and mentions.

## Pair each authorized device once

1. Select the identity and expand **Authorize a device**. Name the laptop or
   runtime and choose its maximum scopes and Done permission. A device cannot
   receive permissions the identity does not have.
2. Generate a pairing code. It expires in ten minutes and works exactly once.
3. In your own terminal, from a checkout containing the helper, run:

   ```sh
   node scripts/nd-agent.mjs login --project PROJECT_ID --identity IDENTITY_ID
   ```

4. Paste the code at the hidden prompt. The helper exchanges it and stores the
   resulting device credential in the OS vault. Do not give the code to the AI.
5. Repeat on another laptop, selecting the **same identity** and authorizing a
   separate device. Do not create another Oscar.

The supported vaults are Windows DPAPI (user-bound encrypted files under
`~/.nexusdash/vault`), macOS Keychain, and Linux Secret Service through
`secret-tool`. An unavailable or locked vault fails closed; there is no plaintext
fallback. Device authorization expires after 90 days. Revoke and pair again to
replace an expired or lost device credential. The raw credential is never
printed, passed in process arguments, placed in the child environment, or
written into the checkout.

Use `--base https://your-instance.example` for a different instance, on both
login and run. The default is `https://nexus-dash.app`. HTTP is accepted only on
localhost for development. Origin, project ID and identity ID form an exact
vault binding; the helper never searches for an alternative credential.

## Launch and work

```sh
node scripts/nd-agent.mjs run --project PROJECT_ID --identity IDENTITY_ID -- codex
```

The final command must be an executable. On Windows, for npm-installed clients
whose command is a `.cmd` shim, pass `node` followed by that client's JavaScript
entrypoint. Arguments after `--` are passed literally without shell evaluation.

Each launch creates a distinct session, even on the same laptop. The parent
helper holds the device proof and short-lived bearer token. The child gets only
a random local session capability and `ND_AGENT_*` binding information. Inside
the launched client, make project requests through the helper:

```sh
node scripts/nd-agent.mjs request GET /api/projects/PROJECT_ID/tasks
node scripts/nd-agent.mjs request POST /api/projects/PROJECT_ID/tasks '{"title":"Review the release"}'
```

Use your shell's normal JSON quoting rules. The loopback proxy accepts only the
selected project, checks the local capability, rejects browser-origin requests
and redirects, and never forwards child-provided cookies or Authorization
headers. Requests are JSON, up to 1 MiB; file uploads can use the project's
direct-upload API and returned storage URL outside this JSON proxy.

Bearer tokens last at most five minutes (or the configured shorter agent TTL).
The helper renews them on demand, bound to the same session. Sessions expire
after twelve hours or the device/credential expiry, whichever comes first.
Normal child exit ends its session. If the parent is killed or offline, the
session expires or an owner can end it in settings. An expired/revoked session
never silently restarts: launch explicitly again after correcting authorization.

## Permissions, revocation and history

- Every bearer request rechecks the session, device, authentication credential,
  identity and project owner against the database. Effective scopes intersect
  the token, session's original grants, device grants and current identity
  grants. Done requires all three grants: identity, device and session.
- Permission reductions, device revocation, session termination and identity
  deactivation apply at the next request authorization check, with no token-TTL
  grace period or authorization cache. Requests already admitted may complete.
  Permission increases beyond a session's original grants require a new session.
- Revoking a device ends that device's sessions and revokes its credentials.
  Other devices continue. Ending a session affects only that session.
- Deactivation preserves actor records, assignments, mentions and historical
  contributions. The actor is shown inactive and cannot be selected for new
  assignments. Owners can reassign outstanding work separately.
- Request audit records include the persistent identity, session ID, device ID,
  device name and client. Names and client metadata are descriptive, never proof
  of authentication. Select **Recent activity** on an identity to inspect them.
- Project ownership transfer fails closed for prior-owner runtime grants. The
  new owner can authorize new devices for the same identity; it does not revive
  former-owner device grants or rewrite historical authorship.

The helper prevents accidental identity mixing across concurrent launches. It
does not isolate mutually untrusted programs with the same OS account, or
coordinate their work. Such isolation requires separate OS accounts or runtime
sandboxes. There is no shared memory, scheduling, locking or orchestration.

## API contract

Owner-only `GET /api/projects/{projectId}/agent-identities` returns identities,
effective configuration, devices, recent sessions and audit events without
authentication hashes. `POST` accepts an explicit `operation`:

| Operation | Additional fields |
| --- | --- |
| `create` | `name`, optional `roleLabel`/`avatarSeed`, `scopes`, `canMoveTasksToDone` |
| `update` | `identityId` and the same configuration as create |
| `deactivate` | `identityId` |
| `authorize-device` | `identityId`, `name`, `scopes`, `canMoveTasksToDone`; returns one-time `pairingCode` |
| `revoke-device` | `identityId`, `deviceId` |
| `end-session` | `identityId`, `sessionId` |

`POST /api/auth/agent/runtime` requires `operation`, `projectId`, `identityId`
and `proof`. `pair` consumes a pairing code and returns the device credential;
`start` uses that credential and a `client` name; `renew` and `end` additionally
require the exact `sessionId`. Missing, wrong-project or switched bindings are
denied. These responses use `Cache-Control: no-store`. Failed authentication is
rate-limited. Only the launcher should handle these proof-bearing exchanges.

## Compatibility and validation

Existing API credentials retain their actor IDs and remain under **Legacy API
credentials**. Their existing exchange/rotation and expiry behavior is retained;
they can also authorize devices. New identities have no usable legacy API key
and cannot be converted into raw keys by the rotation API. Prefer the launcher
for new workflows. Legacy bearer scope reductions retain the existing token TTL
window; Done permission remains live. Runtime sessions use the stricter checks
above.

The migration is additive and leaves historical foreign keys intact. See
[the architecture decision](../../adr/nd-658-portable-agent-identities.md) and
[the tenant-isolation runbook](rls-tenant-isolation.md). Local validation includes
the runtime service/proxy tests, the extended PostgreSQL matrix and
`tests/e2e/nd-658-portable-agent-identities.spec.ts`. No deployment is needed to
exercise these paths locally.
