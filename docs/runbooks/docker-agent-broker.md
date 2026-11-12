# Disposable Docker agents

The operator runs `scripts/nd-docker-agent.mjs` outside worker containers.
It retains the paired device proof in the host OS vault and gives each worker
an independent HTTPS capability. The identity remains the same across container
restart/recreation; each observed execution gets a new Nexus session.

This depends on the portable identity APIs from ND-658. Legacy API credentials
remain a supported, explicitly selected flow, including creation, exchange,
rotation and revocation. Existing legacy actors may also have paired devices;
this broker neither converts runtime-only identities to keys nor falls back to
keys after rejection.

## Operator setup

Use Node 24+, a local Docker daemon running Linux containers, and a working OS
vault (Windows DPAPI or Linux Secret Service). Pair the exact Nexus origin,
project and identity using `node scripts/nd-agent.mjs login --base ORIGIN
--project PROJECT_ID --identity IDENTITY_ID`. Enter the owner-issued one-time
code interactively. Different identities require separate explicit pairing.

Create an operator-only directory outside repositories and worker mounts. Keep
configuration, TLS private key and broker journal there. Give the broker a TLS
certificate whose SAN includes `host.docker.internal`; its certificate is copied
to workers as their trust anchor. Restrict the listening port to Docker workers
with the host firewall. Never disable certificate verification. Example local
certificate generation with OpenSSL:

```sh
openssl req -x509 -newkey rsa:2048 -nodes -days 7 -keyout broker-key.pem -out broker-cert.pem -subj /CN=host.docker.internal -addext subjectAltName=DNS:host.docker.internal
```

Build a worker image containing Node and `scripts/nd-sandbox-request.mjs`; do
not COPY the repository, `.config`, vault or credentials into its image. Example:

```dockerfile
FROM node:24-bookworm
COPY nd-sandbox-request.mjs /usr/local/bin/nd-sandbox-request.mjs
CMD ["node", "-e", "setInterval(() => {}, 1000)"]
```

Create the operator JSON config, replacing all example paths and IDs:

```json
{
  "url": "https://host.docker.internal:44483",
  "listenAddress": "0.0.0.0",
  "keyFile": "/operator/broker-key.pem",
  "certFile": "/operator/broker-cert.pem",
  "stateDirectory": "/operator/nd-broker-state",
  "workers": [{
    "name": "nd-oscar-one",
    "image": "nd-worker:local",
    "command": ["node", "-e", "setInterval(() => {}, 1000)"],
    "binding": {
      "base": "https://nexus-dash.app",
      "projectId": "PROJECT_ID",
      "identityId": "IDENTITY_ID"
    }
  }]
}
```

Windows accepts absolute paths such as `C:/Users/Operator/nd-broker-state`.
Use distinct worker names for concurrent executions of the same identity.
On POSIX hosts the broker runs workers as its own numeric UID/GID, so they can
read their mode-0600 binding with all Linux capabilities dropped. Worker images
must support that UID and a read-only root filesystem. Windows Docker Desktop
uses its host file-sharing permissions. No binding is made world-readable.
Linux support requires a standard local Docker daemon without user namespace
remapping; rootless/remapped daemons need a separate file-ownership adapter.
Run `node scripts/nd-docker-agent.mjs CONFIG.json --create` to create and start
the containers once. The broker remains in the foreground while Docker workers
are detached. From a worker:

```sh
node /usr/local/bin/nd-sandbox-request.mjs GET /api/projects/PROJECT_ID/tasks
```

The helper reads `/run/nd-agent/binding.json` on every request. Only that worker's
transport directory is mounted read-only. A container restart rotates this
capability and session; do not cache the file contents. To recreate, explicitly
stop/remove the worker container, stop the broker, and run with `--create` again.
For multiple workers, recreate all configured containers with `--create`, or
use separate broker configurations/state directories for independent management.

## Lifecycle and recovery

- The broker polls Docker every two seconds after the previous reconciliation
  completes, and inspects the worker before every authenticated request. Container
  ID plus start time defines an execution. Stop, crash, pause or replacement
  retires the old capability and ends its session. A request already admitted
  before a lifecycle change or server revocation may finish.
- Docker inspection timeout is 15 seconds per CLI operation; API start/end has
  a 15-second timeout. Reconciliation is serialized, so outages and multiple
  workers can delay polling. Requests wait for inspection and fail closed.
- Tokens renew after approximately 4.5 minutes on demand, in the same session.
  Sessions last at most 12 hours. Pairing authorization lasts at most 90 days.
  Expiry or rejection does not start another session for the same execution.
  Ask the owner to reauthorize expired/revoked devices, pair explicitly, then
  restart the worker. The broker never creates an identity.
- Ctrl+C closes capabilities and attempts session cleanup, leaving containers
  operator-managed. On broker restart, persisted sessions are ended before use;
  running containers require an explicit `docker restart NAME` to get access.
  This prevents broker recovery from reviving an owner-ended session.
- A broker crash leaves a `broker.lock` in its state directory. Verify the old
  process has stopped before removing that lock and restarting without `--create`.
  A broker that fails its own startup (including an invalid config or a corrupt
  journal) removes the lock it acquired, so a remaining lock means another
  process owns it or a crash. Transient cleanup failures stay in `sessions.json`
  and retry with exponential backoff from 30 seconds to five minutes; terminal
  authorization rejection removes the entry without consuming the shared
  authentication failure budget. Rejected renewal closes that execution to
  further requests; entries expire after the session's 12-hour maximum. A crash
  between server session creation and journal persistence can leave an orphan
  until that bound. Bearers stay only in broker memory and expire in five
  minutes; workers have no usable access while the broker is down.
- Daemon failure retires local access. Once Docker recovers, explicitly restart
  affected workers that had an active session; the broker does not recreate
  their sessions automatically. A session start that fails transiently (DNS,
  VPN, timeout or 5xx from the Nexus origin) is retried for the same execution
  with 30-second to five-minute backoff. Terminal authorization rejection
  (401/403/404) is latched until that container is restarted, and requests stay
  fail-closed while no session exists.

## Isolation boundary

The host operator, Docker administrator, daemon and broker are trusted. Arbitrary
code runs only inside workers. Workers get no device proofs, legacy keys, host
vault, TLS private key, other transport directories or Docker socket. Containers
are created with all capabilities dropped, no-new-privileges and a read-only
root filesystem with a temporary `/tmp`; host networking and PID namespaces
are unsupported. Do not add privileged mode, host mounts or the Docker socket.
One worker can contact the shared TLS endpoint but cannot authenticate as a
sibling without its independent 256-bit capability. Headers/cookies and redirects
remain restricted by the existing project proxy. Do not expose transport files
through model logs or commit them.

This is not protection against a host/Docker administrator or a container escape.
It supplies identity continuity, not shared memory, scheduling, CLI/IDE integration
or task coordination. Native Linux and Docker Desktop host validation should be
recorded separately; Linux containers on Windows alone do not prove a native
Linux host vault setup.
