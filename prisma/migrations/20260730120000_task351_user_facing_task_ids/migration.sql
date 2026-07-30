-- TASK-351 gives every existing and future task a stable, user-facing number.
-- PostgreSQL owns allocation so concurrent task creates cannot collide, while
-- the existing CUID remains the internal primary key and relation target.
CREATE SEQUENCE "Task_referenceNumber_seq";

ALTER TABLE "Task"
ADD COLUMN "referenceNumber" INTEGER NOT NULL
DEFAULT nextval('"Task_referenceNumber_seq"');

ALTER SEQUENCE "Task_referenceNumber_seq"
OWNED BY "Task"."referenceNumber";

CREATE UNIQUE INDEX "Task_referenceNumber_key"
ON "Task"("referenceNumber");

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_runtime') THEN
    GRANT USAGE, SELECT ON SEQUENCE "Task_referenceNumber_seq" TO app_runtime;
  END IF;
END
$$;
