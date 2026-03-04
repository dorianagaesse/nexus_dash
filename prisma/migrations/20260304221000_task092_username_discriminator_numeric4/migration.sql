UPDATE "User"
SET "usernameDiscriminator" = NULL
WHERE "usernameDiscriminator" IS NOT NULL
  AND "usernameDiscriminator" !~ '^[0-9]{4}$';

ALTER TABLE "User"
ALTER COLUMN "usernameDiscriminator" TYPE VARCHAR(4);

ALTER TABLE "User"
DROP CONSTRAINT IF EXISTS "User_usernameDiscriminator_format_check";

ALTER TABLE "User"
ADD CONSTRAINT "User_usernameDiscriminator_format_check"
CHECK (
  "usernameDiscriminator" IS NULL
  OR "usernameDiscriminator" ~ '^[0-9]{4}$'
);
