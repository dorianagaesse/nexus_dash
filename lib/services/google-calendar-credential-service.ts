import {
  createExpiryDate,
} from "@/lib/google-calendar";
import {
  decryptGoogleToken,
  encryptGoogleToken,
} from "@/lib/services/google-token-crypto";
import { withActorRlsContext } from "@/lib/services/rls-context";

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

interface GoogleCalendarCalendarIdUpdateInput {
  userId: string;
  calendarId: string;
}

export const DEFAULT_GOOGLE_CALENDAR_ID = "primary";
export const MAX_GOOGLE_CALENDAR_ID_LENGTH = 255;

function normalizeUserId(userId: string): string {
  return userId.trim();
}

export function normalizeGoogleCalendarId(calendarId: string | null | undefined): string {
  const normalized = typeof calendarId === "string" ? calendarId.trim() : "";
  return normalized.length > 0 ? normalized : DEFAULT_GOOGLE_CALENDAR_ID;
}

export async function findGoogleCalendarCredential(userId: string) {
  const normalizedUserId = normalizeUserId(userId);
  if (!normalizedUserId) {
    return null;
  }

  const credential = await withActorRlsContext(normalizedUserId, (db) =>
    db.googleCalendarCredential.findUnique({
      where: { userId: normalizedUserId },
    })
  );

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

export async function findGoogleCalendarCredentialCalendarId(userId: string) {
  const normalizedUserId = normalizeUserId(userId);
  if (!normalizedUserId) {
    return null;
  }

  const credential = await withActorRlsContext(normalizedUserId, (db) =>
    db.googleCalendarCredential.findUnique({
      where: { userId: normalizedUserId },
      select: { calendarId: true },
    })
  );

  if (!credential) {
    return null;
  }

  return normalizeGoogleCalendarId(credential.calendarId);
}

export async function updateGoogleCalendarCredentialTokens(
  input: GoogleCalendarTokenUpdateInput
) {
  const normalizedUserId = normalizeUserId(input.userId);
  return withActorRlsContext(normalizedUserId, (db) =>
    db.googleCalendarCredential.update({
      where: { userId: normalizedUserId },
      data: {
        accessToken: encryptGoogleToken(input.accessToken),
        refreshToken: encryptGoogleToken(input.refreshToken),
        tokenType: input.tokenType,
        scope: input.scope,
        expiresAt: createExpiryDate(input.expiresIn),
      },
    })
  );
}

export async function updateGoogleCalendarCredentialCalendarId(
  input: GoogleCalendarCalendarIdUpdateInput
) {
  const normalizedUserId = normalizeUserId(input.userId);
  const result = await withActorRlsContext(normalizedUserId, (db) =>
    db.googleCalendarCredential.updateMany({
      where: { userId: normalizedUserId },
      data: {
        calendarId: normalizeGoogleCalendarId(input.calendarId),
      },
    })
  );

  return result.count > 0;
}

export async function upsertGoogleCalendarCredentialTokens(
  input: GoogleCalendarTokenInput
) {
  const normalizedUserId = normalizeUserId(input.userId);
  return withActorRlsContext(normalizedUserId, async (db) => {
    let refreshToken = input.refreshToken ?? null;

    if (!refreshToken) {
      const existing = await db.googleCalendarCredential.findUnique({
        where: { userId: normalizedUserId },
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

    await db.googleCalendarCredential.upsert({
      where: { userId: normalizedUserId },
      update: {
        accessToken: encryptGoogleToken(input.accessToken),
        refreshToken: encryptGoogleToken(refreshToken),
        tokenType: input.tokenType ?? null,
        scope: input.scope ?? null,
        providerAccountId: input.providerAccountId ?? null,
        calendarId: normalizeGoogleCalendarId(input.calendarId),
        expiresAt,
        revokedAt: null,
      },
      create: {
        userId: normalizedUserId,
        accessToken: encryptGoogleToken(input.accessToken),
        refreshToken: encryptGoogleToken(refreshToken),
        tokenType: input.tokenType ?? null,
        scope: input.scope ?? null,
        providerAccountId: input.providerAccountId ?? null,
        calendarId: normalizeGoogleCalendarId(input.calendarId),
        expiresAt,
      },
    });
  });
}
