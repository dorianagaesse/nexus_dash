-- Keep the least-privileged runtime role usable after a disposable Preview
-- schema reset. RLS remains the authorization boundary on application tables.

DO $$
DECLARE
    target RECORD;
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_runtime') THEN
        EXECUTE 'GRANT USAGE ON SCHEMA public TO app_runtime';

        FOR target IN
            SELECT schemaname, tablename
            FROM pg_tables
            WHERE schemaname = 'public'
              AND tablename NOT IN ('_prisma_migrations', 'system_guard')
        LOOP
            EXECUTE format(
                'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE %I.%I TO app_runtime',
                target.schemaname,
                target.tablename
            );
        END LOOP;

        FOR target IN
            SELECT sequence_schema, sequence_name
            FROM information_schema.sequences
            WHERE sequence_schema = 'public'
        LOOP
            EXECUTE format(
                'GRANT USAGE, SELECT ON SEQUENCE %I.%I TO app_runtime',
                target.sequence_schema,
                target.sequence_name
            );
        END LOOP;

        EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_runtime';
        EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO app_runtime';

        REVOKE ALL ON TABLE public._prisma_migrations FROM app_runtime;
        REVOKE ALL ON TABLE public.system_guard FROM app_runtime;
    END IF;
END
$$;
