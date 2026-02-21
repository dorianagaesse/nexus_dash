import {
  createExpiryDate,
  getGoogleCalendarId,
} from "@/lib/google-calendar";
import { prisma } from "@/lib/prisma";

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
  providerAccountId?: string | null;
  calendarId?: string | null;
}

export async function findGoogleCalendarCredential(userId: string) {
  return prisma.googleCalendarCredential.findUnique({
    where: { userId },
  });
}

export async function updateGoogleCalendarCredentialTokens(
  input: GoogleCalendarTokenUpdateInput
) {
  return prisma.googleCalendarCredential.update({
    where: { userId: input.userId },
    data: {
      accessToken: input.accessToken,
      refreshToken: input.refreshToken,
      tokenType: input.tokenType,
      scope: input.scope,
      providerAccountId: input.providerAccountId ?? undefined,
      calendarId: input.calendarId ?? undefined,
      revokedAt: null,
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

    refreshToken = existing?.refreshToken ?? null;
  }

  if (!refreshToken) {
    throw new Error("missing-refresh-token");
  }

  const expiresAt = createExpiryDate(input.expiresIn);
  const calendarId = input.calendarId ?? getGoogleCalendarId();

  await prisma.googleCalendarCredential.upsert({
    where: { userId: input.userId },
    update: {
      accessToken: input.accessToken,
      refreshToken,
      tokenType: input.tokenType ?? null,
      scope: input.scope ?? null,
      providerAccountId: input.providerAccountId ?? undefined,
      calendarId,
      revokedAt: null,
      expiresAt,
    },
    create: {
      userId: input.userId,
      accessToken: input.accessToken,
      refreshToken,
      tokenType: input.tokenType ?? null,
      scope: input.scope ?? null,
      providerAccountId: input.providerAccountId ?? null,
      calendarId,
      expiresAt,
    },
  });
}
