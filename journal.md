# Development Journal

This file is a concise execution log.
Use it for important implementation milestones, blockers, validation runs, and release evidence.

## Entry Format

- `Date`
- `Type`: `Execution` | `Planning` | `Validation` | `Governance` | `Blocker`
- `Summary`
- `Evidence`: commands, PR number, preview URL, or impacted files

## Recent Entries (Most Relevant)

### 2026-04-09
- Type: Validation
- Summary: A live manual dispatch of the weekly TASK-116 repair lane against Dependabot PR `#133` proved the workflow fails safely, but not yet successfully: the Copilot step could not find the prepared prompt file and fell back to the defer/manual-review path instead of producing a superseding PR or machine-readable result.
- Evidence: Actions run `24163757088`; original PR `#133` received a defer comment from `github-actions`; repair job logs show `cat: /home/runner/work/_temp/dependabot-repair/prompt.md: No such file or directory` immediately before the Copilot step exited.

### 2026-04-09
- Type: Execution
- Summary: TASK-116 live follow-up isolated and patched the weekly repair-lane orchestration bugs on branch `fix/task-116-repair-lane-followup`, including stale-script execution after Dependabot checkout, repo-root resolution from a copied orchestrator, targeted force-reruns for already-marked PR heads, finalize support for already-committed repair branches, and bounded replacement-PR bodies after a verbose Copilot summary broke `gh pr create`.
- Evidence: Branch `fix/task-116-repair-lane-followup`; validation runs `24164472211`, `24164505684`, and `24164768702`; updated `.github/workflows/dependabot-repair-agent.yml`, `scripts/dependabot_repair_agent.py`, `tasks/current.md`, and `tasks/task-116-ci-maintenance-and-workflow-hygiene.md`; branch run `24164505684` reached Copilot end to end on PR `#133`, and branch run `24164768702` successfully synthesized and pushed repo-owned repair branch `chore/task-116-repair-pr-133-9d4d38f` before failing late on replacement PR creation.

### 2026-04-08
- Type: Execution
- Summary: TASK-116 moved the bounded Dependabot repair lane from weekly-primary to event-driven-primary so failing/manual-review bot PRs can be triaged as their CI workflows complete, while keeping the scheduled/manual run as a backstop.
- Evidence: Updated `.github/workflows/dependabot-repair-agent.yml` to trigger on completed `Quality Gates`, `E2E Smoke`, and `Container Image` runs for `dependabot/*` pull requests; updated `scripts/dependabot_repair_agent.py` to target the exact triggering PR, no-op on green/safe bot PRs, and retain bounded batch scanning only for scheduled/manual runs.

### 2026-04-09
- Type: Execution
- Summary: TASK-116 replaced the earlier event-driven red-PR repair idea with the final weekly GitHub Copilot CLI repair lane so Dependabot maintenance stays separate from feature CI while still producing repo-owned superseding PRs for repaired updates.
- Evidence: Replaced `.github/workflows/dependabot-repair-agent.yml` with a weekly scanner plus Copilot repair workflow; added repository custom agent profile `.github/agents/dependabot-repair.agent.md`; rewrote `scripts/dependabot_repair_agent.py` to scan red/manual-review Dependabot PRs, prepare Copilot prompts, and deterministically create superseding PRs plus close original Dependabot PRs after successful repair.

### 2026-04-07
- Type: Validation
- Summary: TASK-116 needed a fourth live follow-up after the safe-lane merge job was counting its own skipped bookkeeping checks as incomplete status signals on PR `#137`.
- Evidence: Patched `.github/workflows/dependabot-auto-triage.yml` so the merge gate evaluates only the repository's required checks instead of every entry in `statusCheckRollup`.

### 2026-04-07
- Type: Validation
- Summary: TASK-116 needed a third live follow-up after the safe-lane merge job still exited early on PR `#137` because GitHub's status rollup lag briefly reported pending checks right after `Quality Gates` completed.
- Evidence: Patched `.github/workflows/dependabot-auto-triage.yml` so only `Quality Gates` completion triggers the merge lane and the merge job now retries the PR rollup for a short consistency window before giving up.

### 2026-04-07
- Type: Validation
- Summary: TASK-116 needed a second live follow-up after the safe-lane merge job rejected PR `#137` because the GitHub CLI surfaced the PR author as `app/dependabot` rather than `dependabot[bot]`.
- Evidence: Patched `.github/workflows/dependabot-auto-triage.yml` so the merge guard accepts both Dependabot author identifiers.

### 2026-04-07
- Type: Validation
- Summary: TASK-116 needed a post-merge workflow follow-up after live Dependabot PRs showed the new auto-triage job was failing because `gh pr edit` was running without a checked-out repository context.
- Evidence: Patched `.github/workflows/dependabot-auto-triage.yml` to check out the base repository before labeling and approving Dependabot PRs.

### 2026-04-07
- Type: Execution
- Summary: TASK-116 moved from deferred hygiene into the active execution queue and gained a bounded scheduled Dependabot repair agent that works only on failing/manual-review PRs through repo-owned superseding branches.
- Evidence: Added `.github/workflows/dependabot-repair-agent.yml` and `scripts/dependabot_repair_agent.py`; updated `tasks/backlog.md`, `tasks/current.md`, `tasks/task-116-ci-maintenance-and-workflow-hygiene.md`, and `README.md`.

### 2026-04-07
- Type: Governance
- Summary: TASK-116 narrowed the Dependabot operating model to grouped safe lanes with auto-approval/auto-merge after green CI, while explicitly keeping majors and high-churn packages in manual review.
- Evidence: Updated `.github/dependabot.yml` with grouped safe npm/GitHub Actions lanes; added `.github/workflows/dependabot-auto-triage.yml`; updated `README.md`, `tasks/current.md`, and `tasks/task-116-ci-maintenance-and-workflow-hygiene.md`.

### 2026-04-07
- Type: Planning
- Summary: TASK-116 now explicitly tracks a second automation tier for failing/manual-review Dependabot PRs: a bounded scheduled repair agent that works only through repo-owned superseding branches and final human review.
- Evidence: Expanded `tasks/current.md` and `tasks/task-116-ci-maintenance-and-workflow-hygiene.md` to distinguish the safe auto-merge lane from the future red-PR repair-agent lane.

### 2026-04-06
- Type: Governance
- Summary: TASK-116 closed the last open Dependabot maintenance queue by treating PR `#123` (ESLint 10) as a deliberate defer and codifying that decision so the next scheduled Dependabot run does not reopen the same blocked major update.
- Evidence: Commented `@dependabot ignore this major version` on PR `#123`; updated `.github/dependabot.yml` to ignore only `eslint` semver-major updates; recorded the compatibility rationale in `tasks/current.md` and `tasks/task-116-ci-maintenance-and-workflow-hygiene.md`.

### 2026-04-06
- Type: Validation
- Summary: TASK-116 Next 16 compatibility follow-through for failing Dependabot PR `#121` reached a locally buildable state after upgrading Next.js, migrating linting to the ESLint CLI, and renaming `middleware.ts` to `proxy.ts` to clear the framework deprecation warning.
- Evidence: `npm install next@^16.2.2`; `npm run lint`; `npx vitest run tests/middleware.test.ts`; `$env:DATABASE_URL='postgresql://user:pass@localhost:5432/postgres'; $env:DIRECT_URL='postgresql://user:pass@127.0.0.1:5433/postgres'; $env:VERCEL_ENV='preview'; $env:RESEND_API_KEY='test-resend-key'; $env:GOOGLE_TOKEN_ENCRYPTION_KEY='0123456789abcdef0123456789abcdef'; $env:AGENT_TOKEN_SIGNING_SECRET='0123456789abcdef0123456789abcdef'; npm run build`; `npm test`.

### 2026-04-06
- Type: Execution
- Summary: TASK-116 started the repo-owned replacement for Dependabot PR `#121` by upgrading Next.js to `16.2.2`, replacing the removed `next lint` command with the ESLint CLI, and migrating the API request-id hook from `middleware.ts` to the Next 16 `proxy.ts` convention.
- Evidence: Updated `package.json`, `package-lock.json`, `proxy.ts`, `tests/middleware.test.ts`, `tsconfig.json`, `tasks/current.md`, and `tasks/task-116-ci-maintenance-and-workflow-hygiene.md` on branch `chore/task-116-next-16-compat`.

### 2026-04-05
- Type: Execution
- Summary: TASK-116 updated the branch-name gate so Dependabot maintenance PRs can pass CI without weakening the stricter naming contract used for human task branches.
- Evidence: Updated `.github/workflows/check-branch-names.yml`, `agent.md`, `README.md`, `tasks/current.md`, and `tasks/task-116-ci-maintenance-and-workflow-hygiene.md`.

### 2026-04-06
- Type: Validation
- Summary: TASK-116 React 19 compatibility follow-through for failing Dependabot PR `#120` reached a locally buildable state after upgrading the React runtime/types plus `@hello-pangea/dnd`, with the only remaining local red signal coming from the existing `jsdom@29.0.1` worker startup issue on Node `20.17.0`.
- Evidence: `npm install react@^19.2.4 react-dom@^19.2.4 @types/react@^19 @types/react-dom@^19 @hello-pangea/dnd@^18.0.1`; `npm run lint`; `$env:DATABASE_URL='postgresql://user:pass@localhost:5432/postgres'; $env:DIRECT_URL='postgresql://user:pass@127.0.0.1:5433/postgres'; $env:VERCEL_ENV='preview'; $env:RESEND_API_KEY='test-resend-key'; $env:GOOGLE_TOKEN_ENCRYPTION_KEY='0123456789abcdef0123456789abcdef'; $env:AGENT_TOKEN_SIGNING_SECRET='0123456789abcdef0123456789abcdef'; npm run build`; `npm test`.

### 2026-04-06
- Type: Execution
- Summary: TASK-116 started the repo-owned replacement for Dependabot PR `#120` by upgrading the app to a coherent React 19 stack, moving `@hello-pangea/dnd` onto its React-19-compatible line, and fixing the first surfaced React-19 typing mismatch in the projects grid options menu.
- Evidence: Updated `package.json`, `package-lock.json`, `app/projects/projects-grid-client.tsx`, `tasks/current.md`, and `tasks/task-116-ci-maintenance-and-workflow-hygiene.md` on branch `chore/task-116-react-19-compat`.

### 2026-04-05
- Type: Governance
- Summary: TASK-049 was refreshed after `TASK-061` / PR `#116` was confirmed merged into `main`; the branch base was corrected and the security assessment remained valid without a full rerun.
- Evidence: Fast-forwarded local `main` to merged `origin/main`; refreshed `fix/task-049-security-assessment` onto that baseline; rechecked the report against the merged dependency/workflow updates in `package.json`, `.github/dependabot.yml`, `.github/workflows/dependency-security.yml`, `lib/services/session-service.ts`, and `lib/auth/api-guard.ts`.

### 2026-04-05
- Type: Execution
- Summary: TASK-049 completed an OWASP-focused security assessment and threat model against the implemented NexusDash surface, confirming strong core tenant/auth controls while ranking the main remaining remediation targets for TASK-050.
- Evidence: Added `tasks/task-049-security-assessment-and-threat-model.md`; updated `tasks/current.md`; primary remediation candidates identified were perimeter abuse controls for public auth/token exchange, hashed session tokens at rest, and immediate-effect agent bearer-token revocation semantics.

### 2026-04-04
- Type: Governance
- Summary: TASK-061 PR follow-through completed with Copilot review addressed and resolved, plus a final CI-only Playwright helper stabilization after the follow-up commit exposed a transient project-creation toast dependency.
- Evidence: PR `#116` (`fix/task-061-dependency-security` -> `main`); addressed Copilot feedback in commit `dd5ba2a`; replied to and resolved review threads `PRRT_kwDORPDIrs542mdj` and `PRRT_kwDORPDIrs542mdn`; stabilized `tests/e2e/helpers/project-helpers.ts` in commit `dede8c9`; final green checks on workflow run `23983234193` (`Quality Core`, `E2E Smoke`, `Container Image`) plus branch-name run `23983234190`.

### 2026-04-04
- Type: Blocker
- Summary: TASK-061 local Playwright reruns remained environment-blocked after the dependency upgrade because Prisma could not reach the expected PostgreSQL fixture service on loopback.
- Evidence: `npx playwright install chromium`; `$env:DATABASE_URL='postgresql://user:pass@127.0.0.1:5432/postgres'; $env:DIRECT_URL='postgresql://user:pass@127.0.0.1:5433/postgres'; $env:VERCEL_ENV='preview'; $env:RESEND_API_KEY='test-resend-key'; $env:GOOGLE_TOKEN_ENCRYPTION_KEY='0123456789abcdef0123456789abcdef'; $env:AGENT_TOKEN_SIGNING_SECRET='0123456789abcdef0123456789abcdef'; npm run test:e2e` rebuilt successfully, then failed because Prisma could not reach `127.0.0.1:5432`.

### 2026-04-04
- Type: Validation
- Summary: TASK-061 dependency-security remediation validated cleanly with zero remaining npm audit findings plus green lint, unit, coverage, and production-build checks after the required framework/toolchain upgrades.
- Evidence: `npm audit --json`; `npm run security:audit`; `npm run lint`; `npm test`; `npm run test:coverage`; `$env:DATABASE_URL='postgresql://user:pass@localhost:5432/postgres'; $env:DIRECT_URL='postgresql://user:pass@127.0.0.1:5433/postgres'; $env:VERCEL_ENV='preview'; $env:RESEND_API_KEY='test-resend-key'; $env:GOOGLE_TOKEN_ENCRYPTION_KEY='0123456789abcdef0123456789abcdef'; $env:AGENT_TOKEN_SIGNING_SECRET='0123456789abcdef0123456789abcdef'; npm run build`.

### 2026-04-04
- Type: Execution
- Summary: TASK-061 remediated the repo's actionable dependency vulnerabilities by upgrading patched direct dependencies, pinning high-risk transitives with overrides, adding scheduled dependency-security automation, and carrying the required Next.js 15 compatibility migration through affected routes/pages/tests.
- Evidence: Updated `package.json`, `package-lock.json`, `.github/dependabot.yml`, `.github/workflows/dependency-security.yml`, `README.md`, `vitest.config.mts`, and the Next.js async-request compatibility changes under `app/**`, `app/api/**`, `lib/auth/**`, and `tests/**`.

### 2026-04-04
- Type: Validation
- Summary: TASK-048 local validation passed after auth hardening and regression expansion, including focused auth suites, full lint/test/coverage, and a production build with safe preview env overrides.
- Evidence: `npx vitest run tests/api/auth-verify-email.route.test.ts tests/lib/email-verification-service.test.ts tests/lib/api-guard.test.ts`; `npx vitest run tests/app/home-auth-actions.test.ts tests/app/verify-email-actions.test.ts tests/api/auth-logout.route.test.ts`; `npm run lint`; `npm test`; `npm run test:coverage`; `$env:DATABASE_URL='postgresql://user:pass@localhost:5432/postgres'; $env:DIRECT_URL='postgresql://user:pass@127.0.0.1:5433/postgres'; $env:VERCEL_ENV='preview'; $env:RESEND_API_KEY='test-resend-key'; $env:GOOGLE_TOKEN_ENCRYPTION_KEY='0123456789abcdef0123456789abcdef'; $env:AGENT_TOKEN_SIGNING_SECRET='0123456789abcdef0123456789abcdef'; npm run build`.

### 2026-04-04
- Type: Execution
- Summary: TASK-048 hardened the auth surface by preventing signed-in verification-link account mismatches from consuming tokens, then expanded regression coverage around auth redirect normalization and production-only verification enforcement failure handling.
- Evidence: Updated `app/api/auth/verify-email/route.ts` and `lib/services/email-verification-service.ts`; expanded auth regressions in `tests/api/auth-verify-email.route.test.ts`, `tests/lib/email-verification-service.test.ts`, `tests/lib/api-guard.test.ts`, `tests/app/home-auth-actions.test.ts`, `tests/app/verify-email-actions.test.ts`, and `tests/api/auth-logout.route.test.ts`; updated task tracking in `tasks/current.md` and `tasks/task-048-auth-tests-and-hardening.md`.

### 2026-04-04
- Type: Validation
- Summary: TASK-059 merge-refresh validation passed locally after folding the latest `origin/main` into the agent-access branch and refreshing the generated Prisma client in this checkout.
- Evidence: `npx prisma generate`; `npm run lint`; `npm test`; `$env:DATABASE_URL='postgresql://user:pass@localhost:5432/postgres'; $env:DIRECT_URL='postgresql://user:pass@127.0.0.1:5433/postgres'; $env:VERCEL_ENV='preview'; $env:RESEND_API_KEY='test-resend-key'; $env:GOOGLE_TOKEN_ENCRYPTION_KEY='0123456789abcdef0123456789abcdef'; $env:AGENT_TOKEN_SIGNING_SECRET='0123456789abcdef0123456789abcdef'; npm run build`.

### 2026-04-04
- Type: Governance
- Summary: TASK-059 was rebased in practice through a merge-refresh with the latest `main` after TASK-115 had already been folded into the branch, resolving task-tracking conflicts and restoring a clean branch state for mergeability assessment.
- Evidence: Merged `origin/main` into `feature/task-059-agent-access`; resolved conflicts in `tasks/backlog.md`, `tasks/current.md`, and `journal.md`; retained TASK-059 as the active branch task while recording TASK-115 as completed and included in the rollout envelope.

### 2026-04-01
- Type: Validation
- Summary: TASK-115 local validation passed for lint, unit tests, coverage, and production build after adding the hosted agent docs surface, OpenAPI JSON route, account-level developer onboarding, and project-level quickstart UX.
- Evidence: `npm run lint`; `npm test`; `npm run test:coverage`; `npx vitest run tests/api/agent-openapi.route.test.ts tests/components/agent-onboarding-guide.test.ts`; `$env:DATABASE_URL='postgresql://user:pass@localhost:5432/postgres'; $env:DIRECT_URL='postgresql://user:pass@127.0.0.1:5433/postgres'; $env:VERCEL_ENV='preview'; $env:RESEND_API_KEY='test-resend-key'; $env:GOOGLE_TOKEN_ENCRYPTION_KEY='0123456789abcdef0123456789abcdef'; $env:AGENT_TOKEN_SIGNING_SECRET='0123456789abcdef0123456789abcdef'; npm run build`.

### 2026-04-01
- Type: Execution
- Summary: TASK-115 delivered agent onboarding v1 with a hosted docs page, machine-readable OpenAPI contract, account-level developer entry, and project-level bootstrap guidance layered directly onto the existing agent credential model.
- Evidence: Added onboarding contract helpers in `lib/agent-onboarding.ts`; added docs surfaces in `app/docs/agent/v1/page.tsx`, `app/api/docs/agent/v1/openapi.json/route.ts`, and `components/agent-onboarding/agent-onboarding-guide.tsx`; added account developer entry in `components/account/account-settings-shell.tsx`, `app/account/settings/page.tsx`, and `app/account/settings/developers/page.tsx`; extended project onboarding in `components/project-dashboard/project-dashboard-owner-agent-access-panel.tsx` and `components/project-dashboard/project-dashboard-owner-actions.tsx`; added regression coverage in `tests/api/agent-openapi.route.test.ts` and `tests/components/agent-onboarding-guide.test.ts`; updated task docs in `project.md` and `tasks/task-115-agent-onboarding-v1.md`.

### 2026-03-31
- Type: Validation
- Summary: TASK-059 preview validation passed end to end on the branch-scoped preview after fixing both the missing runtime signing secret path and the token-exchange owner lookup, and the disposable validation data was cleaned up afterward.
- Evidence: `npx vercel curl / --deployment https://nexus-dash-dorianagaesse-3732-dorian-agaesses-projects.vercel.app -- --include`; `npx vercel curl /api/health/live --deployment https://nexus-dash-dorianagaesse-3732-dorian-agaesses-projects.vercel.app -- --include`; preview deploy workflow run `23811221988`; live assertions captured in `docs/runbooks/task-059-agent-access-preview-validation.md`; preview validation covered owner credential create/list/rotate/revoke, token exchange, project read, task create/read/update with delete denial, context create/read/update with delete denial, and audit visibility; corrected the context-card test payload to use a valid color from `lib/context-card-colors.ts` (`#DFF3F9`); removed disposable preview users matching `task059-preview-*@nexusdash.local` after sign-off.

### 2026-03-31
- Type: Governance
- Summary: The repo's task execution contract now requires auth/deploy/integration work to spell out local prerequisites, runtime secrets, and deploy/review assumptions directly in the active task brief before deep implementation.
- Evidence: Updated `agent.md`, `tasks/task-059-agent-access-implementation.md`, `tasks/current.md`, and `docs/runbooks/task-059-agent-access-preview-validation.md`.

### 2026-03-31
- Type: Governance
- Summary: TASK-059 PR review and deploy follow-through completed on the latest feature-branch head: Copilot's three review comments were assessed, addressed, replied to, and resolved; the refreshed PR checks are green; and a branch-scoped preview deployment was created successfully from the final task branch ref.
- Evidence: PR `#112` (`feature/task-059-agent-access` -> `main`); addressed Copilot feedback in commits `fcbd615` and `1939839`; replied to and resolved review threads `PRRT_kwDORPDIrs5394bk`, `PRRT_kwDORPDIrs5394ch`, and `PRRT_kwDORPDIrs5394c7`; green latest-head checks on run `23801288613` (`check-name`, `Quality Core`, `E2E Smoke`, `Container Image`); preview deploy workflow run `23801489971` dispatched with `--ref feature/task-059-agent-access -f action=deploy-preview -f git_ref=feature/task-059-agent-access` and produced preview URL `https://nexus-dash-7cs7imdfe-dorian-agaesses-projects.vercel.app`.

### 2026-03-31
- Type: Governance
- Summary: TASK-059 preview-runtime follow-up fixed the missing agent signing secret path that caused Vercel preview aliases to return `500` on `/`.
- Evidence: Confirmed Vercel Preview was missing `AGENT_TOKEN_SIGNING_SECRET` via `npx vercel env ls preview`; updated `.github/workflows/deploy-vercel.yml` so manual preview deploys pass `RESEND_API_KEY` and `AGENT_TOKEN_SIGNING_SECRET` as deployment runtime env values; clarified the requirement in `docs/runbooks/vercel-env-contract-and-secrets.md` and `README.md`.

### 2026-03-31
- Type: Blocker
- Summary: TASK-059 Playwright end-to-end validation is still blocked in this environment because the local PostgreSQL service required by the test fixtures is unreachable at the configured loopback address.
- Evidence: `$env:DATABASE_URL='postgresql://user:pass@127.0.0.1:5432/postgres'; $env:DIRECT_URL='postgresql://user:pass@127.0.0.1:5433/postgres'; $env:VERCEL_ENV='preview'; $env:RESEND_API_KEY='test-resend-key'; $env:GOOGLE_TOKEN_ENCRYPTION_KEY='0123456789abcdef0123456789abcdef'; $env:AGENT_TOKEN_SIGNING_SECRET='0123456789abcdef0123456789abcdef'; npm run test:e2e` rebuilt successfully, then all 6 Playwright specs failed with `PrismaClientInitializationError: Can't reach database server at 127.0.0.1:5432` from `tests/e2e/password-recovery.spec.ts` and `tests/e2e/helpers/auth-helpers.ts`.

### 2026-03-31
- Type: Validation
- Summary: TASK-059 local validation baseline passed for lint, unit tests, coverage, and production build after adding the agent-token signing configuration and using safe env overrides for deploy-sensitive settings.
- Evidence: `npm run lint`; `npm test`; `npm run test:coverage`; `$env:DATABASE_URL='postgresql://user:pass@localhost:5432/postgres'; $env:DIRECT_URL='postgresql://user:pass@127.0.0.1:5433/postgres'; $env:VERCEL_ENV='preview'; $env:RESEND_API_KEY='test-resend-key'; $env:GOOGLE_TOKEN_ENCRYPTION_KEY='0123456789abcdef0123456789abcdef'; $env:AGENT_TOKEN_SIGNING_SECRET='0123456789abcdef0123456789abcdef'; npm run build`.

### 2026-03-31
- Type: Execution
- Summary: TASK-059 agent access v1 was implemented end-to-end with owner-managed project credentials, short-lived bearer-token exchange, scoped API authorization, audit logging, owner UI controls, workflow/env wiring, and task-aligned regression coverage.
- Evidence: Added agent auth persistence in `prisma/schema.prisma` and `prisma/migrations/20260331153000_task059_agent_access_v1/migration.sql`; added token exchange and project agent-access routes in `app/api/auth/agent/token/route.ts` and `app/api/projects/[projectId]/agent-access/**`; extended bearer-aware guards and scoped service enforcement in `lib/auth/api-guard.ts`, `lib/auth/agent-token-service.ts`, `lib/services/project-agent-access-service.ts`, `lib/services/project-access-service.ts`, `lib/services/project-task-service.ts`, `lib/services/context-card-service.ts`, and `lib/services/project-service.ts`; shipped owner controls in `components/project-dashboard/project-dashboard-owner-actions.tsx` and `components/project-dashboard/project-dashboard-owner-agent-access-panel.tsx`; updated workflow/env/docs coverage in `.github/workflows/quality-gates.yml`, `.github/workflows/deploy-vercel.yml`, `.env.example`, `README.md`, `project.md`, `adr/decisions.md`, `tasks/backlog.md`, and `tasks/current.md`; added regressions in `tests/api/agent-token.route.test.ts`, `tests/api/project-agent-access.route.test.ts`, `tests/api/agent-project-routes.test.ts`, `tests/lib/agent-token-service.test.ts`, `tests/lib/project-access-service.test.ts`, and `tests/components/project-dashboard-owner-agent-access-panel.test.tsx`.

### 2026-03-31
- Type: Validation
- Summary: TASK-113 token widget hardening validated after making the editor-only token shell non-editable and preserving toolbar toggle behavior for a focused token input.
- Evidence: `npm run lint`; `npm test`; `npm run build` with temporary `DIRECT_URL` + `GOOGLE_TOKEN_ENCRYPTION_KEY` overrides; expanded `tests/components/rich-text-editor.test.ts` with atomic-token-shell and focused-toggle coverage.

### 2026-03-31
- Type: Execution
- Summary: TASK-113 follow-up fixed the remaining token re-entry regression by marking the editor-only token shell as non-editable while letting the input remain the sole editable surface inside it.
- Evidence: Updated `components/rich-text-editor.tsx` to set token shells `contenteditable=false`, resolve active structured blocks from the focused token input for toolbar toggle behavior, and keep token re-entry routed to the input caret instead of an editable wrapper.

### 2026-03-31
- Type: Validation
- Summary: TASK-113 token editor rebuild validated after replacing the masked contentEditable token surface with a real single-line input in edit mode.
- Evidence: `npm run lint`; `npm test`; `npm run build` with temporary `DIRECT_URL` + `GOOGLE_TOKEN_ENCRYPTION_KEY` overrides; refreshed `tests/components/rich-text-editor.test.ts` token-caret and recovery coverage against the input-based shell.

### 2026-03-31
- Type: Execution
- Summary: TASK-113 token-block follow-up replaced the editor-only masked token row with an input-backed shell after screenshots confirmed Chromium was still rewriting the contentEditable token row and dropping its action buttons.
- Evidence: Updated `components/rich-text-editor.tsx` so token blocks render as single-line input controls with reveal/copy actions, serialize through the live input value, and re-enter at the input caret instead of a masked code node; refreshed `tests/components/rich-text-editor.test.ts`.

### 2026-03-30
- Type: Validation
- Summary: TASK-113 token re-entry hardening validated after extending the structured-block navigation guard across the browser's delayed input phase.
- Evidence: `npm run lint`; `npm test`; `npm run build` with temporary `DIRECT_URL` + `GOOGLE_TOKEN_ENCRYPTION_KEY` overrides; added token-specific recovery coverage in `tests/components/rich-text-editor.test.ts`.

### 2026-03-30
- Type: Execution
- Summary: TASK-113 follow-up fixed the token-only trailing-block regression by extending the caret-navigation guard across the browser's delayed input phase instead of only the initial keydown.
- Evidence: Updated `components/rich-text-editor.tsx` to keep a short-lived structured-block navigation lock, prevent `beforeinput` while that lock is active, and restore canonical token shells if a transient input mutation still fires; added token-specific regression coverage in `tests/components/rich-text-editor.test.ts`.

### 2026-03-29
- Type: Validation
- Summary: TASK-113 token-block Enter-navigation fix validated after removing the custom undo shortcut experiment and guarding against transient browser DOM edits during caret-only navigation.
- Evidence: `npm run lint`; `npx vitest run tests/components/rich-text-editor.test.ts tests/components/rich-text-content.test.ts tests/lib/rich-text.test.ts`; `npm test`; `npm run build` with temporary `DIRECT_URL` + `GOOGLE_TOKEN_ENCRYPTION_KEY` overrides.

### 2026-03-29
- Type: Execution
- Summary: TASK-113 follow-up removed the unstable custom undo/redo shortcut layer and hardened trailing token-block Enter navigation so Chrome-only transient mutations cannot strip token actions.
- Evidence: Updated `components/rich-text-editor.tsx` to treat Enter-from-below as deferred caret navigation back into the trailing structured block, ignore/reset transient DOM mutations during that navigation, and remove custom `Ctrl+Z` / redo handling; updated `tests/components/rich-text-editor.test.ts` to assert caret movement into block ends with controls preserved.

### 2026-03-28
- Type: Validation
- Summary: TASK-113 rich-text control-layer hardening validated after preserving browser undo/selection state for semantically unchanged editor content.
- Evidence: `npm run lint`; `npm test`; `npm run build` with temporary `DIRECT_URL` + `GOOGLE_TOKEN_ENCRYPTION_KEY` overrides; expanded `tests/components/rich-text-editor.test.ts` with caret-anchor assertions and undo shortcut coverage.

### 2026-03-28
- Type: Execution
- Summary: TASK-113 follow-up fixed the long-running block-exit regression by stopping unnecessary controlled-editor DOM rewrites and adding native undo/redo shortcut handling.
- Evidence: Updated `components/rich-text-editor.tsx` to keep hidden caret anchors in editor-only trailing paragraphs, compare incoming prop updates semantically before resetting `innerHTML`, and support `Ctrl+Z` / `Ctrl+Shift+Z` / `Ctrl+Y`; refreshed `tests/components/rich-text-editor.test.ts` with caret-anchor and shortcut coverage.

### 2026-03-28
- Type: Validation
- Summary: TASK-113 caret-anchor hardening validated after replacing editor-only empty trailing paragraphs with stable hidden cursor anchors below structured blocks.
- Evidence: `npm run lint`; `npm test`; `npm run build` with temporary `DIRECT_URL` + `GOOGLE_TOKEN_ENCRYPTION_KEY` overrides; editor regressions remained green in `tests/components/rich-text-editor.test.ts`.

### 2026-03-28
- Type: Execution
- Summary: TASK-113 follow-up replaced fragile empty `<p><br></p>` editor-only trailing lines with hidden caret anchors to stop real-browser Enter flows from jumping back to the start of earlier code/token blocks.
- Evidence: Updated `components/rich-text-editor.tsx` so editor-only trailing paragraphs use a zero-width caret anchor that is stripped during serialization/build normalization; kept token overflow styling discreet in both `components/rich-text-editor.tsx` and `components/rich-text-content.tsx`.

### 2026-03-28
- Type: Validation
- Summary: TASK-113 block-navigation fix validated after removing navigation-only rich-text resyncs and softening token overflow chrome.
- Evidence: `npm run lint`; `npm test`; `npm run build` with temporary `DIRECT_URL` + `GOOGLE_TOKEN_ENCRYPTION_KEY` overrides; expanded `tests/components/rich-text-editor.test.ts` to cover Enter-from-below behavior for both token and code blocks.

### 2026-03-28
- Type: Execution
- Summary: TASK-113 follow-up fixed the remaining structured-block caret regression by separating caret navigation from content persistence inside the controlled editor.
- Evidence: Updated `components/rich-text-editor.tsx` so Enter exits from token/code and blank trailing paragraphs no longer call `onChange` unless content actually changes; refreshed token overflow styling in `components/rich-text-editor.tsx` and `components/rich-text-content.tsx`; expanded regression coverage in `tests/components/rich-text-editor.test.ts`.

### 2026-03-28
- Type: Validation
- Summary: TASK-113 rich-text editor line-scoping and caret-flow fixes validated after tightening current-line code transforms and post-block cursor placement.
- Evidence: `npm run lint`; `npm test`; `npm run build` with temporary `DIRECT_URL` + `GOOGLE_TOKEN_ENCRYPTION_KEY` overrides; added regression coverage in `tests/components/rich-text-editor.test.ts`.

### 2026-03-28
- Type: Execution
- Summary: TASK-113 follow-up corrected code wrapping and block-exit ergonomics so structured blocks stay contained and line-local in the editor.
- Evidence: Updated `components/rich-text-editor.tsx` to wrap long code lines, scope no-selection `Code` transforms to the current visual line, and place the caret in the writable paragraph below code/token blocks; updated `components/rich-text-content.tsx` to wrap code content in read mode; added component-level regression coverage in `tests/components/rich-text-editor.test.ts`.

### 2026-03-28
- Type: Validation
- Summary: TASK-113 second UX correction pass validated after tightening structured-block toggling, editor overflow handling, and confidential token rendering behavior.
- Evidence: `npm run lint`; `npm test`; `npm run build` with temporary `DIRECT_URL` + `GOOGLE_TOKEN_ENCRYPTION_KEY` overrides.

### 2026-03-28
- Type: Execution
- Summary: TASK-113 second UX correction pass aligned code/token editing with the intended block-toggle interaction model inside the rich-text editor.
- Evidence: Reworked `components/rich-text-editor.tsx` so code/token blocks render with editor-only chrome, copy/reveal actions, toggle-on/off behavior, and Enter/Shift+Enter block flow; refreshed `components/rich-text-content.tsx` to use the same neutral block styling with icon-only controls; updated `lib/rich-text.ts` so new token blocks store value-only markup by default; refreshed renderer and rich-text tests accordingly.

### 2026-03-28
- Type: Validation
- Summary: TASK-113 follow-up rich-content UX pass validated locally after replacing prompt-based code/token insertion with selection-aware formatting and confidential token rendering.
- Evidence: `npm run lint`; `npm test`; `npm run build` with temporary `DIRECT_URL` + `GOOGLE_TOKEN_ENCRYPTION_KEY` overrides.

### 2026-03-28
- Type: Execution
- Summary: TASK-113 follow-up aligned code/token behavior with the intended editor and read-surface UX.
- Evidence: Updated `components/rich-text-editor.tsx` so `Code` and `Token` transform the current line or current selection without browser prompts, refreshed `components/rich-text-content.tsx` with Consolas-styled code surfaces plus hidden-by-default token blocks with reveal/copy actions, and redacted token values from preview summaries in `lib/rich-text.ts` with supporting test updates.

### 2026-03-27
- Type: Validation
- Summary: TASK-113 follow-up validation passed after addressing Copilot review feedback and adding renderer-focused component coverage.
- Evidence: Re-ran `npm run lint`; `npm test`; `npm run test:coverage`; `npm run build` with temporary `DIRECT_URL` + `GOOGLE_TOKEN_ENCRYPTION_KEY` overrides; `npx playwright test` against a production `next start` server using the real `.env` `DATABASE_URL` plus the same minimal overrides.

### 2026-03-27
- Type: Execution
- Summary: TASK-113 follow-up changes addressed Copilot feedback around renderer overhead, clipboard fallbacks, and missing tests.
- Evidence: Updated `components/rich-text-content.tsx` to short-circuit plain content and omit copy controls when clipboard support is unavailable; added renderer coverage in `tests/components/rich-text-content.test.ts`; added `jsdom` dev support in `package.json` / `package-lock.json` so the new component tests run inside Vitest.

### 2026-03-27
- Type: Validation
- Summary: TASK-113 local validation baseline passed, including browser smoke coverage against the real runtime database with minimal safe env overrides for the local production-build contract.
- Evidence: `npm run lint`; `npm test`; `npm run test:coverage`; `npm run build` with temporary `DIRECT_URL` + `GOOGLE_TOKEN_ENCRYPTION_KEY` overrides; `npx playwright test` against a production `next start` server using the real `.env` `DATABASE_URL` plus the same minimal overrides.

### 2026-03-27
- Type: Execution
- Summary: TASK-113 implemented rich-content readability upgrades across task/context authoring, rendering, and Kanban previews.
- Evidence: Extended `lib/rich-text.ts` with lightweight code/token block support plus richer preview summarization, added shared copyable rich-content rendering in `components/rich-text-content.tsx`, updated `components/rich-text-editor.tsx` for code/token authoring, hid emoji field controls until focus in `components/ui/emoji-field.tsx`, and wired the richer renderer/preview flow through task detail plus context card surfaces.

### 2026-03-27
- Type: Validation
- Summary: TASK-112 local validation baseline passed for the attachment-link interaction polish after updating the smoke flow to exercise Enter-to-add with the new add affordance.
- Evidence: `npm run lint`; `npm test`; `npm run test:coverage`; `$env:DIRECT_URL='postgresql://localhost:5432/nexusdash_validation'; $env:GOOGLE_TOKEN_ENCRYPTION_KEY='codex-temporary-google-token-key'; $env:VERCEL_ENV='preview'; npm run build`; `$env:DIRECT_URL='postgresql://localhost:5432/nexusdash_validation'; $env:GOOGLE_TOKEN_ENCRYPTION_KEY='codex-temporary-google-token-key'; $env:VERCEL_ENV='preview'; npm run test:e2e`.

### 2026-03-27
- Type: Execution
- Summary: TASK-112 was implemented across task and context-card attachment flows by replacing the confirm-link icon with an add-oriented action and restoring Enter-to-add behavior in each link composer.
- Evidence: Updated `components/create-task-dialog.tsx`, `components/kanban/task-detail-modal.tsx`, `components/context-panel/context-create-modal.tsx`, and `components/context-panel/context-edit-modal.tsx`; aligned smoke coverage in `tests/e2e/smoke-project-task-calendar.spec.ts`; rotated `tasks/current.md` to TASK-112.

### 2026-03-27
- Type: Planning
- Summary: Closed TASK-103 in backlog tracking, added deferred follow-up ideas provided by the user, and drafted the first implementation brief for TASK-059 around project-scoped agent credentials, short-lived bearer tokens, scope enforcement, and audit-trail concerns.
- Evidence: Updated `tasks/backlog.md` and replaced `tasks/current.md`; refreshed `project.md` and `README.md` so the merged collaboration/email-auth state and next-priority task view match the repository's actual state.

### 2026-03-25
- Type: Execution
- Summary: Refined the TASK-103 owner email-invite composer so exact verified-user email matches no longer duplicate the raw email row, and newly created direct-email invites now stay inline as copy-on-demand links instead of auto-copying the clipboard.
- Evidence: Updated `components/project-dashboard/project-dashboard-owner-actions.tsx` to retain the latest direct-email invite link in local state and clear it safely on query changes/revoke; updated `components/project-dashboard/project-dashboard-owner-sharing-panel.tsx` to suppress duplicate exact-match email cards and render an inline read-only link row with copy action; expanded render coverage in `tests/components/project-dashboard-owner-sharing-panel.test.tsx`; revalidated with `npm run lint`, `npm test`, `npm run test:coverage`, and safe-override `npm run build`.

### 2026-03-24
- Type: Execution
- Summary: Streamlined the TASK-103 owner email-invite UX so typed email invites create and copy the invite link in one step instead of requiring a second action in the pending list.
- Evidence: Updated `components/project-dashboard/project-dashboard-owner-actions.tsx` to copy the newly created invite link from the API response immediately; updated `components/project-dashboard/project-dashboard-owner-sharing-panel.tsx` CTA copy and Enter-key behavior; added render coverage in `tests/components/project-dashboard-owner-sharing-panel.test.tsx`; revalidated with `npm run lint`, `npm test`, `npm run test:coverage`, and safe-override `npm run build`.

### 2026-03-24
- Type: Governance
- Summary: TASK-103 PR review/deploy follow-through completed: Copilot comments were addressed and resolved, PR checks are green, and a branch preview deployment was created successfully.
- Evidence: PR `#104` (`feature/task-103-email-bound-project-invites` -> `main`); addressed Copilot threads by adding RLS-safe invite landing lookup in commit `41122b0`; resolved both review threads; green checks on latest head (`check-name`, `Quality Core`, `E2E Smoke`, `Container Image`); preview deploy workflow run `23466059292` succeeded with preview URL `https://nexus-dash-8mvbmjmgm-dorian-agaesses-projects.vercel.app`.

### 2026-03-24
- Type: Execution
- Summary: TASK-103 project sharing v2 was implemented end-to-end with email-bound invitations, copyable invite-link delivery, and recipient resume flows across sign-in, sign-up, verification, and wrong-account states.
- Evidence: Reworked invitation persistence in `prisma/schema.prisma` and `prisma/migrations/20260324110000_task103_email_bound_project_invites/migration.sql`; rewrote invite lifecycle handling in `lib/services/project-collaboration-service.ts`; added invite landing/actions in `app/invite/project/[invitationId]/page.tsx` and `app/invite/project/[invitationId]/actions.ts`; updated owner sharing UI in `components/project-dashboard/project-dashboard-owner-actions.tsx` and `components/project-dashboard/project-dashboard-owner-sharing-panel.tsx`; threaded auth/verification return paths through `app/page.tsx`, `app/home-auth-actions.ts`, `app/verify-email/**`, and `app/api/auth/verify-email/route.ts`.

### 2026-03-24
- Type: Validation
- Summary: TASK-103 local validation baseline passed for lint, unit tests, coverage, and production build after using safe env overrides for deploy-sensitive configuration.
- Evidence: `npm run lint`; `npm test`; `npm run test:coverage`; `$env:DATABASE_URL='postgresql://user:pass@127.0.0.1:5432/postgres?sslmode=require'; $env:DIRECT_URL='postgresql://user:pass@127.0.0.1:5433/postgres?sslmode=require'; $env:RESEND_API_KEY='test-resend-key'; $env:GOOGLE_TOKEN_ENCRYPTION_KEY='0123456789abcdef0123456789abcdef'; npm run build`.

### 2026-03-24
- Type: Blocker
- Summary: TASK-103 Playwright e2e validation could not complete in this environment because the local PostgreSQL service required by the test fixtures is unreachable.
- Evidence: `$env:DATABASE_URL='postgresql://user:pass@127.0.0.1:5432/postgres?sslmode=require'; $env:DIRECT_URL='postgresql://user:pass@127.0.0.1:5433/postgres?sslmode=require'; $env:RESEND_API_KEY='test-resend-key'; $env:GOOGLE_TOKEN_ENCRYPTION_KEY='0123456789abcdef0123456789abcdef'; npm run test:e2e` built successfully, then all 5 Playwright specs failed with `PrismaClientInitializationError: Can't reach database server at 127.0.0.1:5432` from `tests/e2e/helpers/auth-helpers.ts` and `tests/e2e/password-recovery.spec.ts`.

### 2026-03-23
- Type: Governance
- Summary: TASK-058 post-implementation cleanup removed preview-only debug scaffolding, split the owner settings surface into smaller modules, and recorded follow-up work for task ownership/provenance plus later collaboration-service modularization.
- Evidence: Removed `app/api/debug/invitation-state/route.ts`; split `components/project-dashboard/project-dashboard-owner-actions.tsx` into dedicated general/sharing/shared modules; updated `tasks/backlog.md` with `TASK-101` and `TASK-102`; validated with `npm run lint`, `npm test`, safe-override `npm run build`, and preview deploy `https://nexus-dash-phbquqj8t-dorian-agaesses-projects.vercel.app`.

### 2026-03-20
- Type: Governance
- Summary: Merged `origin/main` after PR `#100` landed, resolved task-tracking doc conflicts, and addressed Copilot feedback on invitation idempotency and invitation-row update integrity.
- Evidence: Updated `lib/services/project-collaboration-service.ts` to make invitation accept/decline race-safe; tightened invitation update policies in `prisma/migrations/20260320110000_task058_project_invitations/migration.sql`; added regression coverage in `tests/lib/project-collaboration-service.test.ts`; revalidated with `npm run lint`, `npm test`, `npm run test:coverage`, and safe-override `npm run build`.

### 2026-03-20
- Type: Execution
- Summary: TASK-058 collaboration v1 was implemented end-to-end across schema, services, API routes, account/project UI, and role-aware project surfaces.
- Evidence: Added `ProjectInvitation` schema + migration in `prisma/schema.prisma` and `prisma/migrations/20260320110000_task058_project_invitations/migration.sql`; added collaboration service/API flow in `lib/services/project-collaboration-service.ts` and `app/api/projects/[projectId]/sharing/**`; added owner-facing sharing/settings UI in `components/project-dashboard/project-dashboard-owner-actions.tsx`; added recipient invitation visibility/actions in `app/account/page.tsx`, `app/account/actions.ts`, `components/account-menu.tsx`, and `components/pending-project-invitations-banner.tsx`; enforced role-aware edit gating in project dashboard panels and calendar access.

### 2026-03-20
- Type: Validation
- Summary: TASK-058 local unit validation passed after integrating sharing routes, invitation actions, and calendar role gating.
- Evidence: `npm test` (pass, 57 files / 402 tests); added targeted coverage in `tests/api/project-sharing.route.test.ts`, `tests/api/project-sharing-search.route.test.ts`, `tests/app/account-actions.test.ts`, and `tests/components/account-menu.test.ts`.

### 2026-03-20
- Type: Validation
- Summary: TASK-058 validation baseline passed for lint, unit tests, coverage, and production build after using safe env overrides to avoid the local `.env` database hardening mismatch.
- Evidence: `npm run lint`; `npm test`; `npm run test:coverage`; `$env:DATABASE_URL='postgresql://user:pass@127.0.0.1:5432/postgres?sslmode=require'; $env:DIRECT_URL='postgresql://user:pass@127.0.0.1:5433/postgres?sslmode=require'; $env:RESEND_API_KEY='test-resend-key'; $env:GOOGLE_TOKEN_ENCRYPTION_KEY='0123456789abcdef0123456789abcdef'; npm run build`.

### 2026-03-20
- Type: Blocker
- Summary: TASK-058 Playwright e2e validation could not complete in this environment because the local PostgreSQL service required by the test fixtures is unreachable.
- Evidence: `$env:DATABASE_URL='postgresql://user:pass@127.0.0.1:5432/postgres?sslmode=require'; $env:DIRECT_URL='postgresql://user:pass@127.0.0.1:5433/postgres?sslmode=require'; ...; npm run test:e2e` built successfully, then all 5 Playwright specs failed with `PrismaClientInitializationError: Can't reach database server at 127.0.0.1:5432` from `tests/e2e/helpers/auth-helpers.ts` and `tests/e2e/password-recovery.spec.ts`.
### 2026-03-19
- Type: Governance
- Summary: Refreshed repository execution guidance and task tracking after verifying completed work in git history, including closure of TASK-096 and rotation of the active task to TASK-058.
- Evidence: Updated `agent.md`, `tasks/backlog.md`, and `tasks/current.md` after confirming `TASK-096` was integrated through commit `b20d4af` / PR `#97`.

### 2026-03-19
- Type: Governance
- Summary: Added a dedicated mobile UI/UX refinement follow-up task and clarified that PR monitoring continues until Copilot produces its initial review outcome, even when no inline comments are generated.
- Evidence: Updated `tasks/backlog.md` with `TASK-100` and tightened the PR monitoring rule in `agent.md` while PR `#100` remained active.

### 2026-03-19
- Type: Governance
- Summary: Clarified the repository review workflow so a Copilot overview review with no comments is explicitly treated as a clean state with no follow-up work required.
- Evidence: Updated `agent.md` on branch `docs/agent-task-tracking-refresh` while PR `#100` was open.

### 2026-03-09
- Type: Execution
- Summary: TASK-085 Phase 2 implemented with FORCE-RLS migration on the protected table set and branch hygiene update for local preview artifacts.
- Evidence: Added `prisma/migrations/20260309113000_task085_rls_phase2_force/migration.sql`; updated `.gitignore` to ignore `/.tmp/`; committed on branch `feature/task-085-force-rls-preview` in commit `ba03299` (`feat(task-085): force row-level security in preview phase`).

### 2026-03-09
- Type: Validation
- Summary: TASK-085 Phase 2 local validation baseline and preview validation matrix passed with FORCE-RLS enabled.
- Evidence: Local checks passed: `npm run lint`; `npm test`; `npm run test:coverage`; `npm run build` with safe overrides for `DATABASE_URL`, `DIRECT_URL`, `RESEND_API_KEY`, and `GOOGLE_TOKEN_ENCRYPTION_KEY`. Preview deploy workflow run `22864249355` succeeded for `feature/task-085-force-rls-preview`, preview URL `https://nexus-dash-q3ao1evui-dorian-agaesses-projects.vercel.app`. Verified `/api/health/ready`, owner project create/access, contributor (`editor`) task create/update success, contributor delete denied (`403`), non-member denied via not-found boundary, and `GoogleCalendarCredential` remained user-scoped under actor-context queries.

### 2026-03-09
- Type: Governance
- Summary: TASK-085 Phase 2 draft PR opened against `main` for review and later rollout coordination.
- Evidence: PR `#90` (`feature/task-085-force-rls-preview` -> `main`), URL: `https://github.com/dorianagaesse/nexus_dash/pull/90`.

### 2026-03-05
- Type: Execution
- Summary: TASK-085 phase 1 implemented end-to-end in code and migration layer.
- Evidence: Added migration `prisma/migrations/20260305173000_task085_rls_phase1_enable_policies/migration.sql`; added actor-context helper `lib/services/rls-context.ts`; refactored protected services (`lib/services/project-service.ts`, `lib/services/project-task-service.ts`, `lib/services/context-card-service.ts`, `lib/services/project-attachment-service.ts`, `lib/services/project-access-service.ts`, `lib/services/google-calendar-credential-service.ts`) to run RLS-protected queries within transaction-scoped actor context.

### 2026-03-05
- Type: Validation
- Summary: TASK-085 phase 1 validation baseline passed locally after refactor.
- Evidence: `npm run lint`; `npm test`; `npm run test:coverage`; `DATABASE_URL=postgresql://user:pass@127.0.0.1:5432/postgres?sslmode=require DIRECT_URL=postgresql://user:pass@127.0.0.1:5433/postgres?sslmode=require RESEND_API_KEY=test-resend-key npm run build`.

### 2026-03-04
- Type: Execution
- Summary: ISSUE-081 implemented 4-digit numeric username discriminator contract across policy, identity services, schema, and UI preview.
- Evidence: Updated `lib/services/account-security-policy.ts` (numeric generator + discriminator validator), sanitized legacy invalid discriminator values in `lib/services/account-profile-service.ts` and `lib/services/account-identity-service.ts`, updated signup suffix preview in `app/home-signup-live-feedback.tsx`, and added migration `prisma/migrations/20260304221000_task092_username_discriminator_numeric4/migration.sql` plus schema update in `prisma/schema.prisma`.

### 2026-03-04
- Type: Validation
- Summary: ISSUE-081 local validation baseline passed for lint/unit/coverage/build; e2e could not complete due missing local PostgreSQL service.
- Evidence: `npm run lint`; `npm test`; `npm run test:coverage`; `npx prisma generate`; `DATABASE_URL=... DIRECT_URL=... RESEND_API_KEY=... GOOGLE_TOKEN_ENCRYPTION_KEY=... npm run build` (pass). Installed Playwright browser via `npx playwright install chromium`; `npm run test:e2e` failed because Prisma could not reach `localhost:5432` in this environment.

### 2026-03-04
- Type: Governance
- Summary: ISSUE-081 PR opened for review and CI checks.
- Evidence: PR `#85` (`fix/username-discriminator-4-digits` -> `main`), URL: `https://github.com/dorianagaesse/nexus_dash/pull/85`.

### 2026-03-04
- Type: Execution
- Summary: Addressed Copilot review feedback for ISSUE-081 with retry exhaustion handling and shared discriminator constants.
- Evidence: Added shared client-safe constants/helper in `lib/username-discriminator.ts`; updated `lib/services/account-security-policy.ts` and `app/home-signup-live-feedback.tsx` to consume shared discriminator config; updated `signUpWithEmailPassword` in `lib/services/credential-auth-service.ts` to return `username-in-use` when collision retry budget is exhausted; aligned e2e helper formatting to left-padding in `tests/e2e/helpers/auth-helpers.ts`.

### 2026-03-04
- Type: Validation
- Summary: Re-ran validation after Copilot-driven refinements.
- Evidence: `npm run lint`; `npm test`; `npm run test:coverage`; `DATABASE_URL=... DIRECT_URL=... RESEND_API_KEY=... GOOGLE_TOKEN_ENCRYPTION_KEY=... npm run build` (all pass).

### 2026-03-04
- Type: Governance
- Summary: Copilot review comments were addressed/resolved; PR checks and preview deployment are green.
- Evidence: PR `#85` review threads replied + resolved (3/3), Quality Gates run `22690182889` passed (`check-name`, `Quality Core`, `E2E Smoke`, `Container Image`), manual deploy workflow run `22690383465` succeeded with preview URL `https://nexus-dash-6hqyah1di-dorian-agaesses-projects.vercel.app`.

### 2026-03-03
- Type: Execution
- Summary: ISSUE-080 fixed mobile username auto-capitalization friction on signup/account username forms.
- Evidence: Updated username inputs in `app/page.tsx` and `app/account/page.tsx` to disable mobile auto-capitalization/autocorrect (`autoCapitalize="none"`, `autoCorrect="off"`, `spellCheck={false}`) and relaxed client-side pattern to `[A-Za-z0-9._]+` so server-side lowercase normalization can remain authoritative.

### 2026-03-03
- Type: Validation
- Summary: ISSUE-080 validation baseline executed successfully after implementation.
- Evidence: `npm run lint`; `npm test`; `npm run test:coverage`; `npm run build` (first run failed due to existing env contract mismatch in local `.env`, then passed with safe overrides for `DATABASE_URL`, `DIRECT_URL`, and `GOOGLE_TOKEN_ENCRYPTION_KEY`).

### 2026-03-03
- Type: Execution
- Summary: ISSUE-079 fixed mobile auth toggle scroll-reset behavior on home sign-in/sign-up mode switches.
- Evidence: Updated `app/home-auth-mode-toggle-link.tsx` to force scroll-preserving query navigation by setting `scroll={false}` on `Link` and `{ scroll: false }` in `router.push(...)`.

### 2026-03-03
- Type: Validation
- Summary: ISSUE-079 validation baseline executed successfully after implementation.
- Evidence: `npm run lint`; `npm test -- --run tests/app/home-auth-mode-toggle-link.test.ts tests/app/home-page.test.ts`; `npm test`; `npm run test:coverage`; `npm run build` (first run failed due to existing local `.env` `DATABASE_URL`/`DIRECT_URL` production hardening mismatch, then passed with temporary safe overrides for `DATABASE_URL`, `DIRECT_URL`, `GOOGLE_TOKEN_ENCRYPTION_KEY`, and `RESEND_API_KEY`).

### 2026-02-27
- Type: Execution
- Summary: TASK-086 implemented account email-change verification and compact account-page layout.
- Evidence: Added email update flow in `lib/services/account-profile-service.ts` (normalize/validate/unique + `emailVerified` reset + verification-token cleanup), wired `updateAccountEmailAction` in `app/account/actions.ts` to issue verification and redirect to `/verify-email`, redesigned `app/account/page.tsx` for denser identity/security sections with a header `Settings` CTA, and added regression tests in `tests/lib/account-profile-service.test.ts` and `tests/app/account-actions.test.ts`.

### 2026-02-27
- Type: Governance
- Summary: TASK-086 PR/checks/preview deployment completed with no Copilot review comments.
- Evidence: PR `#64`, checks green (`check-name`, `Quality Core`, `E2E Smoke`, `Container Image`), manual preview deploy workflow run `22501955778` succeeded, preview URL: `https://nexus-dash-2iv983hoq-dorian-agaesses-projects.vercel.app`.

### 2026-02-26
- Type: Execution
- Summary: TASK-082 delivered authenticated account profile self-service and user-menu identity UX updates.
- Evidence: Added `/account` page + server actions (`app/account/page.tsx`, `app/account/actions.ts`), implemented `lib/services/account-profile-service.ts` (username mutation + password rotation with revocation of other sessions), centralized account policy rules in `lib/services/account-security-policy.ts`, updated account menu copy/actions, and validated with `npm run lint`, `npm test`, `npm run test:coverage`, and `npm run build` (with safe DB env overrides).

### 2026-02-26
- Type: Governance
- Summary: TASK-082 PR opened and preview deployment validated.
- Evidence: PR `#60` (`feature/task-082-account-profile` -> `main`), deploy workflow run `22444607142` succeeded, preview URL: `https://nexus-dash-r4om5vt99-dorian-agaesses-projects.vercel.app`.

### 2026-02-26
- Type: Execution
- Summary: TASK-081 delivered username onboarding, discriminator identity, and signup confirm-password validation.
- Evidence: Updated auth service/actions/homepage signup UX, added Prisma migration `20260226113000_task081_username_identity`, added identity summary service + account-menu display (`username#suffix`), and validated with `npm run lint`, `npm test`, `npm run test:coverage`, and `npm run build` (with safe DB env overrides).

### 2026-02-26
- Type: Blocker
- Summary: Local migration-apply validation could not be completed in this execution environment.
- Evidence: `npm run db:migrate` failed without `DIRECT_URL`, then failed again with local placeholder URLs due no running Postgres; Docker-based fallback could not run because Docker daemon socket was unavailable.

### 2026-02-24
- Type: Execution
- Summary: TASK-047 delivered signed-out home auth entry + credentials onboarding.
- Evidence: Added server actions in `app/home-auth-actions.ts`, password hash/verify services, `User.passwordHash` migration (`20260224223000_task047_email_password_auth`), and validated with `npx prisma generate`, `npm run lint`, `npm test`, `npm run test:coverage`, `npm run build`.

### 2026-02-24
- Type: Governance
- Summary: TASK-047 PR lifecycle completed and follow-up review comments resolved.
- Evidence: PR `#54`, follow-up commit `145da6e`, green checks (`check-name`, `Quality Core`, `E2E Smoke`, `Container Image`), preview deployment: `https://nexus-dash-d65zx5w61-dorian-agaesses-projects.vercel.app`.

### 2026-02-23
- Type: Execution
- Summary: TASK-046 route/API auth protection implemented.
- Evidence: Added guards (`lib/auth/server-guard.ts`, `lib/auth/api-guard.ts`), protected `/projects/**` and `/account/**`, and added regression tests.

### 2026-02-23
- Type: Governance
- Summary: TASK-046 review/checks/preview deployment completed.
- Evidence: PR `#52`, preview deployment: `https://nexus-dash-2ahst74ap-dorian-agaesses-projects.vercel.app`.

### 2026-02-23
- Type: Execution
- Summary: TASK-080 delivered account menu + settings page + logout flow.
- Evidence: Added `/account/settings`, `/api/auth/logout`, account menu actions, and tests for settings/logout paths. PR `#50`, preview: `https://nexus-dash-7s1tprkyi-dorian-agaesses-projects.vercel.app`.

### 2026-02-23
- Type: Execution
- Summary: TASK-076 principal-scoped multi-user boundary implemented across DB, attachments, and calendar.
- Evidence: Added ownership/membership schema, actor-aware services, user-scoped Google credentials, ownership-aware storage keys (`v1/{userId}/{projectId}/...`), PR `#49`, preview: `https://nexus-dash-n5pw6dlxt-dorian-agaesses-projects.vercel.app`.

### 2026-02-20
- Type: Planning
- Summary: Auth/authz architecture locked and sequenced.
- Evidence: Added `adr/task-020-modern-auth-authorization-adr.md`; split boundary transition as TASK-076 before route protection.

### 2026-02-20
- Type: Execution
- Summary: TASK-062 dashboard decomposition completed.
- Evidence: Split large panels into `components/kanban/*`, `components/context-panel/*`, `components/calendar-panel/*`; validated with lint/test/coverage/build.

### 2026-02-18
- Type: Validation
- Summary: TASK-069 Cloudflare R2 smoke validation completed end-to-end.
- Evidence: Added gated smoke test `tests/lib/r2-smoke.test.ts` (`R2_SMOKE=1`), verified upload/download/delete + DB cleanup behavior.

### 2026-02-18
- Type: Planning
- Summary: Auth UX/sessions scope clarified for TASK-020/TASK-045/TASK-047 and later phases.
- Evidence: Updated backlog sequencing and acceptance criteria in `tasks/current.md` at that time.

## Historical Milestones (Condensed)

### 2026-02-11 to 2026-02-12: MVP foundation and UX iterations
- Docker setup stabilized (`APP_PORT` override, Prisma generation in container).
- Project CRUD and Kanban baseline implemented.
- Task detail/edit/rich-text flows added.
- Blocked task note and done-task auto-archive behavior added.
- Context card panel introduced and refined (collapse, colors, compact headers).
- Theme toggle and modal UX quality improvements shipped.

### 2026-02-13 to 2026-02-17: quality, architecture, and deployment baseline
- Attachment system matured (preview/download, then provider abstraction).
- API and UI regression coverage expanded.
- PostgreSQL migration baseline replaced legacy SQLite runtime.
- Layering enforced via service boundaries + lint restrictions.
- Runtime env hardening + runbooks added.
- CI quality gates + E2E + container build checks added.
- Vercel CD/promotion/rollback workflow established.

## Journal Usefulness

Helpful for development: **Yes**, if kept concise.

Most useful entries are:
- execution milestones tied to task IDs
- validation evidence (commands/checks)
- release evidence (PR + preview URL)

Low-value entries to avoid going forward:
- minor UI tweaks without task linkage
- repetitive step-by-step notes that already exist in PR history

### 2026-03-02
- Type: Execution
- Summary: ISSUE-070 targeted remediation implemented as low-risk performance patch set (no broad architecture rewrite).
- Evidence: Added bounded concurrency (`default=3`) and success callback support in `lib/direct-upload-client.ts`; extended uploader tests in `tests/lib/direct-upload-client.test.ts`; removed duplicate create-flow refreshes in `components/create-task-dialog.tsx` and `components/project-context-panel.tsx`.

### 2026-03-28
- Type: Execution
- Summary: TASK-113 rich-text block layout refined to a simpler single-surface design with contained overflow.
- Evidence: Updated `components/rich-text-editor.tsx` and `components/rich-text-content.tsx` so code blocks keep copy in the top-right corner, token actions stay inline at the end of the block, and token overflow scrolls inside the value field without widening the modal.

### 2026-03-28
- Type: Validation
- Summary: TASK-113 follow-up layout refinement validated locally before preview deployment.
- Evidence: `npm run lint`, `npx vitest run tests/components/rich-text-content.test.ts tests/lib/rich-text.test.ts`, `npm test`, and `npm run build` (with temporary local `DIRECT_URL` and `GOOGLE_TOKEN_ENCRYPTION_KEY` overrides) all passed.

### 2026-03-28
- Type: Execution
- Summary: TASK-113 follow-up refined overflow containment, inline token actions, and modal sizing.
- Evidence: Updated `tasks/task-113-rich-content-readability-polish.md` with the follow-up spec; tightened `components/rich-text-editor.tsx`, `components/rich-text-content.tsx`, and `lib/rich-text.ts` so token values remain single-line and scroll internally; widened task/context modal shells in `components/create-task-dialog.tsx`, `components/kanban/task-detail-modal.tsx`, `components/context-panel/context-modal-frame.tsx`, and `components/context-panel/context-preview-modal.tsx`.

### 2026-03-28
- Type: Execution
- Summary: TASK-113 editor continuation flow refined so structured blocks exit cleanly and keep an editable line below.
- Evidence: Updated `tasks/task-113-rich-content-readability-polish.md` with single-key exit expectations; changed `components/rich-text-editor.tsx` to keep/reuse a trailing paragraph after terminal code/token blocks and move caret below blocks on exit; added regression coverage in `tests/components/rich-text-editor.test.ts`.

### 2026-03-28
- Type: Execution
- Summary: TASK-113 editor state sync hardened so block controls do not disappear after continuing below structured blocks.
- Evidence: Updated `components/rich-text-editor.tsx` to serialize editor-only shells back to canonical rich HTML before state updates and to intercept `Enter` on the empty paragraph directly below a block; extended `tests/components/rich-text-editor.test.ts` with serialization coverage.
