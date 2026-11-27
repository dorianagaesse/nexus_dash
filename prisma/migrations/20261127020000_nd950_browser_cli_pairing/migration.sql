-- CreateTable
CREATE TABLE "AgentCliPairingRequest" (
    "id" TEXT NOT NULL,
    "userCodeHash" TEXT NOT NULL,
    "pollSecretHash" TEXT NOT NULL,
    "installSecretHash" TEXT NOT NULL,
    "requestedDeviceName" VARCHAR(80) NOT NULL,
    "requestedProjectId" VARCHAR(128),
    "requestedIdentityId" VARCHAR(128),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "approvedAt" TIMESTAMP(3),
    "deniedAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "approvedByUserId" TEXT,
    "approvedDeviceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentCliPairingRequest_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "AgentCliPairingRequest_decision_check" CHECK (
        NOT ("approvedAt" IS NOT NULL AND "deniedAt" IS NOT NULL)
        AND ("approvedAt" IS NULL OR ("approvedByUserId" IS NOT NULL AND "approvedDeviceId" IS NOT NULL))
        AND ("deliveredAt" IS NULL OR "approvedAt" IS NOT NULL)
    )
);

-- CreateIndex
CREATE UNIQUE INDEX "AgentCliPairingRequest_userCodeHash_key" ON "AgentCliPairingRequest"("userCodeHash");

-- CreateIndex
CREATE UNIQUE INDEX "AgentCliPairingRequest_pollSecretHash_key" ON "AgentCliPairingRequest"("pollSecretHash");

-- CreateIndex
CREATE UNIQUE INDEX "AgentCliPairingRequest_installSecretHash_key" ON "AgentCliPairingRequest"("installSecretHash");

-- CreateIndex
CREATE UNIQUE INDEX "AgentCliPairingRequest_approvedDeviceId_key" ON "AgentCliPairingRequest"("approvedDeviceId");

-- CreateIndex
CREATE INDEX "AgentCliPairingRequest_expiresAt_idx" ON "AgentCliPairingRequest"("expiresAt");

-- CreateIndex
CREATE INDEX "AgentCliPairingRequest_approvedByUserId_idx" ON "AgentCliPairingRequest"("approvedByUserId");

-- AddForeignKey
ALTER TABLE "AgentCliPairingRequest" ADD CONSTRAINT "AgentCliPairingRequest_approvedByUserId_fkey" FOREIGN KEY ("approvedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentCliPairingRequest" ADD CONSTRAINT "AgentCliPairingRequest_approvedDeviceId_fkey" FOREIGN KEY ("approvedDeviceId") REFERENCES "AgentRuntimeDevice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Proof digests on a CLI pairing request are immutable after creation.
CREATE FUNCTION app.guard_agent_cli_pairing_request() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
  IF NEW."userCodeHash" IS DISTINCT FROM OLD."userCodeHash"
     OR NEW."pollSecretHash" IS DISTINCT FROM OLD."pollSecretHash"
     OR NEW."installSecretHash" IS DISTINCT FROM OLD."installSecretHash" THEN
    RAISE EXCEPTION 'immutable cli pairing proof hash' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER guard_cli_pairing_request
BEFORE UPDATE ON "AgentCliPairingRequest"
FOR EACH ROW EXECUTE FUNCTION app.guard_agent_cli_pairing_request();

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_runtime') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "AgentCliPairingRequest" TO app_runtime;
  END IF;
END $$;
