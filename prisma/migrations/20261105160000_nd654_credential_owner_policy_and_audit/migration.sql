-- The current project owner manages inherited credentials after a transfer.
-- Creator attribution stays historical; administration follows current ownership.
ALTER POLICY api_credential_update_policy ON "ApiCredential"
USING (app.is_project_owner("projectId"))
WITH CHECK (app.is_project_owner("projectId"));

-- Replacing the creator check must not permit rewriting credential provenance
-- or moving a credential into another project, even between owned projects.
CREATE FUNCTION app.preserve_api_credential_identity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
  IF NEW."projectId" IS DISTINCT FROM OLD."projectId"
     OR NEW."createdByUserId" IS DISTINCT FROM OLD."createdByUserId" THEN
    RAISE EXCEPTION 'Credential project and creator are immutable'
      USING ERRCODE = '42501';
  END IF;
  IF NEW."revokedByUserId" IS DISTINCT FROM OLD."revokedByUserId"
     AND NEW."revokedByUserId" IS NOT NULL
     AND app.current_user_id() IS NOT NULL
     AND NEW."revokedByUserId" IS DISTINCT FROM app.current_user_id() THEN
    RAISE EXCEPTION 'Credential revoker must be the current actor'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER api_credential_preserve_identity
BEFORE UPDATE OF "projectId", "createdByUserId", "revokedByUserId" ON "ApiCredential"
FOR EACH ROW EXECUTE FUNCTION app.preserve_api_credential_identity();

ALTER TYPE "AuthAuditAction" ADD VALUE 'credential_capabilities_updated';
