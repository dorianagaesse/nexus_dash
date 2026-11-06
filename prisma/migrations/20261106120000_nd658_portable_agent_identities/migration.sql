-- AlterTable
ALTER TABLE "ApiCredential" ADD COLUMN     "avatarSeed" VARCHAR(64),
ADD COLUMN     "identityMode" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "roleLabel" VARCHAR(80);

-- CreateTable
CREATE TABLE "AgentRuntimeDevice" (
    "authorizedByUserId" TEXT NOT NULL,    "id" TEXT NOT NULL,
    "identityId" TEXT NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "scopes" "ApiCredentialScope"[],
    "canMoveTasksToDone" BOOLEAN NOT NULL DEFAULT false,
    "pairingHash" TEXT,
    "pairingExpiresAt" TIMESTAMP(3) NOT NULL,
    "authorizedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentRuntimeDevice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentRuntimeCredential" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentRuntimeCredential_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentRuntimeSession" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "client" VARCHAR(80) NOT NULL,
    "scopes" "ApiCredentialScope"[],
    "canMoveTasksToDone" BOOLEAN NOT NULL DEFAULT false,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),
    "lastActiveAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentRuntimeSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AgentRuntimeDevice_pairingHash_key" ON "AgentRuntimeDevice"("pairingHash");

-- CreateIndex
CREATE INDEX "AgentRuntimeDevice_identityId_idx" ON "AgentRuntimeDevice"("identityId");

-- CreateIndex
CREATE UNIQUE INDEX "AgentRuntimeCredential_tokenHash_key" ON "AgentRuntimeCredential"("tokenHash");

-- CreateIndex
CREATE INDEX "AgentRuntimeCredential_deviceId_idx" ON "AgentRuntimeCredential"("deviceId");

-- CreateIndex
CREATE INDEX "AgentRuntimeSession_deviceId_createdAt_idx" ON "AgentRuntimeSession"("deviceId", "createdAt");

ALTER TABLE "AgentRuntimeDevice" ADD CONSTRAINT "AgentRuntimeDevice_authorizedByUserId_fkey" FOREIGN KEY ("authorizedByUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentRuntimeDevice" ADD CONSTRAINT "AgentRuntimeDevice_identityId_fkey" FOREIGN KEY ("identityId") REFERENCES "ApiCredential"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentRuntimeCredential" ADD CONSTRAINT "AgentRuntimeCredential_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "AgentRuntimeDevice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentRuntimeSession" ADD CONSTRAINT "AgentRuntimeSession_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "AgentRuntimeDevice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AgentRuntimeDevice" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AgentRuntimeDevice" FORCE ROW LEVEL SECURITY;
CREATE POLICY "AgentRuntimeDevice_select" ON "AgentRuntimeDevice" FOR SELECT USING (EXISTS (SELECT 1 FROM public."ApiCredential" a WHERE a.id = "identityId" AND app.is_project_owner(a."projectId")));
CREATE POLICY "AgentRuntimeDevice_insert" ON "AgentRuntimeDevice" FOR INSERT WITH CHECK ("authorizedByUserId" = app.current_user_id() AND EXISTS (SELECT 1 FROM public."ApiCredential" a WHERE a.id = "identityId" AND app.is_project_owner(a."projectId")));
CREATE POLICY "AgentRuntimeDevice_update" ON "AgentRuntimeDevice" FOR UPDATE USING (EXISTS (SELECT 1 FROM public."ApiCredential" a WHERE a.id = "identityId" AND app.is_project_owner(a."projectId"))) WITH CHECK (EXISTS (SELECT 1 FROM public."ApiCredential" a WHERE a.id = "identityId" AND app.is_project_owner(a."projectId")));
CREATE POLICY "AgentRuntimeDevice_delete" ON "AgentRuntimeDevice" FOR DELETE USING (EXISTS (SELECT 1 FROM public."ApiCredential" a WHERE a.id = "identityId" AND app.is_project_owner(a."projectId")));

ALTER TABLE "AgentRuntimeCredential" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AgentRuntimeCredential" FORCE ROW LEVEL SECURITY;
CREATE POLICY "AgentRuntimeCredential_select" ON "AgentRuntimeCredential" FOR SELECT USING (EXISTS (SELECT 1 FROM public."AgentRuntimeDevice" d JOIN public."ApiCredential" a ON a.id = d."identityId" WHERE d.id = "deviceId" AND app.is_project_owner(a."projectId")));
CREATE POLICY "AgentRuntimeCredential_insert" ON "AgentRuntimeCredential" FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM public."AgentRuntimeDevice" d JOIN public."ApiCredential" a ON a.id = d."identityId" WHERE d.id = "deviceId" AND app.is_project_owner(a."projectId")));
CREATE POLICY "AgentRuntimeCredential_update" ON "AgentRuntimeCredential" FOR UPDATE USING (EXISTS (SELECT 1 FROM public."AgentRuntimeDevice" d JOIN public."ApiCredential" a ON a.id = d."identityId" WHERE d.id = "deviceId" AND app.is_project_owner(a."projectId"))) WITH CHECK (EXISTS (SELECT 1 FROM public."AgentRuntimeDevice" d JOIN public."ApiCredential" a ON a.id = d."identityId" WHERE d.id = "deviceId" AND app.is_project_owner(a."projectId")));
CREATE POLICY "AgentRuntimeCredential_delete" ON "AgentRuntimeCredential" FOR DELETE USING (EXISTS (SELECT 1 FROM public."AgentRuntimeDevice" d JOIN public."ApiCredential" a ON a.id = d."identityId" WHERE d.id = "deviceId" AND app.is_project_owner(a."projectId")));

ALTER TABLE "AgentRuntimeSession" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AgentRuntimeSession" FORCE ROW LEVEL SECURITY;
CREATE POLICY "AgentRuntimeSession_select" ON "AgentRuntimeSession" FOR SELECT USING (EXISTS (SELECT 1 FROM public."AgentRuntimeDevice" d JOIN public."ApiCredential" a ON a.id = d."identityId" WHERE d.id = "deviceId" AND app.is_project_owner(a."projectId")));
CREATE POLICY "AgentRuntimeSession_insert" ON "AgentRuntimeSession" FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM public."AgentRuntimeDevice" d JOIN public."ApiCredential" a ON a.id = d."identityId" WHERE d.id = "deviceId" AND app.is_project_owner(a."projectId")));
CREATE POLICY "AgentRuntimeSession_update" ON "AgentRuntimeSession" FOR UPDATE USING (EXISTS (SELECT 1 FROM public."AgentRuntimeDevice" d JOIN public."ApiCredential" a ON a.id = d."identityId" WHERE d.id = "deviceId" AND app.is_project_owner(a."projectId"))) WITH CHECK (EXISTS (SELECT 1 FROM public."AgentRuntimeDevice" d JOIN public."ApiCredential" a ON a.id = d."identityId" WHERE d.id = "deviceId" AND app.is_project_owner(a."projectId")));
CREATE POLICY "AgentRuntimeSession_delete" ON "AgentRuntimeSession" FOR DELETE USING (EXISTS (SELECT 1 FROM public."AgentRuntimeDevice" d JOIN public."ApiCredential" a ON a.id = d."identityId" WHERE d.id = "deviceId" AND app.is_project_owner(a."projectId")));

-- Bindings are immutable even for owners: reauthorize instead of repointing a
-- device, credential or session to another logical actor.
CREATE FUNCTION app.guard_agent_runtime_binding() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
  IF (TG_TABLE_NAME = 'AgentRuntimeDevice' AND (to_jsonb(NEW)->>'identityId' IS DISTINCT FROM to_jsonb(OLD)->>'identityId' OR to_jsonb(NEW)->>'authorizedByUserId' IS DISTINCT FROM to_jsonb(OLD)->>'authorizedByUserId'))
     OR (TG_TABLE_NAME <> 'AgentRuntimeDevice' AND to_jsonb(NEW)->>'deviceId' IS DISTINCT FROM to_jsonb(OLD)->>'deviceId') THEN
    RAISE EXCEPTION 'immutable runtime binding' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER guard_runtime_device BEFORE UPDATE ON "AgentRuntimeDevice" FOR EACH ROW EXECUTE FUNCTION app.guard_agent_runtime_binding();
CREATE TRIGGER guard_runtime_credential BEFORE UPDATE ON "AgentRuntimeCredential" FOR EACH ROW EXECUTE FUNCTION app.guard_agent_runtime_binding();
CREATE TRIGGER guard_runtime_session BEFORE UPDATE ON "AgentRuntimeSession" FOR EACH ROW EXECUTE FUNCTION app.guard_agent_runtime_binding();

-- A high-entropy proof, not a public identifier, is required before RLS context.
CREATE FUNCTION app.resolve_agent_runtime_proof(_hash TEXT, _pairing BOOLEAN)
RETURNS TABLE (device_id TEXT, owner_id TEXT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT d.id, p."ownerId"
  FROM public."AgentRuntimeDevice" d
  JOIN public."ApiCredential" a ON a.id = d."identityId"
  JOIN public."Project" p ON p.id = a."projectId"
  WHERE _hash ~ '^[a-f0-9]{64}$' AND d."revokedAt" IS NULL AND d."expiresAt" > now()
    AND a."revokedAt" IS NULL AND (a."expiresAt" IS NULL OR a."expiresAt" > now())
    AND p."ownerId" = d."authorizedByUserId"
    AND ((_pairing AND d."pairingHash" = _hash AND d."pairingExpiresAt" > now() AND d."authorizedAt" IS NULL)
      OR (NOT _pairing AND d."authorizedAt" IS NOT NULL AND EXISTS (
        SELECT 1 FROM public."AgentRuntimeCredential" c WHERE c."deviceId" = d.id
        AND c."tokenHash" = _hash AND c."revokedAt" IS NULL AND c."expiresAt" > now()
      )))
  LIMIT 1;
$$;
REVOKE ALL ON FUNCTION app.resolve_agent_runtime_proof(TEXT, BOOLEAN) FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_runtime') THEN
    GRANT EXECUTE ON FUNCTION app.resolve_agent_runtime_proof(TEXT, BOOLEAN) TO app_runtime;
    GRANT SELECT, INSERT, UPDATE, DELETE ON "AgentRuntimeDevice", "AgentRuntimeCredential", "AgentRuntimeSession" TO app_runtime;
  END IF;
END $$;
