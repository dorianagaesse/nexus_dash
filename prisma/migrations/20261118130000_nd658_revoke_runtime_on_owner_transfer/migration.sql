-- Retire device grants on ownership change so they can never become valid
-- again if the same owner returns. Keep the actor and all historical records.
CREATE FUNCTION app.revoke_runtime_on_project_owner_change() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  UPDATE public."AgentRuntimeDevice" d
  SET "revokedAt" = COALESCE(d."revokedAt", CURRENT_TIMESTAMP), "pairingHash" = NULL
  FROM public."ApiCredential" a
  WHERE a.id = d."identityId" AND a."projectId" = NEW.id
    AND (d."revokedAt" IS NULL OR d."pairingHash" IS NOT NULL);

  UPDATE public."AgentRuntimeCredential" c
  SET "revokedAt" = CURRENT_TIMESTAMP
  FROM public."AgentRuntimeDevice" d JOIN public."ApiCredential" a ON a.id = d."identityId"
  WHERE d.id = c."deviceId" AND a."projectId" = NEW.id AND c."revokedAt" IS NULL;

  UPDATE public."AgentRuntimeSession" s
  SET "endedAt" = CURRENT_TIMESTAMP
  FROM public."AgentRuntimeDevice" d JOIN public."ApiCredential" a ON a.id = d."identityId"
  WHERE d.id = s."deviceId" AND a."projectId" = NEW.id AND s."endedAt" IS NULL;

  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION app.revoke_runtime_on_project_owner_change() FROM PUBLIC;
CREATE TRIGGER nd658_revoke_runtime_on_owner_change AFTER UPDATE OF "ownerId" ON public."Project"
FOR EACH ROW WHEN (OLD."ownerId" IS DISTINCT FROM NEW."ownerId")
EXECUTE FUNCTION app.revoke_runtime_on_project_owner_change();
