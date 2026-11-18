-- Public author metadata is independent of API key material and remains after
-- a credential is deleted. Existing linked comments adopt current metadata.
BEGIN;
CREATE TABLE "AgentAuthorIdentity" (
  "id" TEXT PRIMARY KEY,
  "projectId" TEXT NOT NULL REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "label" VARCHAR(80) NOT NULL,
  "descriptiveLabels" VARCHAR(40)[] NOT NULL DEFAULT ARRAY[]::VARCHAR(40)[],
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "AgentAuthorIdentity_projectId_idx" ON "AgentAuthorIdentity"("projectId");

INSERT INTO "AgentAuthorIdentity" ("id", "projectId", "label", "descriptiveLabels", "createdAt", "updatedAt")
SELECT "id", "projectId", "label", "descriptiveLabels", "createdAt", "updatedAt"
FROM "ApiCredential";

ALTER TABLE "TaskComment" ADD COLUMN "authorAgentIdentityId" TEXT;
UPDATE "TaskComment" comment SET "authorAgentIdentityId" = credential.id
FROM "ApiCredential" credential, "Task" task
WHERE comment."authorAgentCredentialId" = credential.id
  AND comment."taskId" = task.id AND task."projectId" = credential."projectId";
ALTER TABLE "TaskComment" ADD CONSTRAINT "TaskComment_authorAgentIdentityId_fkey"
FOREIGN KEY ("authorAgentIdentityId") REFERENCES "AgentAuthorIdentity"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "TaskComment_authorAgentIdentityId_idx" ON "TaskComment"("authorAgentIdentityId");

ALTER TABLE "AgentAuthorIdentity" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AgentAuthorIdentity" FORCE ROW LEVEL SECURITY;
CREATE POLICY agent_author_identity_select_policy ON "AgentAuthorIdentity"
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM "Project" p
    WHERE p.id = "AgentAuthorIdentity"."projectId"
      AND (p."ownerId" = app.current_user_id() OR EXISTS (
        SELECT 1 FROM "ProjectMembership" pm
        WHERE pm."projectId" = p.id AND pm."userId" = app.current_user_id()
      ))
  )
);
-- Runtime callers can read the projection but cannot forge/edit/delete it.
-- Writes originate only from the already-authorized credential mutation.
CREATE FUNCTION app.sync_agent_author_identity()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.label IS NOT DISTINCT FROM OLD.label
     AND NEW."descriptiveLabels" IS NOT DISTINCT FROM OLD."descriptiveLabels" THEN
    RETURN NEW;
  END IF;
  INSERT INTO public."AgentAuthorIdentity" ("id", "projectId", "label", "descriptiveLabels", "createdAt", "updatedAt")
  VALUES (NEW.id, NEW."projectId", NEW.label, NEW."descriptiveLabels", NEW."createdAt", clock_timestamp())
  ON CONFLICT ("id") DO UPDATE SET
    "label" = EXCLUDED."label", "descriptiveLabels" = EXCLUDED."descriptiveLabels",
    "updatedAt" = EXCLUDED."updatedAt"
  WHERE public."AgentAuthorIdentity"."projectId" = EXCLUDED."projectId";
  IF NOT FOUND THEN
    RAISE EXCEPTION 'agent-author-identity-project-mismatch' USING ERRCODE = '23514';
  END IF;
  -- Metadata changes invalidate open comment author views, without editing
  -- historical comments or incrementing task content revisions.
  UPDATE public."Project"
  SET "updatedAt" = GREATEST("updatedAt" + interval '1 millisecond', clock_timestamp())
  WHERE id = NEW."projectId";
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION app.sync_agent_author_identity() FROM PUBLIC;
CREATE TRIGGER api_credential_sync_author_identity
AFTER INSERT OR UPDATE OF label, "descriptiveLabels" ON "ApiCredential"
FOR EACH ROW EXECUTE FUNCTION app.sync_agent_author_identity();

-- Also covers comments posted through older immutable deployments after this
-- additive migration. Clearing the credential FK never clears the author FK.
CREATE FUNCTION app.bind_comment_agent_identity()
RETURNS TRIGGER LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW."authorAgentCredentialId" IS NOT NULL THEN
      NEW."authorAgentIdentityId" := NEW."authorAgentCredentialId";
    END IF;
  ELSE
    IF NEW."authorAgentCredentialId" IS DISTINCT FROM OLD."authorAgentCredentialId"
       AND NEW."authorAgentCredentialId" IS NOT NULL THEN
      NEW."authorAgentIdentityId" := NEW."authorAgentCredentialId";
    END IF;
    IF NEW."authorAgentIdentityId" IS NOT DISTINCT FROM OLD."authorAgentIdentityId"
       AND NEW."taskId" = OLD."taskId" THEN
      RETURN NEW;
    END IF;
  END IF;
  IF NEW."authorAgentIdentityId" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public."AgentAuthorIdentity" identity
    JOIN public."Task" task ON task.id = NEW."taskId" AND task."projectId" = identity."projectId"
    WHERE identity.id = NEW."authorAgentIdentityId"
  ) THEN
    RAISE EXCEPTION 'comment-agent-identity-project-mismatch' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION app.bind_comment_agent_identity() FROM PUBLIC;
CREATE TRIGGER task_comment_bind_agent_identity
BEFORE INSERT OR UPDATE OF "authorAgentCredentialId", "authorAgentIdentityId", "taskId" ON "TaskComment"
FOR EACH ROW EXECUTE FUNCTION app.bind_comment_agent_identity();

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_runtime') THEN
    GRANT SELECT ON "AgentAuthorIdentity" TO app_runtime;
  END IF;
END $$;
COMMIT;
