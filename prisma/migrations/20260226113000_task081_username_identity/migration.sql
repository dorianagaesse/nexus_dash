-- TASK-081: add username identity fields for credential onboarding.
ALTER TABLE "User"
ADD COLUMN "username" VARCHAR(20),
ADD COLUMN "usernameDiscriminator" VARCHAR(6);

CREATE UNIQUE INDEX "User_username_usernameDiscriminator_key"
ON "User"("username", "usernameDiscriminator");

CREATE INDEX "User_username_idx" ON "User"("username");
