-- Create the staging wipe guard table and codify the scheduled cleanup function.
-- This keeps the staging-only wipe path safe by default while allowing the
-- legacy staging database (where the manual function already exists) to stay enabled.

CREATE TABLE IF NOT EXISTS public.system_guard (
    id INTEGER PRIMARY KEY,
    environment TEXT NOT NULL DEFAULT 'unknown',
    allow_staging_wipe BOOLEAN NOT NULL DEFAULT false,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT system_guard_singleton_id CHECK (id = 1),
    CONSTRAINT system_guard_environment_check CHECK (environment IN ('unknown', 'staging', 'production'))
);

DO $$
DECLARE
    had_legacy_wipe_function BOOLEAN := to_regprocedure('public.wipe_staging_data()') IS NOT NULL;
BEGIN
    INSERT INTO public.system_guard (id, environment, allow_staging_wipe)
    VALUES (
        1,
        CASE WHEN had_legacy_wipe_function THEN 'staging' ELSE 'unknown' END,
        CASE WHEN had_legacy_wipe_function THEN true ELSE false END
    )
    ON CONFLICT (id) DO UPDATE
    SET environment = CASE
            WHEN public.system_guard.environment = 'unknown'
             AND EXCLUDED.environment = 'staging'
            THEN EXCLUDED.environment
            ELSE public.system_guard.environment
        END,
        allow_staging_wipe = CASE
            WHEN public.system_guard.environment = 'unknown'
             AND EXCLUDED.environment = 'staging'
            THEN EXCLUDED.allow_staging_wipe
            ELSE public.system_guard.allow_staging_wipe
        END,
        updated_at = CURRENT_TIMESTAMP;
END
$$;

CREATE OR REPLACE FUNCTION public.wipe_staging_data()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  guard_env text;
  guard_enabled boolean;
  tables_to_truncate text;
BEGIN
  SELECT sg.environment, sg.allow_staging_wipe
    INTO guard_env, guard_enabled
  FROM public.system_guard sg
  WHERE sg.id = 1;

  IF guard_env IS DISTINCT FROM 'staging'
     OR guard_enabled IS DISTINCT FROM true THEN
    RAISE EXCEPTION
      'Refusing wipe: environment=%, allow_staging_wipe=%',
      guard_env, guard_enabled;
  END IF;

  SELECT string_agg(format('%I.%I', t.schemaname, t.tablename), ', ')
    INTO tables_to_truncate
  FROM pg_catalog.pg_tables t
  WHERE t.schemaname = 'public'
    AND t.tablename NOT IN ('_prisma_migrations', 'system_guard');

  IF tables_to_truncate IS NOT NULL THEN
    EXECUTE 'TRUNCATE TABLE ' || tables_to_truncate || ' RESTART IDENTITY CASCADE';
    UPDATE public.system_guard
    SET updated_at = CURRENT_TIMESTAMP
    WHERE id = 1;
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.wipe_staging_data() FROM PUBLIC;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
        EXECUTE 'GRANT EXECUTE ON FUNCTION public.wipe_staging_data() TO service_role';
    END IF;

    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_runtime') THEN
        EXECUTE 'GRANT EXECUTE ON FUNCTION public.wipe_staging_data() TO app_runtime';
    END IF;
END
$$;
