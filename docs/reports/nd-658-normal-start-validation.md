# ND-658 normal-start validation

The live ND-658 brief dated 2026-11-13 controls launch/integration assumptions.
The v2 attachment supplies the persistent-identity and authorization background.
Delivery and exact final commit/check links are recorded in [PR #669](https://github.com/dorianagaesse/nexus_dash/pull/669).
This report distinguishes implementation coverage from unavailable physical and
IDE evidence. ND-658 remains In Progress until the required evidence is complete.

## Implemented interface

The independent `nd-agent.mjs broker` supports `session open`, `status`,
`request` and `close` from existing terminal-capable clients. Every command uses
an explicit immutable session reference. Authentication is independent of that
reference and held in the OS vault; no machine-wide current identity exists.
The broker reuses the controlled launcher/Docker runtime authorization core.
See [setup, leases and recovery](../runbooks/portable-agent-identities.md).

Prefer project-relative request paths (`--path tasks`, `tasks/ID/comments`,
`tasks/ID/status`). Real Claude Code testing found Windows Git Bash/MSYS
rewriting full `/api/...` native-program arguments. Relative paths are resolved
inside the session's fixed project and retain the same traversal/authority
checks. PowerShell/POSIX full project paths remain supported.

## Evidence

| Check | Evidence and limit |
| --- | --- |
| Native Windows | DPAPI pairing and fresh Node CLI processes against migrated disposable PostgreSQL; the app uses `nd658_runtime`, a NOBYPASSRLS role, separately from fixture/migration administration. |
| Actual ordinary clients | Four concurrent installed client executions: two Codex CLI sessions as Oscar, Claude Code as Oscar, and Claude Code as Nova. Each independently opens/verifies its binding, reads/searches/creates/updates/comments/moves tasks. Oscar's Done moves succeed; Nova's is denied. Server-side task rows confirm stable actor IDs and expected statuses. All calls use the independent broker with ND launcher/key variables removed. |
| Actual Claude provider | The installed user configuration is MiniMax-M3 at api.minimax.io, rather than the brief's documented DeepSeek. No provider configuration or legacy credential was changed. This is actual MiniMax evidence, not a DeepSeek claim. |
| Native Linux | [Native run 43337494125](https://github.com/dorianagaesse/nexus_dash/actions/runs/43337494125) at `897cd1b11b60f5b591e48ffb7317a378912df002`: real Secret Service pairing, fresh CLI processes, NOBYPASSRLS app, full task operations, live reduction/revocation, stable history and a real five-minute expiry/renewal wait; passed. |
| Native macOS | The same run passed a real Keychain store/read/replace/missing-binding roundtrip. This does not claim full macOS client/IDE or physical-laptop coverage. |
| Transport and lifecycle | Broker tests cover unauthenticated session references, browser Origins, wrong origin/project/identity, path traversal/authority forms, independent same/different identities, no output/journal credentials, redirects/headers, idle expiry, restart cleanup, terminal renewal rejection and cleanup backoff. |
| Repository baseline | Initial local lint, RLS inventory, 2,576 unit/API tests, coverage (95.56% lines / 89.12% branches), production build and real PostgreSQL isolation matrix passed. Final exact-head gates and full browser result belong to the PR's current check runs, not this historical count. |
| Docker compatibility | A separate local merge of `897cd1b1` with ND-823 `09e9d049` retained its Docker implementation and the newer shared client core (identical to `b7c8fa77`). Thirty-one focused broker/client tests and the real Docker Desktop lifecycle scenario passed against the new app with a NOBYPASSRLS role. ADR/journal append conflicts and the duplicate shared-client renewal edit require reconciliation. ND-823 remains a separate PR. |
| Hosted onboarding | Desktop 1440px and mobile 390px Chromium render checks passed after correcting an overflowing scope-badge row. Identity/session setup and supported legacy access are now introduced accurately; Impeccable's detector and onboarding component tests pass. These are emulated layout checks. |

An additional full browser run with **every** app flow under a NOBYPASSRLS role
exposed a pre-existing `main` defect in collaborator offboarding: a child todo's
parent revision trigger violates the note's `updatedByUserId` RLS check when a
different actor last edited the parent. A minimal two-user PostgreSQL test
reproduced error 42501; trigger, policy and offboarding service are unchanged
from `main`. [ND-857](https://nexus-dash.app/projects/cmteshp27000004jic3pr6wy4/tasks/cmwe9rjjj000408jsc9kcknqj)
tracks a separate fix with links to those sources. This extra run is not a full
pass. It is distinct from the documented standard full baseline and the
ND-658-specific native runtime/tenant checks under the restricted role.

The opt-in actual-client test is reproducible through
`ND_ACTUAL_CLIENT_TEST=1` and explicit installed executable paths, using those
clients' existing provider authentication. The ordinary native test needs an
unlocked OS vault; `ND_LONG_RUNTIME_TEST=1` includes a real expiry wait.
See [local validation](../runbooks/local-validation.md). A descriptive test client
label alone is not actual-client evidence.

## Acceptance coverage and remaining evidence

| Live criterion | Status |
| --- | --- |
| 1: identity management and Oscar/Nova permissions | Existing owner UI/service/E2E coverage retained; actual ordinary-client Done success/denial confirmed. ND-825's additional permission presentation remains a separate PR. |
| 2–3: normal-start selection, terminal operations, separate invocations and current status | Implemented; actual Codex CLI and configured Claude Code plus native process integration pass. Actual Codex VS Code conversation check remains outstanding. |
| 4: concurrency and immutable switching | Same-cwd concurrent ordinary CLI clients pass with distinct explicit sessions and independent closure. Record actual IDE conversation/profile arrangement before claiming that portion. |
| 5: two physical laptops | Outstanding. The owner is available the following day. CI runners, multiple local proofs and simulated devices do not count as this check. |
| 6–7: renewal, grants, expiry and revocation | Native Linux real token expiry/renewal plus service/RLS/proxy checks pass. Idle leases never extend the server's session ceiling, and terminal rejection cannot reopen a session. |
| 8: stable attribution/history | Existing runtime and ordinary-client scenarios retain actor IDs after rename, reduction and deactivation. |
| 9: credentials and transport | OS-vault local capability, broker-only device proofs/bearers, immutable binding and project proxy restrictions implemented/tested. Same-OS-account malicious process isolation is explicitly outside the boundary. |
| 10: legacy and controlled launcher | Existing create/exchange/rotate/revoke, same-actor pairing and controlled launcher paths remain; required regression gates cover them. No automatic mode conversion/fallback. |
| 11: external sandboxes | Shared runtime interface retained and ND-823 transport/lifecycle boundaries documented. Other vendors need separately provisioned and validated adapters. |
| 12: documentation and instructions | Runbooks, hosted onboarding, AGENTS, README, architecture and journal updated; legacy client-specific rules remain supported. |

## Next review session

Use the same disposable migrated instance from two physical laptops, through
explicit localhost tunnels or an authorized development HTTPS origin. Pair
separate devices to the same Oscar ID; never copy a device proof. Run the
[reviewer procedure](../runbooks/portable-agent-identities.md#reviewer-test-procedure),
including actual VS Code conversation tabs/profiles, separate shell calls,
independent session/device revocation, current permissions and retained actor
history. Record the exact branch SHA, machines, clients and provider. Do not use
production for these mutations. Recheck current PR gates before merging.

ND-822–825 remain independent, unmerged work. ND-824's current changes add
runbook/journal conflicts against the new core. ND-825 also conflicts with revised
ND-824 in the identity panel/journal; preserve polling, accessibility and pending
pairing behavior while reconciling. Its recorded UI review follow-ups need
disposition. Do not count historical green runs as integrated-stack validation.
