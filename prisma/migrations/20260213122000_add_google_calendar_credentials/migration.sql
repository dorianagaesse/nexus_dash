-- CreateTable
CREATE TABLE "GoogleCalendarCredential" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'default',
    "accessToken" TEXT,
    "refreshToken" TEXT NOT NULL,
    "tokenType" TEXT,
    "scope" TEXT,
    "expiresAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
