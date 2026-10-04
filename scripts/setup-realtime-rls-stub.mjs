import process from "node:process";

import pg from "pg";

const databaseUrl = process.env.RLS_TEST_ADMIN_DATABASE_URL;
if (!databaseUrl) {
  throw new Error("RLS_TEST_ADMIN_DATABASE_URL is required.");
}

const client = new pg.Client({ connectionString: databaseUrl });
await client.connect();
try {
  await client.query(`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        CREATE ROLE authenticated NOLOGIN NOBYPASSRLS;
      END IF;
    END $$;
    CREATE SCHEMA IF NOT EXISTS realtime;
    CREATE TABLE IF NOT EXISTS realtime.messages (
      id bigserial PRIMARY KEY,
      extension text NOT NULL,
      topic text NOT NULL,
      event text,
      payload jsonb,
      private boolean NOT NULL DEFAULT true
    );
    ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;
    GRANT USAGE ON SCHEMA realtime TO authenticated;
    GRANT SELECT, INSERT ON realtime.messages TO authenticated;
    GRANT USAGE ON SEQUENCE realtime.messages_id_seq TO authenticated;

    CREATE OR REPLACE FUNCTION realtime.topic() RETURNS text
      LANGUAGE sql STABLE AS $$
        SELECT NULLIF(current_setting('realtime.topic', true), '');
      $$;
    CREATE OR REPLACE FUNCTION realtime.send(
      payload jsonb, event text, topic text, is_private boolean
    ) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
    BEGIN
      INSERT INTO realtime.messages(extension, topic, event, payload, private)
      VALUES ('broadcast', topic, event, payload, is_private);
    END;
    $$;
  `);
  console.log("Prepared Realtime policy and broadcast test stub.");
} finally {
  await client.end();
}
