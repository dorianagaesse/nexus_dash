-- TASK-327 replaces the singular Google credential with user-owned connections,
-- provider calendars, and one account-wide write preference without losing tokens.

ALTER TABLE "GoogleCalendarCredential" RENAME TO "CalendarConnection";
ALTER TABLE "CalendarConnection" RENAME COLUMN "scope" TO "scopes";

DROP INDEX IF EXISTS "GoogleCalendarCredential_userId_key";
DROP INDEX IF EXISTS "GoogleCalendarCredential_providerAccountId_idx";

ALTER TABLE "CalendarConnection"
  ADD COLUMN "provider" VARCHAR(32) NOT NULL DEFAULT 'google',
  ADD COLUMN "accountEmail" TEXT,
  ADD COLUMN "accountLabel" TEXT NOT NULL DEFAULT 'Google account',
  ADD COLUMN "reauthorizationRequiredAt" TIMESTAMP(3),
  ADD COLUMN "calendarListSyncedAt" TIMESTAMP(3);

UPDATE "CalendarConnection"
SET "providerAccountId" = 'legacy:' || "id"
WHERE "providerAccountId" IS NULL OR btrim("providerAccountId") = '';

ALTER TABLE "CalendarConnection"
  ALTER COLUMN "providerAccountId" SET NOT NULL,
  ALTER COLUMN "provider" DROP DEFAULT,
  ALTER COLUMN "accountLabel" DROP DEFAULT;

CREATE UNIQUE INDEX "CalendarConnection_userId_provider_providerAccountId_key"
  ON "CalendarConnection"("userId", "provider", "providerAccountId");
CREATE UNIQUE INDEX "CalendarConnection_id_userId_key"
  ON "CalendarConnection"("id", "userId");
CREATE INDEX "CalendarConnection_userId_revokedAt_idx"
  ON "CalendarConnection"("userId", "revokedAt");

CREATE TABLE "CalendarSource" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "connectionId" TEXT NOT NULL,
  "providerCalendarId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "color" TEXT,
  "timeZone" TEXT,
  "accessRole" TEXT,
  "isPrimary" BOOLEAN NOT NULL DEFAULT false,
  "isAvailable" BOOLEAN NOT NULL DEFAULT true,
  "isSelected" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CalendarSource_pkey" PRIMARY KEY ("id")
);

INSERT INTO "CalendarSource" (
  "id", "userId", "connectionId", "providerCalendarId", "name",
  "accessRole", "isPrimary", "isAvailable", "isSelected", "createdAt", "updatedAt"
)
SELECT
  'legacy-source:' || "id", "userId", "id", "calendarId",
  CASE WHEN "calendarId" = 'primary' THEN 'Primary calendar' ELSE "calendarId" END,
  'owner', "calendarId" = 'primary', true, true, "createdAt", "updatedAt"
FROM "CalendarConnection";

CREATE UNIQUE INDEX "CalendarSource_connectionId_providerCalendarId_key"
  ON "CalendarSource"("connectionId", "providerCalendarId");
CREATE UNIQUE INDEX "CalendarSource_id_userId_key"
  ON "CalendarSource"("id", "userId");
CREATE INDEX "CalendarSource_userId_isSelected_idx"
  ON "CalendarSource"("userId", "isSelected");
CREATE INDEX "CalendarSource_connectionId_isAvailable_idx"
  ON "CalendarSource"("connectionId", "isAvailable");

ALTER TABLE "CalendarSource"
  ADD CONSTRAINT "CalendarSource_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "CalendarSource_connectionId_userId_fkey"
    FOREIGN KEY ("connectionId", "userId") REFERENCES "CalendarConnection"("id", "userId")
    ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "CalendarPreference" (
  "userId" TEXT NOT NULL,
  "defaultConnectionId" TEXT,
  "writeSourceId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CalendarPreference_pkey" PRIMARY KEY ("userId")
);

INSERT INTO "CalendarPreference" (
  "userId", "defaultConnectionId", "writeSourceId", "createdAt", "updatedAt"
)
SELECT c."userId", c."id", s."id", c."createdAt", c."updatedAt"
FROM "CalendarConnection" c
JOIN "CalendarSource" s ON s."connectionId" = c."id";

CREATE INDEX "CalendarPreference_defaultConnectionId_idx"
  ON "CalendarPreference"("defaultConnectionId");
CREATE INDEX "CalendarPreference_writeSourceId_idx"
  ON "CalendarPreference"("writeSourceId");

ALTER TABLE "CalendarPreference"
  ADD CONSTRAINT "CalendarPreference_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "CalendarPreference_defaultConnectionId_userId_fkey"
    FOREIGN KEY ("defaultConnectionId", "userId") REFERENCES "CalendarConnection"("id", "userId")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "CalendarPreference_writeSourceId_userId_fkey"
    FOREIGN KEY ("writeSourceId", "userId") REFERENCES "CalendarSource"("id", "userId")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CalendarConnection" DROP COLUMN "calendarId";

ALTER POLICY google_calendar_credential_select_policy ON "CalendarConnection"
  RENAME TO calendar_connection_select_policy;
ALTER POLICY google_calendar_credential_insert_policy ON "CalendarConnection"
  RENAME TO calendar_connection_insert_policy;
ALTER POLICY google_calendar_credential_update_policy ON "CalendarConnection"
  RENAME TO calendar_connection_update_policy;
ALTER POLICY google_calendar_credential_delete_policy ON "CalendarConnection"
  RENAME TO calendar_connection_delete_policy;

ALTER TABLE "CalendarConnection" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CalendarConnection" FORCE ROW LEVEL SECURITY;

ALTER TABLE "CalendarSource" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CalendarSource" FORCE ROW LEVEL SECURITY;
CREATE POLICY calendar_source_select_policy ON "CalendarSource"
  FOR SELECT USING ("userId" = app.current_user_id());
CREATE POLICY calendar_source_insert_policy ON "CalendarSource"
  FOR INSERT WITH CHECK ("userId" = app.current_user_id());
CREATE POLICY calendar_source_update_policy ON "CalendarSource"
  FOR UPDATE USING ("userId" = app.current_user_id())
  WITH CHECK ("userId" = app.current_user_id());
CREATE POLICY calendar_source_delete_policy ON "CalendarSource"
  FOR DELETE USING ("userId" = app.current_user_id());

ALTER TABLE "CalendarPreference" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CalendarPreference" FORCE ROW LEVEL SECURITY;
CREATE POLICY calendar_preference_select_policy ON "CalendarPreference"
  FOR SELECT USING ("userId" = app.current_user_id());
CREATE POLICY calendar_preference_insert_policy ON "CalendarPreference"
  FOR INSERT WITH CHECK ("userId" = app.current_user_id());
CREATE POLICY calendar_preference_update_policy ON "CalendarPreference"
  FOR UPDATE USING ("userId" = app.current_user_id())
  WITH CHECK ("userId" = app.current_user_id());
CREATE POLICY calendar_preference_delete_policy ON "CalendarPreference"
  FOR DELETE USING ("userId" = app.current_user_id());
