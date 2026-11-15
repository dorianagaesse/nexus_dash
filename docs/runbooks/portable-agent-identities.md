# Portable agent identities

Project Settings → Agent access opens the identity list. An owner creates an
identity (for example **Oscar**, role label **Orchestrator**), chooses scopes,
and separately grants **Allow moving tasks to Done**. Labels grant no access.
An identity's ID is permanent. Use that ID for assignments and mentions.

Select an identity to see its permissions, devices and sessions. Permissions
use the same readable labels as the editor. A **Paired** device has completed
pairing; each session separately shows its state and last activity. Expand
**Legacy API credentials** to create, rotate or manage existing API keys.

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

On Windows the helper starts Windows PowerShell with its default module search
path so launching from PowerShell 7 does not break the built-in DPAPI commands.

Use `--base https://your-instance.example` for a different instance, on both
login and run. The default is `https://nexus-dash.app`. HTTP is accepted only on
localhost for development. Origin, project ID and identity ID form an exact
vault binding; the helper never searches for an alternative credential.

## Work from an already-running client

Keep a reviewed NexusDash checkout at a stable absolute path and use Node 24.
An owner pairs each exact origin/project/identity connection once as above.
The owner then starts an independent broker in a separate trusted terminal:

```sh
node /absolute/nexus_dash/scripts/nd-agent.mjs broker
```

This does not start or restart your coding client. In an existing Codex CLI,
Codex VS Code conversation, Claude Code (including the project's DeepSeek
provider), or another client with a permitted terminal tool, ask that execution
to run:

```sh
node /absolute/nexus_dash/scripts/nd-agent.mjs session open --base ORIGIN --project PROJECT_ID --identity IDENTITY_ID --client "Codex / release review A"
```

Use the immutable IDs from the owner, not an agent name. A name, model/provider
or client label cannot authenticate or select an unpaired identity. The result
contains a non-secret `sessionId` and current origin/project/identity/device,
identity name/labels, client description, effective scopes, Done permission and
expiry. Keep that session reference in this conversation's instructions. Before
writing, verify it against the owner's intended identity:

```sh
node /absolute/nexus_dash/scripts/nd-agent.mjs session status --session SESSION_ID
node /absolute/nexus_dash/scripts/nd-agent.mjs session request --session SESSION_ID --method GET --path tasks
node /absolute/nexus_dash/scripts/nd-agent.mjs session request --session SESSION_ID --method GET --path 'tasks/search?q=release'
node /absolute/nexus_dash/scripts/nd-agent.mjs session request --session SESSION_ID --method POST --path tasks --body-file /absolute/task.json
node /absolute/nexus_dash/scripts/nd-agent.mjs session close --session SESSION_ID
```

`task.json` contains ordinary JSON such as `{"title":"Review the release"}`.
Use the same request form for task PATCH, comments and status moves with the
documented API paths/bodies. `--path tasks/TASK_ID/comments` is relative to the
bound project; a full `/api/projects/PROJECT_ID/...` path is also accepted when
the shell preserves it. Prefer relative paths in Windows Git Bash/MSYS, which
rewrites absolute-looking arguments for native executables. Both forms enforce
the same project boundary. Each invocation can be a new shell process, in any
working directory. No ND parent wrapper, IDE restart, inherited environment,
client-specific key file, MCP server or provider integration is required by
this command interface. The client must be able to execute this trusted helper,
access the same unlocked OS vault/session as the broker and contact loopback;
the broker needs network access to the explicit Nexus origin. Tool approval and
client sandbox/network policies still apply. Clients without a callable terminal
or provisioned adapter are outside this interface. Client names in tests are
descriptive labels; real client/conversation validation is recorded separately.

Open a fresh session for every execution, including two conversations using the
same identity. Each conversation explicitly retains its own reference; neither
a terminal, workspace, process, profile nor cwd identifies a conversation.
For an actual IDE concurrency check, use two separately opened conversation
tabs (or separate profiles/windows if that client cannot run tabs concurrently),
give each tab its own open result, and alternate status/write requests from each.
Record the actual arrangement. Do not reuse a session reference across tabs.
To deliberately switch identity, open another explicitly paired binding and use
its new reference. Close the previous session when finished; another execution
is unchanged. There is no machine-wide current identity or cwd selection file.

The broker authenticates local CLI requests with a random capability held in
the OS vault, separate from device proofs. `sessionId` alone grants no access.
Only the broker reads identity proofs and holds renewable bearers; CLI output
and its endpoint/journal files contain no credentials. The local capability is
not printed or passed in argv. The trusted OS account can run the CLI and use
its paired identities: this is protection from accidental cross-binding, not
isolation from malicious processes with that account's privileges. Use separate
OS accounts or the isolated Docker adapter for mutually untrusted workers.

## Broker leases, shutdown and recovery

The default state directory is `~/.nexusdash/broker`, outside the repository.
Use `--broker ABSOLUTE_DIRECTORY` on both the broker and every session command
to select another instance. On POSIX this directory must be owned by the user
with no group/other permissions; authentication capability storage uses the OS
vault on every platform. The endpoint binds only to `127.0.0.1`, rejects browser
Origins and unexpected Host values, and accepts only authenticated commands.
Project requests reuse the launcher's method/path/redirect/header restrictions.
No caller cookies, upstream cookies or arbitrary Authorization headers pass
through. JSON requests are limited to 1 MiB.

An idle session lease is 30 minutes. Status or request activity renews that
lease; `session open --lease-seconds N` accepts 60–3600 seconds. Lease activity
never extends the server's twelve-hour session or ninety-day device bounds.
The broker checks leases before each request and sweeps at ten-second intervals
after queued operations finish. Operations are serialized; upstream timeouts
can delay cleanup, but an expired lease cannot admit a new request.
Explicit `session close` retires local access immediately and attempts server
cleanup. Ctrl+C in the broker's terminal retires all of that broker's sessions.
It does not end sessions in another broker or the launcher/Docker adapter.

A generic helper cannot observe when an IDE conversation closes. Close it
explicitly; forgotten conversations expire through the idle lease. A broker
crash makes its local capabilities unusable. On restart the cleanup journal
ends old sessions; it never reconstructs conversations or silently opens new
sessions. After verifying the previous PID in `broker.lock` has stopped, remove
that exact lock file and restart the broker. Then explicitly open new sessions.
Do not remove a live broker's lock. Cleanup retries transient failures with
30-second to five-minute backoff and drops terminal 401/403/404 rejections.
Server sessions expire within twelve hours even if cleanup cannot reach Nexus;
a crash between creation and journal persistence has that same orphan bound.

Origin/network outages fail the current command; later commands can retry the
same still-authorized session. Rejected renewal is terminal for that session:
no automatic restart, alternative identity, raw-key fallback or reauthorization.
The owner must resolve revocation/expiry, pair again if necessary, and the
execution must explicitly open a new session. Status renews authorization to
read current effective permissions; those permissions are still checked again
at the next service authorization, so a status result is not a durable grant.

## Controlled launcher option

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

- The device authorization form uses the identity's current grants after edits
  or refreshes, preserving any narrower device choices. Pairing is disabled
  until at least one currently allowed permission is selected.
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

Externally provisioned sandboxes use ND-823's authenticated HTTPS transport and
per-worker capabilities, not the native broker's OS-account capability or vault.
Both adapters reuse `openRuntime` and the same REST authorization services.
Docker lifecycle/isolation evidence remains with ND-823. Other sandbox adapters
must provision an authenticated private capability, trusted TLS/network route,
explicit immutable binding and a supervisor that closes/reconciles executions.
Keep proofs/bearers outside workers, rotate worker capabilities on recreation,
and create a new session under the same actor. No vendor sandbox is supported
merely because it can reach HTTP; its provisioning and lifecycle need validation.

Owner-only `GET /api/projects/{projectId}/agent-identities` returns identities,
effective configuration, devices, recent sessions and audit events without
authentication hashes. `POST` accepts an explicit `operation`:

| Operation | Additional fields |
| --- | --- |
| `create` | `name`, optional `descriptiveLabels`/`avatarSeed`, `scopes`, `canMoveTasksToDone` |
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
rate-limited. Only trusted pairing helpers and credential brokers should handle
these proof-bearing exchanges. Start/renew additionally return non-secret
identity name/labels, effective Done permission and device/session expiries for
status display. The underlying token/proof fields remain broker-only.

## Compatibility and validation

Identity labels use the shared descriptive-label field (up to five labels,
40 characters each). Current names/labels appear on linked comments. Raw-key
rotation invalidates old legacy tokens immediately; authorized device sessions
remain independent of that key rotation.

Existing API credentials retain their actor IDs and remain under **Legacy API
credentials**. Their existing exchange/rotation and expiry behavior is retained;
they can also authorize devices. New identities have no usable legacy API key
and cannot be converted into raw keys by the rotation API. The independent
CLI/broker and controlled launcher are supported explicit choices. Removing a legacy scope invalidates existing tokens containing
that scope immediately; exchange a new token to use the remaining grants. Done
permission remains live. Runtime sessions intersect their token scopes with live
grants on each request, so remaining read access continues after a write reduction.
Identity grant reads also ignore unsupported scope enum values before Prisma
deserialization, preserving access to the identity manager on shared databases
that have received a newer deployment's permission grants.

The migration is additive and leaves historical foreign keys intact. See
[the architecture decision](../../adr/nd-658-portable-agent-identities.md) and
[the tenant-isolation runbook](rls-tenant-isolation.md). Local validation includes
the runtime service/proxy tests, the extended PostgreSQL matrix and
`tests/e2e/nd-658-portable-agent-identities.spec.ts`. No deployment is needed to
exercise these paths locally.

## Reviewer test procedure

Use this PR branch with a disposable local PostgreSQL database, apply all
migrations, build and start the app as described in [local validation](local-validation.md).
Set `TRUSTED_ORIGINS` to the local app origin and use `NODE_ENV=test` for automated
browser tests so mail delivery uses test behavior. Leave `TRUSTED_ORIGINS` unset
for unit/coverage tests, which provide their own origins. Do not point tests at production.
For a second laptop, use a localhost SSH tunnel to the same instance, or an
already-authorized HTTPS test origin. Both devices must use the same project and
identity IDs; localhost databases on separate laptops are not the same instance.

1. Open **Share project → Agent access** as owner. Create Oscar with the
   descriptive label `Orchestrator` (press Enter to add it), task read/write and
   Done enabled. Create Nova with task read/write and Done disabled.
2. Authorize two devices for Oscar. On each physical laptop run the displayed
   `login` command and enter its own code. Start an independent `broker` on
   each. From already-running clients use `session open` twice on the first
   laptop and once on the second, with the same identity ID. Record the actual
   clients, providers and IDE conversation/profile arrangement. Use each
   returned reference in `session status` and `session request` commands.
   All requests succeed; settings show one Oscar and three distinct sessions.
3. Authorize, pair and open Nova separately with its own identity ID. Create a
   task/comment through Oscar's session. Its author is Oscar. An Oscar
   status request may move the task to Done; the same request in a Nova session
   returns 403. After five minutes, another read succeeds through automatic renewal.
4. End one session: only it fails on its next request. Revoke the first device:
   its remaining session fails while the second device still reads. Wrong project,
   unauthorized identity or missing/expired bindings must fail without fallback.
5. Edit Oscar to remove task write and Done, then authorize another device without
   reselecting Oscar. Pairing succeeds with the remaining read scope, with no
   hidden Done/write grant. Active writes return 403. If no selected device scope
   remains allowed, pairing stays disabled until an allowed scope is selected.
6. Rename/relabel Oscar: existing linked comments show the current name/labels.
   Deactivate Oscar: access stops; assignments, mentions and comments remain.
7. Expand **Legacy API credentials**, create a test credential, and verify the
   search/filter/manage/label controls. Refresh identities and authorize/pair a
   device for this credential before testing rotation.
   Rotate a legacy key: its old bearer fails immediately and a newly exchanged
   token works immediately. A separately paired device session for that same
   legacy identity remains valid across the key rotation.
8. Check the controlled `run -- executable` launcher still creates a distinct
   session and its `request` command works. Close a normal-start session while
   the launcher remains active and verify that it is unaffected.
9. Close a conversation explicitly. Verify idle-lease expiry, network outage
   and recovery using its existing reference, and broker crash/journal cleanup.
   Owner-ended sessions and rejected renewal never start another session
   automatically. Inspect endpoint/journal/output for proofs and bearers.

Automated gates: `npm run lint`, `npm run rls:check`, `npm test`,
`npm run test:coverage`, `npm run test:e2e` (includes build), then
`npm run test:rls:setup` and `npm run test:rls` with the documented separate
admin/runtime URLs. The ND-655, ND-656, ND-657 and ND-658 browser/service tests
cover the integrated flows. `tests/e2e/nd-658-normal-start.spec.ts` exercises
native-vault pairing and separate CLI processes against migrated PostgreSQL;
set `PLAYWRIGHT_APP_DATABASE_URL` to the NOBYPASSRLS application role while test
fixtures retain the admin URL. `ND_LONG_RUNTIME_TEST=1` includes a real bearer
expiry/renewal wait. `Native Agent Identity` adds native Linux Secret Service
integration and macOS Keychain roundtrips. Record the exact run/SHA and separate
actual client/physical-laptop evidence; a CI label or simulated device is not
evidence of a real IDE conversation or second physical laptop.
