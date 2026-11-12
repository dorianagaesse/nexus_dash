# NexusDash

NexusDash is a project execution workspace that combines:

- project management
- Kanban task flow
- project context cards
- file/link attachments
- Google Calendar context

in one authenticated application.

## Current Product State

Implemented today:

- Credentials auth from `/` (sign-up + sign-in)
- Email verification and password recovery for credentials accounts
- DB-backed session cookies
- Protected routes: `/projects/**`, `/account/**`
- Branded 404 page for unknown URLs and unavailable pages, with a Go to projects
  recovery link, responsive layouts, and light/dark theme support
- Project CRUD
- Project Todos combines meeting actions and personal todos in one list. Add
  a todo for yourself with just text; edit, complete/reopen, or delete your own
  items. Personal todos show **Only you** and are hidden from other members,
  including project owners. Meeting actions show **Project members** and retain
  their existing assignment and private-note rules. Open/Completed and
  responsibility filters apply to the combined list. Viewers remain read-only.
- Project sharing with owner-managed membership/invitation flows, including email-bound invite links
- In-app notification center for durable unread/read notification review, starting with project invitations
- Project notification email digests, delayed invitation reminders, and
  three-day task due-date reminders through the shared outbound email foundation
- Project-scoped agent access with owner-managed API credentials, short-lived bearer-token exchange, and audit trail
- Project dashboard with:
  - Context cards (CRUD + attachments)
  - Epics listed in a bounded, scrollable view with title, completion, task count,
    and edit/archive/delete actions. Colored flags identify epics across the list,
    details dialog, and Kanban. **Active** and **Archived** show their epics
    immediately, with name and description search. Open an epic to see its
    description and every linked task, ordered Backlog, Blocked, In Progress,
    then Done. Task links open the task directly. Creation and editing use dialogs.
  - Meeting notes with searchable preparation inputs, label filters,
    participants, after-meeting outputs, todo tracking, overdue highlights,
    state, and archived history
  - Roadmap milestone lanes with grouped events, drag-and-drop regrouping,
    and target-date planning. Milestones stack vertically on narrow screens
    and form a horizontally scrollable timeline on desktop. During a touch
    drag, visible insertion gaps let you create a milestone by releasing
    your finger inside the gap.
  - Kanban board (`Backlog`, `In Progress`, `Blocked`, `Done`)
  - Calendar panel (Google Calendar list/create/update/delete)
  - Task attachment additions and deletions sync into open task modals across
    sessions while preserving pending edits and focus; reconciliation re-reads
    attachments if a local or remote task change overtakes an in-flight read.
    Activity received during local saves reconciles afterward; comment uploads
    stay unpublished until their comment is posted
  - Task comments with agent-authored comment attribution through the project
    credential name, descriptive labels and a shared agent avatar
- Per-user Google Calendar connection and calendar target setting (`/account/settings`)
- Opening a task updates the browser URL; task modals offer **Copy link**.
  Shared links reopen that task after sign-in for people with project access.
  Closing a task clears its URL selection, and Back/Forward follow task navigation.
  New task links become available when saving finishes.
- Kanban cards, search results, and archived Done rows display each task's stable
  ND reference so tasks can be identified without opening their detail modal.
- Attachment storage abstraction:
  - `local` provider (filesystem)
  - `r2` provider (Cloudflare R2)

## Tech Stack

- Next.js 16 (App Router)
- TypeScript (strict)
- Tailwind CSS + Shadcn UI
- Prisma + PostgreSQL
- Vitest + Playwright
- Docker + Docker Compose

## Local Setup

### 1. Prerequisites

- Node.js 24.x (24.22.1+; Node 20 is end-of-life)
- npm
- PostgreSQL database (local Docker Compose service or remote)

The repo pins the local Node baseline in `.node-version` as `24.22.1`.

### 2. Environment

Copy env template:

```bash
cp .env.example .env
```

Set at minimum:

- `DATABASE_URL`
- `DIRECT_URL`

For the repo-owned local Docker database, use:

```bash
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/nexusdash?schema=public
DIRECT_URL=postgresql://postgres:postgres@127.0.0.1:5432/nexusdash?schema=public
```

### 3. Install and run

```bash
npm install
npx prisma generate
npm run dev
```

Open `http://localhost:3000`.

`npm run dev` runs `prisma migrate deploy` before starting Next.js.

## Auth and Sessions

- Homepage (`/`) is the sign-in/sign-up entry when signed out.
- Credentials accounts require email verification before workspace access.
- Unverified signed-in users are redirected to `/verify-email`.
- Verification callback endpoint: `GET /api/auth/verify-email?token=...`.
- After verified authentication, users are redirected to `/projects`.
- Session persistence is database-backed (`Session` table) with HttpOnly cookie handling.
- Logout endpoint: `POST /api/auth/logout`.
- Agent access is project-scoped and owner-managed from the project settings surface.
- Legacy API credentials remain a supported option. For the proposed portable
  identity/container direction and its current validation limits, see the
  [Docker identity investigation](docs/reports/nd-822-container-agent-identities.md).
- **Share project > Agent access** opens a credential directory with agent
  counts, readable access summaries, status, last use, expiry, and a separate
  task-completion switch for each agent. Search by name or descriptive label (ignoring case and
  surrounding spaces). Open **Filters** to combine status and capability,
  including **Complete tasks**; **Clear filters** restores the full directory.
  Custom access lists the actions granted for each resource. **Complete tasks**
  shows active agents with both Task Write and task-completion permission;
  expired and revoked credentials show task completion as inactive.
- **New credential** opens a focused form for the agent name, expiry, and access
  preset. Expand **Customize permissions** for individual scopes. The API key
  appears in its own one-time dialog after creation; copy the key or the complete
  environment setup before closing it. **Copy and close** copies the API key
  and dismisses the dialog only after copying succeeds. Outside clicks and
  Escape do not dismiss this one-time view, and it has no close icon. If copying
  fails, the key stays visible for retry or manual copying; **Close after manual
  copy** provides an explicit recovery path. The key cannot be viewed again
  after closing.
- **Manage** opens one agent's permissions, lifecycle dates, and public ID.
  **Rotate key** replaces an active key after confirmation. **Revoke access**
  opens the responsibility review. Completion changes save immediately for only
  that credential. Loading failures offer **Retry loading credentials**; action
  errors appear in their relevant flow and failed creation preserves input.
- **Activity** shows recent credential changes and usage. **Setup guide** contains
  connection steps, hosted documentation, and the optional environment block.
  Escape closes creation, management, and setup dialogs and returns focus to
  the directory controls. Invalid creation fields receive focus and show an associated error.
  Settings and Agent access dialogs use the same thin, transparent-track
  scrollbar as the task dialogs and agent guide.
- Agent raw API keys exchange at `POST /api/auth/agent/token` into short-lived bearer tokens.
- Key rotation immediately invalidates tokens from the previous key. A token
  exchanged with the new key works immediately, even within the same millisecond.
  Bearer tokens are bound to the key's public ID rather than a rounded issuance
  timestamp; revocation and credential expiry are still checked on every request.
  During the ND-657 rollout, older tokens without that binding remain usable only
  on never-rotated credentials. Agents with previously rotated credentials must
  exchange their current API key again if they receive `401`.
- Agent v1 is limited to project/roadmap/task/context APIs and does not include calendar access.
- In Sharing > Agent access, owners can enable **Task completion** separately
  on each credential. Task Write is still required. New and existing credentials
  default to off, including credentials in projects where the retired project-wide
  toggle was on: owners must explicitly grant the permission again after migration.
- Denied single-task and board-reorder moves return `403` with
  `agent-done-move-disabled`; bulk status operations report that error per
  operation. Denied board reorders make no task changes. Human moves and
  reordering tasks already in Done are unaffected. Permission changes apply to
  existing bearer tokens immediately and never affect other credentials.
- Owner sessions read credential permissions through
  `GET /api/projects/{projectId}/agent-access` and update one with
  `PATCH /api/projects/{projectId}/agent-access/{credentialId}` and
  `{ "canMoveTasksToDone": true|false }`. The project-wide PATCH endpoint is
  retired. Agents cannot change these settings. Permission changes are recorded
  in the credential audit trail with the human actor, credential, granted value,
  and request metadata, in the same transaction as the update.
- After project ownership transfer, the new owner can manage inherited credential
  permissions without rewriting their creator attribution. The previous owner's
  agents remain subject to the existing ownership guard; issue replacement
  credentials under the new owner to restore agent access.

Calendar creation and edits use explicit Save; recovery drafts never write to
Google on a timer. Calendar edit PATCH requests require `expectedEtag` containing
one strong ETag from the event listing. Missing preconditions return 428
`calendar-edit-precondition-required`, invalid values return 400
`invalid-precondition`, and stale provider revisions return 412
`calendar-edit-conflict` without changing the event. Recovery is invisible:
closing a form accidentally and reopening it restores input without notices,
status strips, or recovery-choice buttons. A stale or unknown Calendar revision
fails through the ordinary Save error and keeps the input. Explicit Cancel
abandons the edit; reopening then starts from the latest event. Outside click,
Escape, and the close icon preserve recovery. Context cards follow the same
invisible-recovery rule with atomic content revisions.

### Agent descriptive labels

Project owners can add optional descriptive labels (for example, `GPT-6` and
`Codex`) when creating a credential in **Sharing → Agent access**, or use
**Manage > Edit labels** on an existing credential. Type one label and press
**Enter** to add its chip; remove chips individually with their remove buttons.
The Enter hint appears only while the focused input contains text. Labels use
the same automatic background colors as task labels in the editor, credential
directory and comment authors. At most five distinct labels are allowed, each
1–40 characters after trimming, without commas or control characters. Duplicate
labels are combined case-insensitively. Remove every chip to clear all labels;
add or clear pending text before saving. Names, task labels and permissions are
separate.

Owner-session credential creation accepts `descriptiveLabels: string[]`;
`PATCH /api/projects/{projectId}/agent-access/{credentialId}/labels` replaces
that array and returns the credential ID and saved labels. The owner-only
Agent access summary includes `descriptiveLabels`; agent bearer tokens cannot
manage this metadata. These responses never include stored secret hashes.

Task comments resolve the agent's current name and descriptive labels from a
project-scoped public author identity, including comments posted before an edit.
Agent display names use the credential name without an appended `(agent)`
suffix; avatars, descriptive labels and structured actor kind distinguish them.
The comment API exposes the array as `author.agentCredentialDescriptiveLabels`;
task readers see the current labels beside the author name. Renaming and label
additions/removals apply to all linked comments. Metadata edits refresh open
threads through project activity without changing comment contents or timestamps.
Rotation and revocation retain the same identity; deleting the API credential
retains its final public name and labels. The additive migration links existing
comments to current metadata. Older comments whose credential was already hard
deleted retain their saved attribution because their original link is gone.

## Database and Migrations

Scripts:

```bash
npm run db:migrate
npm run db:backfill-username-tags -- --dry-run
```

Notes:

- `db:backfill-username-tags` assigns a missing `username#discriminator` tag
  to every account that lacks one, deriving the handle from the existing
  username, display name, or email local part and leaving display names and
  existing tags untouched. It is idempotent and race-safe, requires
  `DATABASE_URL`, and supports `--dry-run` to print the plan without writing.
  Run it against environments whose data predates username onboarding.
- Datasource is PostgreSQL (`prisma/schema.prisma`).
- Runtime and migration connection roles are split via `DATABASE_URL` + `DIRECT_URL`.
- In production with remote hosts, runtime validation enforces:
  - different runtime/direct endpoints
  - TLS
  - Supabase pooler/direct host sanity rules (when Supabase hosts are used)
  - Supabase runtime traffic on the transaction pooler port `6543`; the
    session pooler port `5432` is rejected for `DATABASE_URL` because it can
    exhaust session clients under Vercel/serverless request bursts
  - Supabase project-ref alignment between `DATABASE_URL`, `DIRECT_URL`, and
    `SUPABASE_URL` so production cannot silently boot against a preview or
    staging database
  - environment pinning through `EXPECTED_SUPABASE_PROJECT_REF` for
    Supabase-backed Vercel Preview and Production runtimes

For Supabase production/preview:

- `DATABASE_URL`: transaction pooler URL, `*.pooler.supabase.com:6543`, with
  TLS enabled. For the shared Supabase pooler, use the least-privilege runtime
  role and include the project ref in the username, for example
  `app_runtime.<project-ref>`.
- `DIRECT_URL` / `MIGRATION_DATABASE_URL`: admin-capable migration connection,
  never `app_runtime`. Prefer the direct database URL
  `db.<project-ref>.supabase.co:5432` when the environment can reach it.
  Supabase direct hosts are IPv6-only by default; if GitHub Actions or Vercel
  cannot connect to the direct host, use the admin `postgres.<project-ref>`
  session-pooler URL on `*.pooler.supabase.com:5432`.
- `SUPABASE_URL`: the matching client API URL,
  `https://<project-ref>.supabase.co`.
- `EXPECTED_SUPABASE_PROJECT_REF`: the same environment's non-secret project
  ref. Configure distinct values in Vercel and GitHub `preview` / `production`
  environments so a cross-environment connection fails closed.
- Prisma runtime automatically adds the compatibility flags needed for the
  Supabase transaction pooler when constructing the `@prisma/adapter-pg`
  connection string.

## Environment Contract (Server)

Environment access/validation is centralized in `lib/env.server.ts` and executed when the server loads `app/layout.tsx`. Validation skips Next.js's production build phase so build artifacts do not require runtime-only secrets. Runtime module loading validates the deployed configuration and fails with a clear error when it is missing or invalid. Do not set `NEXT_PHASE` in deployment runtime configuration.

### Required

- `DATABASE_URL`

### Required in production

- `DIRECT_URL`
- `RESEND_API_KEY` (email verification delivery)
- `AGENT_TOKEN_SIGNING_SECRET` (agent bearer-token signing, minimum 32 chars; see `docs/runbooks/vercel-env-contract-and-secrets.md` for generation and rotation guidance)
- `SUPABASE_JWT_SECRET` and the Supabase client group when
  `REALTIME_TRANSPORT=broadcast`. Use the matching environment's legacy
  Supabase JWT secret and mark it sensitive in Vercel.

### Optional grouped vars (must be complete if any value is set)

- Google OAuth group:
  - `GOOGLE_CLIENT_ID`
  - `GOOGLE_CLIENT_SECRET`
  - `GOOGLE_REDIRECT_URI`
- NextAuth compatibility group:
  - `NEXTAUTH_URL`
  - `NEXTAUTH_SECRET`
- Supabase client group:
  - `SUPABASE_URL`
  - `SUPABASE_PUBLISHABLE_KEY`
  - legacy fallback accepted for migration only: `SUPABASE_API_KEY`
- `SUPABASE_REALTIME_TOKEN_TTL_SECONDS` is optional in Broadcast mode (60 to
  600 seconds, default 600).
- R2 credentials group:
  - `R2_ACCOUNT_ID`
  - `R2_ACCESS_KEY_ID`
  - `R2_SECRET_ACCESS_KEY`
  - `R2_BUCKET_NAME`

### Additional rules

- `APP_VERSION` is optional locally and should normally be omitted. When unset,
  the app reads the product version from `package.json`.
- `APP_ENV` is optional locally and may be `development`, `preview`,
  `production`, or `test`. Vercel deploy workflows inject it for preview and
  production deploys.
- `COMMIT_SHA` is optional locally and is used only as diagnostic build
  metadata. The user-facing app version does not include the commit SHA.
- `APP_REPOSITORY_URL` is optional and defaults to the NexusDash GitHub
  repository.
- In production, when Google OAuth is enabled, `GOOGLE_TOKEN_ENCRYPTION_KEY` is required.
- `AGENT_ACCESS_TOKEN_TTL_SECONDS` is optional, defaults to `600`, and must stay between `300` and `900`.
- `GOOGLE_CALENDAR_ID` must be unset or `primary`.
- `RESEND_FROM_EMAIL` defaults to `NexusDash <noreply@nexus-dash.app>` when unset.
- `TRUSTED_ORIGINS` (optional) can restrict verification-link origins in production.
- `PREVIEW_AUTH_ORIGIN` is required in Vercel Preview when Google or GitHub
  OAuth is enabled. It must be the exact stable HTTPS alias registered as the
  providers' Preview callback origin, without a path or trailing slash.
- Do not set `NEXTAUTH_URL` in Vercel Preview. Preview requests trust the
  immutable deployment origin and the exact `PREVIEW_AUTH_ORIGIN` only.
- `CRON_SECRET` or `NOTIFICATION_EMAIL_DISPATCH_SECRET` protects the
  notification email dispatch endpoint. If both are set,
  `NOTIFICATION_EMAIL_DISPATCH_SECRET` takes precedence. Configured values must
  be at least 32 characters.
- `STORAGE_PROVIDER` must be `local` or `r2` (default `local`).

Runbooks:

- `docs/runbooks/vercel-env-contract-and-secrets.md`
- `docs/runbooks/database-connection-hardening.md`
- `docs/runbooks/content-revision-preconditions.md`
- `docs/runbooks/rls-tenant-isolation.md`
- `docs/runbooks/notification-email-dispatch.md`
- `docs/runbooks/release-versioning.md`
- `docs/runbooks/protected-preview-agent-access.md`

## Attachments and Storage

Supported kinds:

- `link`
- `file`

Allowed file types:

- PDF
- JPEG / PNG / WebP
- TXT / Markdown
- CSV
- JSON

Upload limits:

- Form-based upload: `4MB`
- Direct upload flow (signed upload target): `25MB`

Provider behavior:

- `local`: filesystem-backed (`/storage/uploads`)
- `r2`: Cloudflare R2 with signed download URLs and direct upload support

## Docker (Dev)

```bash
docker compose up
```

Notes:

- Compose starts a local `postgres:16-alpine` service by default.
- App binds to `${APP_PORT:-3000}` on host.
- Container startup runs `npx prisma generate` then `npm run dev`.
- Storage volume is mounted at `/app/storage`.
- App container database defaults target the Compose `postgres` service. Host
  validation commands should use `127.0.0.1`.
- Use `APP_DATABASE_URL` and `APP_DIRECT_URL` only when overriding the app
  container database target.

## Scripts

```bash
npm run dev
npm run build
npm run start
npm run lint
npm run rls:check
npm test
npm run test:coverage
npm run test:rls:setup
npm run test:rls
npm run test:e2e
npm run test:e2e:headed
npm run db:migrate
npm run db:local:up
npm run db:local:down
npm run db:local:reset
npm run release:version -- patch --dry-run
npm run validate:local
```

## Local Validation

Full local baseline:

```bash
npm run validate:local
```

Manual sequence and troubleshooting details are in
[`docs/runbooks/local-validation.md`](docs/runbooks/local-validation.md).

## Testing

### Unit/API tests

```bash
npm test
npm run test:coverage
```

### PostgreSQL tenant isolation

`npm run rls:check` verifies that every Prisma model has an explicit committed
RLS or exemption decision. The real PostgreSQL matrix runs with separate admin
and non-superuser `NOBYPASSRLS` runtime URLs:

```bash
npm run test:rls:setup
npm run test:rls
```

See [`docs/runbooks/rls-tenant-isolation.md`](docs/runbooks/rls-tenant-isolation.md)
for environment variables, policy conventions, and troubleshooting.

### E2E (Playwright)

Install browser once:

```bash
npx playwright install --with-deps chromium
```

Run:

```bash
npm run test:e2e
```

Against a deployed preview:

```bash
PLAYWRIGHT_BASE_URL=https://<preview-url> npx playwright test tests/e2e/smoke-project-task-calendar.spec.ts
```

If the preview is behind Vercel protection, also set:

```bash
VERCEL_AUTOMATION_BYPASS_SECRET=<32-char-secret>
```

The Playwright config forwards that secret through the Vercel preview-protection
headers so smoke runs can target the deployed branch preview directly.

For manual agent API checks, the NexusDash raw key does not bypass Vercel
deployment protection. Use `vercel curl` (optionally with
`--protection-bypass`) and exchange the raw key with
`Authorization: ApiKey <key>`. Reserve `Authorization: Bearer` for the
short-lived token returned by the exchange. See
[`docs/runbooks/protected-preview-agent-access.md`](docs/runbooks/protected-preview-agent-access.md).

### Notification Email Dispatch

Digest/reminder dispatch endpoint:

```bash
GET /api/cron/notification-emails
```

Authenticate with the dedicated scheduler header:

```bash
x-notification-email-dispatch-secret: <CRON_SECRET-or-NOTIFICATION_EMAIL_DISPATCH_SECRET>
```

or the bearer fallback:

```bash
Authorization: Bearer <CRON_SECRET-or-NOTIFICATION_EMAIL_DISPATCH_SECRET>
```

Notification creation/refreshed paths enqueue durable recipient/project groups.
Project activity waits for a 30-minute quiet window, but the first unsent
activity in a group is capped at a 60-minute max delay. Task due-date reminders
are reconciled by the dispatcher when a task is exactly three local calendar
days from its date-only deadline. Each reminder creates one durable in-app
notification per task, recipient, and deadline date, then flows through the same
recipient/project digest pipeline as other project activity. Reminders target
the assignee when present, or the task creator when unassigned, and only while
that recipient still has project access. `Done`, archived, and undated tasks are
ignored. Due groups claimed in one dispatcher run are batched by recipient, with
project sections in one email when several projects are ready together. Project
invitation reminders are sent once after 6 hours when the verified invited user
has not opened, accepted, declined, or otherwise resolved the invitation
notification. Sending email never marks notifications read or resolved.

Production scheduler decision:

- Current production bridge: GitHub Actions invokes this endpoint every 30 minutes
  through `.github/workflows/notification-email-dispatch.yml`.
- This is an accepted early-production tradeoff while Vercel remains on Hobby
  and no managed scheduler is in use. It preserves durable app-owned queueing
  and idempotent dispatch. It improves the previous 3-hour bridge while still
  depending on GitHub scheduled workflow reliability rather than a hard
  real-time worker.
- Expected project-activity email timing is the 30-minute quiet window plus at
  most one 30-minute scheduler cadence and normal GitHub scheduling delay.
  Dispatcher summaries include scheduler-lag metrics for claimed groups so
  operators can see when due work waited beyond its `sendAfterAt`.
- Manual workflow dispatch remains available for preview validation and
  diagnostics by overriding the target URL.
- Future preferred path: Vercel Cron or a managed HTTP scheduler with
  retries/visibility on a cadence that satisfies the product delivery target.

## CI/CD

The workflow inventory, operator paths, permissions, artifacts, and no-delete
audit decision are documented in
[`docs/runbooks/github-actions-workflows.md`](docs/runbooks/github-actions-workflows.md).

### CI workflows

- `Quality Core (lint, test, coverage, build)`
- `Tenant Isolation (PostgreSQL RLS)`
- `E2E Smoke (Playwright)`
- `Container Image (build + metadata artifact)`
- `Check Branch Name` (PR branch naming contract)
- `Dependency Security` (scheduled + manual `npm audit` baseline with artifacts)
- `Notification Email Dispatch Scheduler` (scheduled + manual protected
  dispatch call)
- `Dependabot Auto Triage` (safe Dependabot lane labeling/approval/merge)
- `Dependabot Repair Agent` (Copilot-assisted repair PRs for red Dependabot
  updates)

Branch-name note:
- human-authored PR branches must use `feature/*`, `fix/*`, `refactor/*`,
  `docs/*`, or `chore/*`
- Dependabot PR branches may use `dependabot/*`

### Release version metadata

`package.json` is the canonical product-version source. Release-preparation
PRs (`chore/release-vX.Y.Z`) update `package.json` and `package-lock.json`
together; every other PR — including Dependabot maintenance — merges without
changing the product version.

Product versions identify cohesive production releases, not commit counts or
every production deployment: one release can contain many product PRs. A
`chore/release-vX.Y.Z` preparation PR selects the release version (minor for
capability releases, patch for fix-only releases), composes the `CHANGELOG.md`
entry, and is tagged and promoted after merge; `1.0.0` remains reserved for
the first stable product baseline. CI (`npm run release:check`) rejects
version changes outside release preparation. New release changelog sections
must declare `Release impact:` and `Release rationale:`; CI enforces the exact
next patch/minor/major step. The first `1.0.0` also records the maintainer's
`Stable baseline approved: yes` decision. Fix-only releases increase patch
even before `1.0.0`; a capability release increases minor and resets patch.
The detailed checklist lives in
[`docs/runbooks/release-versioning.md`](docs/runbooks/release-versioning.md).

The running app displays only the clean product version, for example `v0.18.0`.
Build revision and runtime environment are kept as diagnostic metadata so
operators can identify the deployed commit without turning the user-facing
version into `v0.18.0+<sha>`.

The Vercel deploy workflow resolves metadata from the checked-out ref and
injects:

- `APP_VERSION`: product version from `package.json`
- `APP_ENV`: `preview` for preview deploys, `production` for staged production
- `COMMIT_SHA`: full git commit SHA for diagnostics
- `APP_REPOSITORY_URL`: GitHub repository URL

After a preview or staged-production deployment, check the workflow summary for
the resolved app version and short revision. Promoted production keeps the same
metadata as the staged deployment target.

### CD workflow

Workflow: `.github/workflows/deploy-vercel.yml`

Supports:

- automatic staged production deploy after successful `Quality Gates` on `main`
- manual actions:
  - `deploy-preview`
  - `deploy-production-staged`
  - `promote`
  - `rollback`

Required GitHub secrets:

- `VERCEL_TOKEN`
- `VERCEL_ORG_ID`
- `VERCEL_PROJECT_ID`
- `NOTIFICATION_EMAIL_DISPATCH_SECRET` or `CRON_SECRET` for scheduled/manual
  notification email dispatch
- `DATABASE_URL` (runtime connection; Supabase `app_runtime` transaction pooler
  on port `6543`)
- `DIRECT_URL` (admin-capable migration connection; direct host preferred,
  admin session-pooler fallback allowed when direct IPv6 is unavailable)
- `MIGRATION_DATABASE_URL` (admin-capable migration connection; must not be the runtime `DATABASE_URL`)
- `AGENT_TOKEN_SIGNING_SECRET` (required for production deploys; preview workflow falls back to a placeholder when intentionally unset)
- Preview deployments still need `AGENT_TOKEN_SIGNING_SECRET` at runtime. GitHub Actions fallback values do not automatically populate Vercel's shared preview runtime unless the deployment explicitly passes them through.

Required GitHub environment variables (not secrets):

- `EXPECTED_SUPABASE_PROJECT_REF`, configured independently for `preview` and
  `production`.
- `PREVIEW_AUTH_ORIGIN`, configured for `preview` as the stable Vercel alias
  registered with the Preview GitHub/Google OAuth applications.

The preview workflow validates the migration project ref, immutable Vercel
deployment target, checked-out revision, deployed `APP_ENV`, and database
readiness before assigning `PREVIEW_AUTH_ORIGIN` to that exact deployment. It
then verifies the alias target and readiness before uploading
`preview-deployment`. Use the immutable URL as deployment evidence and the
stable auth URL for interactive OAuth testing.

### Dependency Security Cadence

- `npm run security:audit`: fail on production dependency `high`/`critical` findings
- `npm run security:audit:full`: emit the full npm advisory JSON locally
- `.github/workflows/dependency-security.yml`: scheduled every Monday at 07:00 UTC and runnable on demand
- `.github/dependabot.yml`: weekly npm + GitHub Actions dependency update cadence
- `.github/workflows/dependabot-auto-triage.yml`: labels and auto-approves safe
  Dependabot lanes, reclassifies failed safe-lane PRs back into manual review,
  then auto-merges them after the required PR checks pass
- `.github/workflows/dependabot-repair-agent.yml`: weekly scheduled GitHub
  Copilot CLI repair lane for failing Dependabot PRs; it may create repo-owned
  superseding PRs and close the original Dependabot PRs, but it never merges
  the superseding PRs automatically

Prisma tooling advisory note:

- `@prisma/client` declares `prisma` as an optional peer, so npm can classify
  Prisma CLI packages as `devOptional` and still include them in
  `npm audit --omit=dev`.
- Prisma 7.9.1 resolves `@prisma/dev` 0.24.17, which no longer installs
  `@hono/node-server` or Hono. The former targeted overrides were removed with
  that upgrade because they no longer affect the installed dependency tree.

Dependabot automation policy:
- grouped GitHub Actions updates are considered safe auto-merge candidates
- grouped npm safe lanes are auto-merge candidates only for:
  - development dependency patch/minor updates outside the known high-churn
    framework/lint/test/ORM stack
  - selected low-risk production utility libraries (`tailwind-merge`, `clsx`,
    `class-variance-authority`, `lucide-react`, `@radix-ui/react-slot`,
    `tailwindcss-animate`, `sanitize-html`, `emojibase-data`)
- majors and excluded high-churn dependencies stay in manual review
- a weekly Copilot repair lane may triage failing/manual-review Dependabot PRs:
  - red safe-lane PRs are reclassified out of `dependabot:auto-merge` once
    required checks fail
  - it scans open red Dependabot-created `dependabot/*` PRs, so stale labels do
    not block repair follow-up
  - it uses a repository custom Copilot agent profile plus a scheduled GitHub
    Actions workflow
  - when it repairs an update, it opens a repo-owned superseding PR and closes
    the original Dependabot PR to keep one merge surface
  - when it does not repair an update, it comments the original Dependabot PR
    and leaves it in manual review
  - it never auto-merges its own superseding PRs

Copilot repair-lane prerequisite:
- set repository secret `COPILOT_ACTIONS_TOKEN` so the scheduled workflow can
  authenticate Copilot CLI in GitHub Actions

## Observability

- `GET /api/health/live`: process liveness
- `GET /api/health/ready`: dependency readiness (database reachability)
- API request/response correlation via `x-request-id`
- Structured server logging in `lib/observability/logger.ts`

## Project Documentation Map

- `AGENTS.md`: shared repository instructions for Codex and Claude Code
- `project.md`: architecture and product orientation; task status lives on the Nexus Dash board
- `docs/runbooks/agent-workflow.md`: detailed board, branch, PR, and handoff procedures
- `tasks/backlog.md`: record of the backlog migration to Nexus Dash
- `journal.md`: searchable execution history
- `adr/decisions.md` + `adr/*.md`: architecture decisions

Claude Code v2.1.277+ loads `AGENTS.md` by default when no project
`CLAUDE.md` is present; older versions need a `CLAUDE.md` import. See the
[Claude Code project-instructions documentation](https://code.claude.com/docs/en/memory).

### Meeting note visibility

New meeting notes are private to their creator. Use the lock immediately left of
the dialog close button to switch between Private and Team, then save as usual.
Only the creator can change visibility. Team notes are shared with project members
and agents. Todos remain project-visible even when their meeting is private;
project editors can complete and reassign them. Private note text, participants,
labels and titles are not revealed through shared todo views or mutation responses.

### Agent context-card attachments

Agents with `context:write` can create context cards with `attachmentLinks` and
upload files using the context-card `attachments/upload-url`, signed `PUT`, then
`attachments/direct` flow documented at `/docs/agent/v1`. Signed uploads require
R2; local storage supports form uploads for signed-in users. Agent attachments
store their credential ID and display-name snapshot separately from the user
who owns the storage object. Revoked or deleted credentials retain historical
agent attribution. Existing file limits, project access, and scope checks apply.

### Comment reaction actors

A human and each project credential have independent comment reactions. POST an
emoji to `/api/projects/{projectId}/tasks/{taskId}/comments/{commentId}/reactions`
to toggle it off or replace your previous emoji. GET requires `task:read`; POST
and DELETE `/{reactionId}` require `task:write`. Removal affects only your actor.
Responses group counts and caller-specific `reacted` state. Each reaction's
`actor` identifies the human or agent; `user` is null for agents. Credential
removal preserves the agent display snapshot with a null actor ID. Reaction
button tooltips show these actors, including the agent marker.

Open task dialogs reconcile comments, counts and reactions through project
activity, including Broadcast signals and polling or reconnect snapshots.
Thread reads continue during task editing without replacing unsent comments,
active comment edits, focus or selection. Switching tasks cancels pending reads;
late responses cannot replace the newly opened thread. Polling keeps the existing
10-second active cadence; no separate thread polling loop is added.
After a local mutation finishes, open surfaces also catch up once so its version
acknowledgement cannot hide a concurrent remote comment or reaction.

Reaction routes validate the entire project/task/comment/reaction path. A known
comment under the wrong task, or a reaction under the wrong comment, returns 404
and never reads or changes the other thread's reactions.

### Task attachment attribution

Task link and file responses include `uploadedBy: { kind, id, displayName }`.
The uploader snapshot distinguishes agents from their human storage owner and
survives credential deletion (`id: null`, agent kind and name retained). Task
attachment add/delete writes also update the actual task editor and activity
payload actor. Legacy uploads remain human-attributed; their history is not
retroactively assigned to a credential.

Unpublished task comment files belong to the exact uploading human or credential,
including credentials with the same human owner. Only that actor may read or bind
its draft to a comment. Human project owners may remove another actor's draft for
moderation; this grants neither read nor publishing access. Once posted, project
readers may download the file. Binding is atomic and a draft can be published once.
Direct-upload keys must be used by the actor that requested them. Finalization and
cleanup reject an already-finalized key; agents cannot claim legacy human keys.

### Agent files with local storage

Create the task using JSON, then POST multipart form data to
`/api/projects/{projectId}/tasks/{taskId}/attachments` with the bearer token,
`kind=file` and `file`. This path supports local and R2 providers, with the
existing 4 MiB MIME/size limit and actual credential attribution. For a comment
file, add `isCommentDraft=true`, then POST its ID in `attachmentIds` to the task
comments route. Only that credential may bind or read the unpublished file.

Agent multipart task creation with `attachmentFiles` remains unsupported; the
two-request create/upload flow is its supported equivalent. R2 direct upload
remains preferred for files up to 25 MiB. Local storage returns 400 for signed
upload targets; use multipart instead. Authentication or authorization failures
must not trigger a fallback to a human session. Context-card local uploads remain
outside this contract.

Project module permissions and rollout: [project capabilities](docs/runbooks/project-capabilities.md).
