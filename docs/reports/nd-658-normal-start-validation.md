# ND-658 normal-start validation

The live ND-658 brief dated 2026-11-13 controls launch/integration assumptions.
The v2 attachment supplies the persistent-identity and authorization background.
Delivery and exact final commit/check links are recorded in [PR #669](https://github.com/dorianagaesse/nexus_dash/pull/669).
The two-laptop and IDE acceptance round exercised `aaf364a3`. The automated
checks for later revisions are recorded separately on the PR.

## Implemented interface

The independent broker supports `session open`, `status`, `request` and `close`
from existing terminal-capable clients. An explicit open starts the broker
when its endpoint is absent. Every command uses
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
| Actual Claude provider | The installed user configuration is MiniMax-M3 at api.minimax.io, during this test. The observed provider was MiniMax-M3. |
| Native Linux | [Native run 43337494125](https://github.com/dorianagaesse/nexus_dash/actions/runs/43337494125) at `897cd1b11b60f5b591e48ffb7317a378912df002`: real Secret Service pairing, fresh CLI processes, NOBYPASSRLS app, full task operations, live reduction/revocation, stable history and a real five-minute expiry/renewal wait; passed. |
| Native macOS | The same run passed a real Keychain store/read/replace/missing-binding roundtrip. The physical Mac Codex CLI round below separately exercised the Keychain-backed broker. |
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
| 2–3: normal-start selection, terminal operations, separate invocations and current status | Implemented; actual Codex CLI and configured Claude Code plus native process integration pass. Two actual Codex VS Code windows passed the normal-start checks. |
| 4: concurrency and immutable switching | Two Windows VS Code conversations and one Mac Codex CLI conversation used three concurrent Oscar sessions. Claude Code also ran Nova and Oscar as separate explicit bindings. |
| 5: two physical laptops | Passed on physical Windows and macOS laptops paired independently to the same disposable project and Oscar identity. |
| 6–7: renewal, grants, expiry and revocation | Windows VS Code and Mac Codex CLI renewed the same sessions after more than five minutes. Owner session end and device revocation affected only the selected bindings. The Mac retained reads and was denied both writes after a live grant reduction. |
| 8: stable attribution/history | After rename and deactivation, Nova read the original Oscar task, assignment, comments and mention with the same actor ID. Current displays use the renamed identity and historical fields keep their recorded labels. |
| 9: credentials and transport | OS-vault local capability, broker-only device proofs/bearers, immutable binding and project proxy restrictions implemented/tested. Same-OS-account malicious process isolation is explicitly outside the boundary. |
| 10: legacy and controlled launcher | Existing create/exchange/rotate/revoke, same-actor pairing and controlled launcher paths remain; required regression gates cover them. No automatic mode conversion/fallback. |
| 11: external sandboxes | Shared runtime interface retained and ND-823 transport/lifecycle boundaries documented. Other vendors need separately provisioned and validated adapters. |
| 12: documentation and instructions | Runbooks, hosted onboarding, AGENTS, README, architecture and journal updated; legacy client-specific rules remain supported. |

## Two-laptop acceptance results

On 2026-11-15, two separate Codex VS Code windows on Windows and an ordinary
Codex CLI conversation on the physical Mac held concurrent Oscar sessions.
They used distinct references with the same actor and two independently paired
device IDs. Windows A and Mac created and edited tasks. Windows B and Mac
commented on Windows A's task. Claude Code 2.1.126 with MiniMax-M3 exercised
Nova and Oscar, including the denied Nova Done move and successful Oscar move.
Windows A and Mac renewed after approximately 16 and 36 minutes respectively.

The owner ended one Claude Oscar session while Nova and Windows B stayed
usable. Revoking Oscar's Windows device then blocked Windows B and a fresh
Windows Oscar open. The existing Mac Oscar and Windows Nova bindings could
still read. After an overnight pause both expired through their idle leases.

On 2026-11-18, a fresh Mac Oscar session verified Task Write and Done before the
owner removed them. The same session still read tasks and history. Task update
and Done probes each returned forbidden and left the stored tasks unchanged.
The owner deactivated Oscar while the Mac session was active, and the service
ended that session. Mac status and task reads on the same reference both
returned access denied. A newly opened Nova session wrote and read its own task and
read Oscar's contributions. Oscar's actor ID, assignment and mention remained
linked. The assignee was reported as revoked and unavailable for new assignments.

ND-822–825 remain independent, unmerged work. ND-824's current changes add
runbook/journal conflicts against the new core. ND-825 also conflicts with revised
ND-824 in the identity panel/journal; preserve polling, accessibility and pending
pairing behavior while reconciling. Its recorded UI review follow-ups need
disposition. Do not count historical green runs as integrated-stack validation.
