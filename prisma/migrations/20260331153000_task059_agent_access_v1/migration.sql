CREATE TYPE "ApiCredentialScope" AS ENUM (
  'project_read',
  'task_read',
  'task_write',
  'task_delete',
  'context_read',
  'context_write',
  'context_delete'
);

CREATE TYPE "AuthAuditActorKind" AS ENUM ('human', 'agent');
CREATE TYPE "AuthAuditAction" AS ENUM (
  'credential_created',
  'credential_rotated',
  'credential_revoked',
  'token_exchanged',
  'request_used'
);

CREATE TABLE "ApiCredential" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "createdByUserId" TEXT NOT NULL,
  "revokedByUserId" TEXT,
  "label" VARCHAR(80) NOT NULL,
  "publicId" VARCHAR(64) NOT NULL,
  "secretHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3),
  "lastUsedAt" TIMESTAMP(3),
  "lastExchangedAt" TIMESTAMP(3),
  "lastRotatedAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ApiCredential_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ApiCredentialScopeGrant" (
  "credentialId" TEXT NOT NULL,
  "scope" "ApiCredentialScope" NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ApiCredentialScopeGrant_pkey" PRIMARY KEY ("credentialId", "scope")
);

CREATE TABLE "AuthAuditEvent" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "credentialId" TEXT,
  "actorUserId" TEXT,
  "actorKind" "AuthAuditActorKind" NOT NULL,
  "action" "AuthAuditAction" NOT NULL,
  "requestId" VARCHAR(128),
  "ipAddress" VARCHAR(64),
  "userAgent" VARCHAR(512),
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AuthAuditEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ApiCredential_publicId_key" ON "ApiCredential"("publicId");
CREATE INDEX "ApiCredential_projectId_idx" ON "ApiCredential"("projectId");
CREATE INDEX "ApiCredential_createdByUserId_idx" ON "ApiCredential"("createdByUserId");
CREATE INDEX "ApiCredential_revokedByUserId_idx" ON "ApiCredential"("revokedByUserId");
CREATE INDEX "ApiCredentialScopeGrant_scope_idx" ON "ApiCredentialScopeGrant"("scope");
CREATE INDEX "AuthAuditEvent_projectId_createdAt_idx" ON "AuthAuditEvent"("projectId", "createdAt");
CREATE INDEX "AuthAuditEvent_credentialId_createdAt_idx" ON "AuthAuditEvent"("credentialId", "createdAt");
CREATE INDEX "AuthAuditEvent_actorUserId_createdAt_idx" ON "AuthAuditEvent"("actorUserId", "createdAt");

ALTER TABLE "ApiCredential"
  ADD CONSTRAINT "ApiCredential_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "Project"("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;

ALTER TABLE "ApiCredential"
  ADD CONSTRAINT "ApiCredential_createdByUserId_fkey"
  FOREIGN KEY ("createdByUserId") REFERENCES "User"("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;

ALTER TABLE "ApiCredential"
  ADD CONSTRAINT "ApiCredential_revokedByUserId_fkey"
  FOREIGN KEY ("revokedByUserId") REFERENCES "User"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;

ALTER TABLE "ApiCredentialScopeGrant"
  ADD CONSTRAINT "ApiCredentialScopeGrant_credentialId_fkey"
  FOREIGN KEY ("credentialId") REFERENCES "ApiCredential"("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;

ALTER TABLE "AuthAuditEvent"
  ADD CONSTRAINT "AuthAuditEvent_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "Project"("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;

ALTER TABLE "AuthAuditEvent"
  ADD CONSTRAINT "AuthAuditEvent_credentialId_fkey"
  FOREIGN KEY ("credentialId") REFERENCES "ApiCredential"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;

ALTER TABLE "AuthAuditEvent"
  ADD CONSTRAINT "AuthAuditEvent_actorUserId_fkey"
  FOREIGN KEY ("actorUserId") REFERENCES "User"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;
