import {
  GOOGLE_CALENDAR_CONNECTION_ID,
  createExpiryDate,
} from "@/lib/google-calendar";
import { prisma } from "@/lib/prisma";

interface GoogleCalendarTokenInput {
  accessToken: string;
  expiresIn: number;
  refreshToken?: string | null;
  tokenType?: string | null;
  scope?: string | null;
}

interface GoogleCalendarTokenUpdateInput {
  accessToken: string;
  expiresIn: number;
  refreshToken: string;
  tokenType: string | null;
  scope: string | null;
}

export async function findGoogleCalendarCredential() {
  return prisma.googleCalendarCredential.findUnique({
    where: { id: GOOGLE_CALENDAR_CONNECTION_ID },
  });
}

export async function updateGoogleCalendarCredentialTokens(
  input: GoogleCalendarTokenUpdateInput
) {
  return prisma.googleCalendarCredential.update({
    where: { id: GOOGLE_CALENDAR_CONNECTION_ID },
    data: {
      accessToken: input.accessToken,
      refreshToken: input.refreshToken,
      tokenType: input.tokenType,
      scope: input.scope,
      expiresAt: createExpiryDate(input.expiresIn),
    },
  });
}

export async function upsertGoogleCalendarCredentialTokens(
  input: GoogleCalendarTokenInput
) {
  const existing = await prisma.googleCalendarCredential.findUnique({
    where: { id: GOOGLE_CALENDAR_CONNECTION_ID },
    select: { refreshToken: true },
  });

  const refreshToken = input.refreshToken ?? existing?.refreshToken ?? null;
  if (!refreshToken) {
    throw new Error("missing-refresh-token");
  }

  const expiresAt = createExpiryDate(input.expiresIn);

  await prisma.googleCalendarCredential.upsert({
    where: { id: GOOGLE_CALENDAR_CONNECTION_ID },
    update: {
      accessToken: input.accessToken,
      refreshToken,
      tokenType: input.tokenType ?? null,
      scope: input.scope ?? null,
      expiresAt,
    },
    create: {
      id: GOOGLE_CALENDAR_CONNECTION_ID,
      accessToken: input.accessToken,
      refreshToken,
      tokenType: input.tokenType ?? null,
      scope: input.scope ?? null,
      expiresAt,
    },
  });
}
