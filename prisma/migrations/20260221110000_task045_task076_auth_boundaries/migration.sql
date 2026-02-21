-- CreateEnum
CREATE TYPE "ProjectMembershipRole" AS ENUM ('owner', 'editor', 'viewer');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT,
    "emailVerified" TIMESTAMP(3),
    "image" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationToken" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL
);

-- CreateTable
CREATE TABLE "ProjectMembership" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "ProjectMembershipRole" NOT NULL DEFAULT 'viewer',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectMembership_pkey" PRIMARY KEY ("id")
);

-- Create bootstrap user before adding new FKs/default owners.
INSERT INTO "User" ("id", "name", "email", "createdAt", "updatedAt")
VALUES ('bootstrap-owner', 'Bootstrap Owner', 'bootstrap@nexusdash.local', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;

-- AlterTable
ALTER TABLE "Project" ADD COLUMN "ownerId" TEXT NOT NULL DEFAULT 'bootstrap-owner';

-- AlterTable
ALTER TABLE "TaskAttachment" ADD COLUMN "uploadedByUserId" TEXT NOT NULL DEFAULT 'bootstrap-owner';

-- AlterTable
ALTER TABLE "ResourceAttachment" ADD COLUMN "uploadedByUserId" TEXT NOT NULL DEFAULT 'bootstrap-owner';

-- Replace singleton Google calendar credential table with user-scoped credentials.
ALTER TABLE "GoogleCalendarCredential" RENAME TO "GoogleCalendarCredentialLegacy";
ALTER TABLE "GoogleCalendarCredentialLegacy" RENAME CONSTRAINT "GoogleCalendarCredential_pkey" TO "GoogleCalendarCredentialLegacy_pkey";

CREATE TABLE "GoogleCalendarCredential" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "providerAccountId" TEXT,
    "calendarId" TEXT NOT NULL DEFAULT 'primary',
    "accessToken" TEXT,
    "refreshToken" TEXT NOT NULL,
    "tokenType" TEXT,
    "scope" TEXT,
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GoogleCalendarCredential_pkey" PRIMARY KEY ("id")
);

INSERT INTO "GoogleCalendarCredential" (
    "id",
    "userId",
    "providerAccountId",
    "calendarId",
    "accessToken",
    "refreshToken",
    "tokenType",
    "scope",
    "expiresAt",
    "createdAt",
    "updatedAt"
)
SELECT
    'bootstrap-google-calendar',
    'bootstrap-owner',
    NULL,
    'primary',
    "accessToken",
    "refreshToken",
    "tokenType",
    "scope",
    "expiresAt",
    "createdAt",
    "updatedAt"
FROM (
    SELECT *
    FROM "GoogleCalendarCredentialLegacy"
    ORDER BY "updatedAt" DESC
    LIMIT 1
) AS legacy;

DROP TABLE "GoogleCalendarCredentialLegacy";

-- Backfill owner memberships so owner access is explicit and role-based checks can rely on this table.
INSERT INTO "ProjectMembership" ("id", "projectId", "userId", "role", "createdAt", "updatedAt")
SELECT
    CONCAT('owner-membership-', "id"),
    "id",
    "ownerId",
    'owner'::"ProjectMembershipRole",
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "Project";

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Account_provider_providerAccountId_key" ON "Account"("provider", "providerAccountId");

-- CreateIndex
CREATE INDEX "Account_userId_idx" ON "Account"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_sessionToken_key" ON "Session"("sessionToken");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_token_key" ON "VerificationToken"("token");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_identifier_token_key" ON "VerificationToken"("identifier", "token");

-- CreateIndex
CREATE INDEX "Project_ownerId_idx" ON "Project"("ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectMembership_projectId_userId_key" ON "ProjectMembership"("projectId", "userId");

-- CreateIndex
CREATE INDEX "ProjectMembership_userId_idx" ON "ProjectMembership"("userId");

-- CreateIndex
CREATE INDEX "TaskAttachment_uploadedByUserId_idx" ON "TaskAttachment"("uploadedByUserId");

-- CreateIndex
CREATE INDEX "ResourceAttachment_uploadedByUserId_idx" ON "ResourceAttachment"("uploadedByUserId");

-- CreateIndex
CREATE UNIQUE INDEX "GoogleCalendarCredential_userId_key" ON "GoogleCalendarCredential"("userId");

-- CreateIndex
CREATE INDEX "GoogleCalendarCredential_providerAccountId_idx" ON "GoogleCalendarCredential"("providerAccountId");

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectMembership" ADD CONSTRAINT "ProjectMembership_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectMembership" ADD CONSTRAINT "ProjectMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskAttachment" ADD CONSTRAINT "TaskAttachment_uploadedByUserId_fkey" FOREIGN KEY ("uploadedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResourceAttachment" ADD CONSTRAINT "ResourceAttachment_uploadedByUserId_fkey" FOREIGN KEY ("uploadedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoogleCalendarCredential" ADD CONSTRAINT "GoogleCalendarCredential_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
