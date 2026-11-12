# ND-822: persistent identities for disposable Docker agents

Date: 2026-11-09. Status: investigation complete; container design proposed,
not implemented. Reviewed ND-658 / [PR #669](https://github.com/dorianagaesse/nexus_dash/pull/669)
at `ec050eb7e5de9f1a1bc9826b08765edc1b49b92e`.

## Outcome and scope

The logical identity can outlive a laptop, container and agent execution. ND-658
provides the server-side foundation, but its shipped launcher is a desktop
process launcher, not a Docker lifecycle integration. Do not describe it as
container-ready or wrap `docker run -d` and assume it works.

The user confirmed two PowerShell sessions on one Windows machine. That is
concurrency evidence, not a physical second-device test. Ordinary Codex/VS Code
conversation integration is not a merge requirement. Future disposable Docker
agents and cross-device continuity are the intended direction.

Legacy credentials remain a supported, explicitly selected option. This work
does not deprecate them, migrate users away from them, or permit automatic
fallback when a runtime binding is missing, expired or revoked.

## What survives a restart

| Object | Lifetime and behavior in reviewed source |
| --- | --- |
| Identity (`ApiCredential.id`) | Persistent project actor; sessions do not create replacement actors. Assignments, mentions and contributions retain their identity references. |
| Device/runtime authorization | Owner-authorized binding to exactly one identity, with a 90-day expiry. Its name is descriptive, not physical-device attestation. |
| Runtime credential | Random proof stored in the operator's vault; server stores its hash. It expires with the device authorization. |
| Session | One execution, at most 12 hours, bounded by device/credential expiry. Restart should create a new session against the same identity. |
| Bearer token | At most five minutes, renewed within the same live session. Refreshing the token does not extend the session's original lifetime. |
| Local capability | Random per launcher, authorizing access to that launcher's loopback proxy. It is itself sensitive, although it is not a long-lived device proof. |

The [runtime service](https://github.com/dorianagaesse/nexus_dash/blob/ec050eb7e5de9f1a1bc9826b08765edc1b49b92e/lib/services/agent-runtime-service.ts)
checks current identity, device, credential, project ownership and session
authorization. Grant reductions affect the next authorization check; admitted
requests may complete. Permission increases beyond a session's original grants
require a new session. Deactivation preserves history but stops access.

Normal child exit ends the session. A killed/offline launcher can leave a session
record until expiry or owner termination. The current UI's Active state means
unended/unexpired, not a live heartbeat. A stopped agent does not lose its actor,
but a reliable container adapter still needs lifecycle reconciliation.

The vault indexes origin + project + identity, with one local entry for that
combination. Pairing it again on the same OS account overwrites that local entry;
it does not migrate or revoke previous server grants. Authorize each independent
laptop/broker separately rather than copying a vault or cloning a device proof.

## Observed Docker boundaries

Local probes used Windows, Docker Desktop 4.46.0 / Engine 28.4.0, Linux containers,
and the existing `node:24-bookworm` image ID
`sha256:14078204b6bb268c107ceff6d3c43f45a888105e5c2b18b14c32b3409d93a1b0`.
The tag is mutable: a 2026-11-12 review re-run with Docker Engine 29.8.2 pulled
a newer image (`sha256:8cbdee93...`) and reproduced the documented boundary
results. These observations describe container behavior rather than one image
build; pin the image to a digest when exact repetition matters. The probes
imported the actual helper files at the reviewed commit. Upstream runtime
responses, actor IDs and proofs were synthetic; no live Nexus credentials or
production data entered a container. Only the isolated probe directory was
mounted read-only. The containers and synthetic proxy were cleaned up.

| Probe | Observed result | Implication |
| --- | --- | --- |
| Host request through `openRuntime` | HTTP 200 against the synthetic upstream | Positive control for the real local proxy. |
| Linux `createVault().read()` | OS credential vault unavailable | This Node image does not supply the required Secret Service. A mounted Docker secret is not an implemented vault adapter. |
| Docker child without `--env` | `ND_AGENT_URL` absent | Environment inherited by the Docker CLI is not automatically passed into the container. |
| Explicitly forwarded loopback binding | `fetch failed`, request exit 1 | Container loopback does not reach the host launcher in bridge networking. |
| Substitute `host.docker.internal` | `No bound launcher session`, exit 1 | The request helper deliberately accepts only `http://127.0.0.1:PORT`; its proxy also validates Host. Changing an environment value is insufficient. |
| Wrap detached Docker with `launchAgent` | Launcher exit 0, session `end` observed, container still running | Session lifetime follows the Docker CLI process, not the running container. |

These are boundary probes, not end-to-end Docker authentication, RLS, revocation,
or cross-device tests. See the reproducible synthetic procedure below.

The [client](https://github.com/dorianagaesse/nexus_dash/blob/ec050eb7e5de9f1a1bc9826b08765edc1b49b92e/scripts/agent-runtime/client.mjs),
[request helper](https://github.com/dorianagaesse/nexus_dash/blob/ec050eb7e5de9f1a1bc9826b08765edc1b49b92e/scripts/nd-agent.mjs)
and [vault](https://github.com/dorianagaesse/nexus_dash/blob/ec050eb7e5de9f1a1bc9826b08765edc1b49b92e/scripts/agent-runtime/vault.mjs)
make those assumptions explicit. The helper has no Docker-secret/file provider,
headless provisioning interface, or container-event supervisor.

Docker documents [host access via `host.docker.internal`](https://docs.docker.com/desktop/features/networking/networking-how-tos/).
It does not make that address equivalent to container loopback or satisfy this
helper's validation. [Compose secrets](https://docs.docker.com/compose/how-tos/use-secrets/)
are per-service file mounts; they are readable by authorized processes in that
service. Mounting a long-lived proof into the agent container does not meet the
requirement to keep it outside agent execution. Linux Secret Service sessions
depend on a [D-Bus session bus](https://specifications.freedesktop.org/secret-service/latest/sessions.html);
providing a home directory alone does not supply that service.

## Recommended integration (proposed)

Use an operator-controlled broker or supervisor outside the agent container.
Pair its explicit origin/project/identity binding once and retain the proof in
the host OS vault or an operator secret store. Each independent host/broker
gets its own authorization for the same Nexus actor. Do not put the proof in an
image, worker environment, model context, repository or worker-readable volume.

The broker starts one Nexus session per worker execution, retains renewable
bearer tokens, and exposes only the bound project's request operations through
an authenticated per-sandbox transport. It must retain the existing project,
method, redirect and header restrictions. The worker cannot ask it to select an
arbitrary identity, start unrestricted sessions or exchange a proof.

For Linux containers, evaluate a per-sandbox Unix socket on an isolated volume.
A broker sidecar can keep its secret mount separate from the worker while
sharing only the socket/capability channel. This is a proposal: Windows Docker
Desktop/Linux interoperability, file permissions and access by sibling workers
need validation. If using TCP instead, require an explicitly authenticated,
isolated channel; never expose the current proxy broadly by changing its bind
address to `0.0.0.0`. Host networking is not a substitute for sandbox isolation.

The operator/broker and Docker administrator are trusted. Worker containers
must not have the host vault, device secret mounts, Docker socket, host process
namespace, privileged mode or another worker's transport. A Docker administrator
can inspect/control containers; this design does not protect against that actor.

Lifecycle requirements:

1. Normal stop closes the worker capability and ends only its Nexus session.
2. Crash/detached execution is reconciled against actual worker/container
   lifetime, not the exit of `docker run`. Document the reconciliation interval
   and the existing 12-hour upper bound during broker outage.
3. Restart/recreation starts a fresh session for the same identity. Do not reuse
   stale bearer/capability files, create another actor, or silently switch modes.
4. A running worker may renew its token only within its original session.
   Session expiry requires an explicitly authorized new execution policy.
5. Owner-ended/revoked access must not trigger an automatic resurrection loop.
   Distinguish allowed worker restarts from an operator's stop decision.
6. Expired 90-day authorization needs owner reauthorization. Rotation/provisioning
   for unattended operation is not implemented by the current helper.

Prefer this isolated broker over mounting an entire desktop vault or placing
the launcher and long-lived proof in the same trust boundary as arbitrary agent
code. Shared identities do not provide shared memory, scheduling, task locks or
conflict resolution.

## Legacy credentials: retained contract and limitations

The existing owner UI and APIs must continue to support creating a legacy
credential, revealing its key once, exchanging it for short-lived bearer access,
editing grants, rotating it and revoking it. The word Legacy identifies the
authentication mechanism; it is not a removal plan. The optional UI disclosure
must remain discoverable and include its setup guidance.

An active, unexpired legacy credential already anchors a persistent actor. It
can also receive device authorizations: use that existing ID for both workflows
when both are needed. Do not create a same-named runtime identity and expect
their history to merge. Names are not actor identifiers.

| Action | Legacy key/token | Paired runtime sessions on the same actor |
| --- | --- | --- |
| Rotate legacy key | Old key and previously issued legacy tokens stop; new key exchanges successfully | Continue; rotation changes the legacy key generation, not the actor ID |
| End one runtime session | Unchanged | Only that session stops |
| Revoke one runtime device | Unchanged | That device's sessions/access stop; other devices continue |
| Revoke legacy credential / deactivate identity | Access stops | Also stops: `revokedAt` belongs to the shared actor anchor |
| Legacy anchor expires | Access stops | Also denied by the identity expiry check |
| Reduce identity scopes | Existing legacy token containing removed scopes fails; exchange again | Remaining access uses the intersection with live grants |

Legacy revocation retains its existing responsibility-resolution behavior; do
not describe it as identical to identity deactivation, which retains assignments.
History remains attributable in both paths. There is no key-only disable action
independent of the shared anchor in this implementation.

New runtime-only identities (`identityMode=true`) intentionally have no usable
raw key. The rotation API returns `409 identity-uses-runtime-access`; it cannot
convert them to legacy mode. Retaining legacy access therefore means retaining
the explicit legacy creation/use flow, not promising mode conversion on every
identity. Any future conversion requires a separately reviewed capability.

Evidence: [legacy service](https://github.com/dorianagaesse/nexus_dash/blob/ec050eb7e5de9f1a1bc9826b08765edc1b49b92e/lib/services/project-agent-access-service.ts)
and [ND-658 browser tests](https://github.com/dorianagaesse/nexus_dash/blob/ec050eb7e5de9f1a1bc9826b08765edc1b49b92e/tests/e2e/nd-658-portable-agent-identities.spec.ts).
Those tests cover legacy exchange/rotation alongside device-session continuity;
this investigation reviewed their code and existing CI evidence, not a fresh
live authentication run.

## Delivery and remaining evidence

ND-658 remains the desktop/multi-device foundation. Its physical second-laptop
test and native macOS/Linux vault checks are still outstanding in the PR's
review procedure. Passing Windows concurrent shells and these container probes
do not replace them. The [Quality Gates run](https://github.com/dorianagaesse/nexus_dash/actions/runs/42604669641)
is green for the reviewed head, and the reported review thread is resolved.
No merge, deployment or new end-to-end product validation was performed here.

Related board work was searched before creation and is linked through Related
Tasks; the board owns its current status and sequencing:

- ND-823: implement the broker, per-worker session lifecycle and real Docker
  acceptance matrix. Test stop/restart/recreation, renewal, independent
  revocation, permission changes, isolation and attribution against a disposable
  Nexus database on Linux Docker and Docker Desktop Windows.
- ND-824: complete pairing with copy controls, accurate pending/paired states,
  expiry/completion feedback and supported launch guidance.
- ND-825: simplify permission selection and active-session management, with
  operation-specific feedback and preserved legacy access.

The UI review recorded here is scoped to `ec050eb7`: it was source-based because
browser access was unavailable and no rendered target of that commit was
inspected. Do not imply that a zero-result TSX pattern detector validated
usability or accessibility. The later PR #669 head `ab1ad499` is UI-only (no
authentication, grant or persistence changes) and records production-render
desktop/mobile/dark and keyboard validation with a green
[Quality Gates run](https://github.com/dorianagaesse/nexus_dash/actions/runs/42715669889).
That evidence covers visual polish for the current PR #669 head without changing
the source findings at `ec050eb7`. VS Code/MCP integration remains optional
future work, not a prerequisite to this identity foundation.

## Reproduce the synthetic Docker boundary probes

Requirements: Node on the host, a running Linux Docker engine, and the
`node:24-bookworm` image. The tag is mutable; set `ND822_NODE_IMAGE` to a
digest-pinned reference such as `node:24-bookworm@sha256:<digest>` when exact
repetition matters. Use a disposable probe directory; never mount the repository
or credentials. From a checkout containing the reviewed commit, export only the
three helper files with this Node snippet (save/run it as a temporary `.cjs` file):

```js
const fs = require('node:fs');
const cp = require('node:child_process');
fs.mkdirSync('.tmp/nd822-probes/agent-runtime', { recursive: true });
for (const file of ['nd-agent.mjs', 'agent-runtime/client.mjs', 'agent-runtime/vault.mjs']) {
  fs.writeFileSync('.tmp/nd822-probes/' + file, cp.execFileSync('git', [
    'show', 'ec050eb7e5de9f1a1bc9826b08765edc1b49b92e:scripts/' + file,
  ]));
}
```

Save the following two blocks alongside `nd-agent.mjs`, then run
`node .tmp/nd822-probes/host-probe.mjs`. The probe creates and removes a container
named `nd822-detached-probe`; choose an unused name if necessary. It mounts only
the probe directory and prints synthetic results, never real authentication
material. Expected observations are in the table above. A Docker setup with
different network/vault provisioning may produce different results and must be
reported separately.

### container-check.mjs

```js
import { createVault } from './agent-runtime/vault.mjs';
import { spawnSync } from 'node:child_process';
const output={};
try { await createVault().read('a'.repeat(64)); output.vault='unexpected success'; }
catch(e) { output.vault=e.message; }
output.receivedBinding=!!process.env.ND_AGENT_URL;
if (process.env.ND_AGENT_URL) {
  const attempt=spawnSync(process.execPath,['/probe/nd-agent.mjs','request','GET','/api/projects/project/tasks'],{encoding:'utf8'});
  output.request={code:attempt.status,message:attempt.stderr.trim()};
}
console.log(JSON.stringify(output));
```

### host-probe.mjs

```js
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { openRuntime, launchAgent } from './agent-runtime/client.mjs';
const binding={base:'https://nd822.invalid',projectId:'project',identityId:'oscar'};
const nodeImage=process.env.ND822_NODE_IMAGE||'node:24-bookworm';
const realFetch=globalThis.fetch;
const lifecycle=[];
let sequence=0;
globalThis.fetch=async (url,options)=>{
  if(new URL(url).hostname==='127.0.0.1') return realFetch(url,options);
  assert.equal(new URL(url).origin,binding.base);
  const body=options.body?JSON.parse(options.body):{};
  if(new URL(url).pathname==='/api/auth/agent/runtime') {
    lifecycle.push(body.operation);
    if(body.operation==='end') return Response.json({ended:true});
    return Response.json({projectId:'project',identityId:'oscar',deviceId:'synthetic-device',sessionId:`session-${++sequence}`,accessToken:'synthetic-token',expiresInSeconds:300});
  }
  assert.equal(options.headers.authorization,'Bearer synthetic-token');
  return Response.json({tasks:[]});
};
const vault={read:async()=>'synthetic-proof'};
const mount=`type=bind,src=${fileURLToPath(new URL('.',import.meta.url))},dst=/probe,readonly`;
const args=['run','--rm','--network','bridge','--mount',mount];
function docker(args,env=process.env) {
  return new Promise((resolve,reject)=>{
    const c=spawn('docker',args,{env,windowsHide:true,stdio:['ignore','pipe','pipe']});let out='',err='';
    c.stdout.on('data',d=>out+=d);c.stderr.on('data',d=>err+=d);
    c.once('error',reject);c.once('exit',code=>code===0?resolve(out.trim()):reject(Error(err)));
  });
}
const runtime=await openRuntime(binding,vault,'synthetic-host');
const result={};
try {
  result.hostControl=(await realFetch(runtime.url+'/api/projects/project/tasks',{headers:{authorization:`Bearer ${runtime.capability}`}})).status;
  const env={...process.env,ND_AGENT_URL:runtime.url,ND_AGENT_CAPABILITY:runtime.capability};
  result.notForwarded=JSON.parse(await docker([...args,nodeImage,'node','/probe/container-check.mjs'],env));
  result.loopback=JSON.parse(await docker([...args,'-e','ND_AGENT_URL','-e','ND_AGENT_CAPABILITY',nodeImage,'node','/probe/container-check.mjs'],env));
  result.hostAlias=JSON.parse(await docker([...args,'-e','ND_AGENT_URL','-e','ND_AGENT_CAPABILITY',nodeImage,'node','/probe/container-check.mjs'],{...env,ND_AGENT_URL:runtime.url.replace('127.0.0.1','host.docker.internal')}));
} finally { await runtime.close(); }
const name='nd822-detached-probe';
try {
  result.detachedLauncherExit=await launchAgent(binding,vault,'docker',['run','-d','--name',name,'--network','none',nodeImage,'node','-e','setTimeout(()=>{},120000)']);
  result.detachedContainerStillRunning=(await docker(['inspect','--format','{{.State.Running}}',name]))==='true';
  result.sessionEndedBeforeContainer=lifecycle.at(-1)==='end';
} finally {await docker(['rm','-f',name]);}
assert.equal(result.hostControl,200);
assert.equal(result.notForwarded.receivedBinding,false);
assert.equal(result.loopback.request.code,1);
assert.equal(result.hostAlias.request.code,1);
assert.equal(result.detachedContainerStillRunning,true);
assert.equal(result.sessionEndedBeforeContainer,true);
console.log(JSON.stringify(result,null,2));
```
