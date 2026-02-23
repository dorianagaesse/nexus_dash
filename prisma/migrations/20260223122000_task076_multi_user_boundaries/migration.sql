-- TASK-076 intentionally applies a reset-path migration for clean staging/prod test data.
-- Existing rows are not backfilled; NOT NULL ownership columns are enforced immediately.

-- CreateEnum
CREATE TYPE "ProjectMembershipRole" AS ENUM ('owner', 'editor', 'viewer');

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "ownerId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "TaskAttachment" ADD COLUMN     "uploadedByUserId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "ResourceAttachment" ADD COLUMN     "uploadedByUserId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "GoogleCalendarCredential" ADD COLUMN     "calendarId" TEXT NOT NULL DEFAULT 'primary',
ADD COLUMN     "providerAccountId" TEXT,
ADD COLUMN     "revokedAt" TIMESTAMP(3),
ADD COLUMN     "userId" TEXT NOT NULL,
ALTER COLUMN "id" DROP DEFAULT;

-- CreateTable
CREATE TABLE "ProjectMembership" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "ProjectMembershipRole" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectMembership_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProjectMembership_userId_idx" ON "ProjectMembership"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectMembership_projectId_userId_key" ON "ProjectMembership"("projectId", "userId");

-- CreateIndex
CREATE INDEX "Project_ownerId_idx" ON "Project"("ownerId");

-- CreateIndex
CREATE INDEX "TaskAttachment_uploadedByUserId_idx" ON "TaskAttachment"("uploadedByUserId");

-- CreateIndex
CREATE INDEX "ResourceAttachment_uploadedByUserId_idx" ON "ResourceAttachment"("uploadedByUserId");

-- CreateIndex
CREATE UNIQUE INDEX "GoogleCalendarCredential_userId_key" ON "GoogleCalendarCredential"("userId");

-- CreateIndex
CREATE INDEX "GoogleCalendarCredential_providerAccountId_idx" ON "GoogleCalendarCredential"("providerAccountId");

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectMembership" ADD CONSTRAINT "ProjectMembership_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectMembership" ADD CONSTRAINT "ProjectMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskAttachment" ADD CONSTRAINT "TaskAttachment_uploadedByUserId_fkey" FOREIGN KEY ("uploadedByUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResourceAttachment" ADD CONSTRAINT "ResourceAttachment_uploadedByUserId_fkey" FOREIGN KEY ("uploadedByUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoogleCalendarCredential" ADD CONSTRAINT "GoogleCalendarCredential_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
