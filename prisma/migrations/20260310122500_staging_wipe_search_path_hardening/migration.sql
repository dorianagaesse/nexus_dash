-- Narrow the SECURITY DEFINER search_path now that all referenced objects
-- are schema-qualified.

CREATE OR REPLACE FUNCTION public.wipe_staging_data()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog'
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
