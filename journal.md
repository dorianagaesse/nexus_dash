Date: 2026-02-11
Issue: Prisma migrate failed with schema engine error because the SQLite file did not exist.
Resolution: Created `prisma/dev.db` and reran `npx prisma migrate dev --name init` successfully.

Date: 2026-02-11
Issue: `docker compose up --build -d` failed because the Docker daemon was not running.
Resolution: None (requires Docker daemon to be started locally).
Date: 2026-02-11
Issue: Landing page CTA "Start a new project" had no action.
Resolution: Wired CTA to `/projects` and added `app/projects/page.tsx` placeholder route for next milestone.

Date: 2026-02-11
Issue: Docker compose initially failed due daemon unavailability and later host port conflict on `3000`.
Resolution: Started Docker Desktop from CLI and made compose host port configurable via `APP_PORT` (default `3000`); validated container start and hot reload on `APP_PORT=3001`.
