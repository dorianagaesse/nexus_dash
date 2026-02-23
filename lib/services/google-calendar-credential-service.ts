import {
  createExpiryDate,
} from "@/lib/google-calendar";
import { prisma } from "@/lib/prisma";
import {
  decryptGoogleToken,
  encryptGoogleToken,
} from "@/lib/services/google-token-crypto";

interface GoogleCalendarTokenInput {
  userId: string;
  accessToken: string;
  expiresIn: number;
  refreshToken?: string | null;
  tokenType?: string | null;
  scope?: string | null;
  providerAccountId?: string | null;
  calendarId?: string | null;
}

interface GoogleCalendarTokenUpdateInput {
  userId: string;
  accessToken: string;
  expiresIn: number;
  refreshToken: string;
  tokenType: string | null;
  scope: string | null;
}

export async function findGoogleCalendarCredential(userId: string) {
  const credential = await prisma.googleCalendarCredential.findUnique({
    where: { userId },
  });

  if (!credential) {
    return null;
  }

  return {
    ...credential,
    accessToken: credential.accessToken
      ? decryptGoogleToken(credential.accessToken)
      : null,
    refreshToken: decryptGoogleToken(credential.refreshToken),
  };
}

export async function updateGoogleCalendarCredentialTokens(
  input: GoogleCalendarTokenUpdateInput
) {
  return prisma.googleCalendarCredential.update({
    where: { userId: input.userId },
    data: {
      accessToken: encryptGoogleToken(input.accessToken),
      refreshToken: encryptGoogleToken(input.refreshToken),
      tokenType: input.tokenType,
      scope: input.scope,
      expiresAt: createExpiryDate(input.expiresIn),
    },
  });
}

export async function upsertGoogleCalendarCredentialTokens(
  input: GoogleCalendarTokenInput
) {
  let refreshToken = input.refreshToken ?? null;

  if (!refreshToken) {
    const existing = await prisma.googleCalendarCredential.findUnique({
      where: { userId: input.userId },
      select: { refreshToken: true },
    });

    refreshToken = existing?.refreshToken
      ? decryptGoogleToken(existing.refreshToken)
      : null;
  }

  if (!refreshToken) {
    throw new Error("missing-refresh-token");
  }

  const expiresAt = createExpiryDate(input.expiresIn);

  await prisma.googleCalendarCredential.upsert({
    where: { userId: input.userId },
    update: {
      accessToken: encryptGoogleToken(input.accessToken),
      refreshToken: encryptGoogleToken(refreshToken),
      tokenType: input.tokenType ?? null,
      scope: input.scope ?? null,
      providerAccountId: input.providerAccountId ?? null,
      calendarId: input.calendarId?.trim() || "primary",
      expiresAt,
      revokedAt: null,
    },
    create: {
      userId: input.userId,
      accessToken: encryptGoogleToken(input.accessToken),
      refreshToken: encryptGoogleToken(refreshToken),
      tokenType: input.tokenType ?? null,
      scope: input.scope ?? null,
      providerAccountId: input.providerAccountId ?? null,
      calendarId: input.calendarId?.trim() || "primary",
      expiresAt,
    },
  });
}
