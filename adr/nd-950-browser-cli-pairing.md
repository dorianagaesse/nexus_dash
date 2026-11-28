# ND-950: browser-approved standalone `nd` CLI pairing and profile isolation

Status: accepted for implementation; 2026-11-27.

## Context

ND-658 introduced persistent project agent identities (`ApiCredential` actor anchors) separated from per-device authorizations (`AgentRuntimeDevice`), hashed runtime credentials (`AgentRuntimeCredential`), and 12-hour runtime sessions (`AgentRuntimeSession`). While that architecture solved actor continuity and live revocation, pairing a new workstation still required cloning the NexusDash repository, generating a one-time pairing code in Project Settings, pasting that code into `scripts/nd-agent.mjs login`, and instructing the model in every normal-start conversation to open a local broker session, verify its binding, and pass `--session ID` on each request.

ND-950 removes both the repository-checkout prerequisite and all model-facing session/broker ceremony while keeping NexusDash as the live authority for identity permissions, actor continuity, and per-installation revocation.

## Decision

### 1. Standalone zero-dependency `nd` CLI distributed by NexusDash

Ship `@nexusdash/nd-cli` (`packages/nd-cli/`, binary `nd`) using only Node.js built-in modules (`node:crypto`, `node:fs`, `node:child_process`, `node:os`, `node:path`) and serve a deterministic `.tgz` bundle at `GET /api/cli/nd.tgz`. An operator on a new machine installs `nd` directly with `npm install -g https://<origin>/api/cli/nd.tgz` without a NexusDash checkout.

### 2. Zero-plaintext browser device authorization (`AgentCliPairingRequest`)

1. `nd login` generates a 256-bit `installSecret` locally in memory and sends only `installSecretHash = sha256(installSecret)` plus the requested installation name (and optional project/identity hints) to `POST /api/auth/agent/cli` (`operation: "begin"`).
2. NexusDash stores SHA-256 digests (`userCodeHash`, `pollSecretHash`, `installSecretHash`) in `AgentCliPairingRequest` with a 10-minute expiry and returns a short confirmation code (`XXXX-XXXX`) and `pollSecret` to the CLI. Plaintext codes and secrets are never stored in PostgreSQL, and `installSecret` never traverses the browser or poll response.
3. The signed-in project owner opens `/cli/authorize?code=XXXX-XXXX`, confirms the terminal code, selects an owned project and an **existing** active agent identity (for example **Oscar**), reviews or narrows the installation permissions and Done capability within that identity's ceiling, and approves.
4. Approval executes inside an owner RLS transaction (`withActorRlsContext` + `SELECT ... FOR SHARE` owner lock on `Project`), creating a standard 90-day `AgentRuntimeDevice` (`authorizedAt = now`) and `AgentRuntimeCredential` (`tokenHash = request.installSecretHash`), plus an `AuthAuditEvent` (`cli_installation_approved`).
5. `nd login` receives the non-secret installation summary once on poll (`deliveredAt` single-use guard), stores `installSecret` in the OS credential vault (Windows DPAPI, macOS Keychain, or Linux Secret Service), and writes non-secret metadata to `~/.nexusdash/cli/profiles/<profile>.json`.

Because approved CLI installations materialize as ordinary `AgentRuntimeDevice` + `AgentRuntimeCredential` rows, they appear immediately in **Project Settings → Agent access**, participate in `app.resolve_agent_runtime_proof` and `validateRuntimeRequest` on every request, preserve the persistent actor ID across machines, and can be revoked per installation without affecting other paired machines.

### 3. Transparent session renewal behind task-facing CLI commands

Task commands (`nd tasks search`, `nd tasks list`, `nd task show`, `nd task comment`, `nd task comments`, `nd task status`, `nd task create`, `nd task update`) manage runtime sessions automatically:

- Both the 90-day `installSecret` and the active `{ sessionId, sessionExpiresAt, accessToken, accessTokenExpiresAt }` envelope are stored encrypted in the OS credential vault, keyed by `(profile, origin, projectId, identityId, deviceId)`.
- Commands reuse the 5-minute bearer while fresh, call `/api/auth/agent/runtime` (`operation: "renew"`) on the same `sessionId` within 30 seconds of bearer expiry, and open a new 12-hour session (`operation: "start"`) only after natural `sessionExpiresAt` rollover.
- Owner-ended sessions, revoked installations, deactivated identities, and ownership transfers fail closed (`401`/`403`), clear the cached session from the vault, never fall back to another identity or legacy key, and emit an actionable operator reconnect message (`Run "nd login..."`).
- Coding client prompts stay 100% focused on the engineering task: zero pairing codes, zero broker commands, zero credential material, and zero session IDs enter model context.

### 4. Supported identity selection granularity and concurrency isolation

We explicitly adopt **per-profile selection granularity** (`ND_PROFILE` environment variable per client profile or terminal, defaulting to `default`, or explicit `--profile <name>` per command):

- Each profile (`~/.nexusdash/cli/profiles/<profile>.json`) binds one `(origin, projectId, identityId, deviceId)` installation.
- **`nd` provides no mutable global `use`/`switch` command and no machine-wide `current-profile` pointer.**
- Re-running `nd login` on an existing profile preselects its bound project and identity for seamless renewal after expiry/revocation, and **refuses** to overwrite that profile with a different `identityId` unless `--replace` is passed explicitly.
- Consequently, pairing or re-authenticating a second actor (`nd login --profile nova`) or running concurrent executions with `ND_PROFILE=oscar` and `ND_PROFILE=nova` cannot change the actor of an in-flight execution.
- Same-IDE-window conversations that inherit an identical unmodified environment share that window's `ND_PROFILE` (`default`) unless started with distinct client profiles/shells (`ND_PROFILE=oscar` vs `ND_PROFILE=nova`) or explicit `--profile <name>`. Per-conversation host binding inside a single shared-env IDE window remains part of the MCP/connector track (ND-850 / ND-854), keeping CLI pairing independent of MCP.

## Consequences

- Operators can onboard a second laptop to an existing identity (**Oscar**) with two commands (`npm install -g .../api/cli/nd.tgz` and `nd login`) and approve in the browser.
- Models use compact, self-discoverable `nd task*` commands (`--help`, `ND-123` reference resolution, concise output) with near-zero prompt token overhead.
- Existing `scripts/nd-agent.mjs` broker/launcher workflows, ND-823 Docker brokering, and legacy `.config/.nd-*.env` API keys remain supported and unchanged.
