# Local Validation Runbook

This runbook is the repo-owned path for running the full NexusDash local
validation baseline from a clean checkout.

## Toolchain

Use Node.js `20.19+`, `22.13+`, or `24+`. The pinned local baseline is recorded
in `.node-version` as `20.19.0` to match the CI Node 20 lane.

PowerShell options:

```pwsh
# Direct Node LTS install/update through winget.
winget install --id OpenJS.NodeJS.LTS --source winget

# Or, if Node LTS is already installed through winget:
winget upgrade --id OpenJS.NodeJS.LTS --source winget

node -v
npm -v
```

If you prefer a version manager, install one first, then use the repo pin:

```pwsh
winget install --id Schniz.fnm --source winget
fnm install 20.19.0
fnm use 20.19.0
node -v
```

## Local Database

Yes: a Docker container running PostgreSQL is the intended local validation
database. The Compose `postgres` service uses the same database shape as CI:

```text
postgres:16-alpine
postgres/postgres
nexusdash
```

Host-side validation commands use:

```text
postgresql://postgres:postgres@127.0.0.1:5432/nexusdash?schema=public
```

The app container uses Compose networking and connects to:

```text
postgresql://postgres:postgres@postgres:5432/nexusdash?schema=public
```

If you need to point the Compose app container somewhere else, use
`APP_DATABASE_URL` and `APP_DIRECT_URL`. Plain `DATABASE_URL` and `DIRECT_URL`
are reserved for host-side Node/npm validation commands.

## One-Command Baseline

After Node is upgraded:

```pwsh
npm run validate:local
```

That command starts local Postgres, installs dependencies, generates Prisma,
applies migrations, runs lint, unit/API tests, coverage, production build,
installs Chromium for Playwright, and runs the Playwright smoke suite.

## Manual Baseline

Use this when you want to stop between steps:

```pwsh
$env:DATABASE_URL = "postgresql://postgres:postgres@127.0.0.1:5432/nexusdash?schema=public"
$env:DIRECT_URL = $env:DATABASE_URL
$env:AGENT_TOKEN_SIGNING_SECRET = "local-placeholder-agent-token-signing-secret-0123456789"
$env:RESEND_API_KEY = "local-placeholder-resend-key"
$env:STORAGE_PROVIDER = "local"

npm run db:local:up
npm ci
npx prisma generate
npm run db:migrate
npm run lint
npm test
npm run test:coverage
npm run build
npx playwright install chromium
$env:NODE_ENV = "test"
npm run test:e2e
Remove-Item Env:\NODE_ENV
```

## App + Database Through Docker Compose

To run the full app and local Postgres through Docker Compose:

```pwsh
docker compose up --build
```

Open `http://localhost:3000`.

## Cleanup

Stop containers without deleting database data:

```pwsh
npm run db:local:down
```

Reset the local validation database volume:

```pwsh
npm run db:local:reset
```

If port `5432` is already occupied, choose another host port:

```pwsh
$env:POSTGRES_PORT = "55432"
$env:LOCAL_DATABASE_URL = "postgresql://postgres:postgres@127.0.0.1:55432/nexusdash?schema=public"
npm run validate:local
```
