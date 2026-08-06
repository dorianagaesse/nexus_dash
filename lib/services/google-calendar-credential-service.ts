import { createExpiryDate } from "@/lib/google-calendar";
import {
  findCalendarConnection,
  getWritableCalendarSourceContext,
  GOOGLE_CALENDAR_PROVIDER,
  updateCalendarConnectionTokens,
} from "@/lib/services/calendar-connection-service";
import { encryptGoogleToken } from "@/lib/services/google-token-crypto";
import { withActorRlsContext } from "@/lib/services/rls-context";

export const DEFAULT_GOOGLE_CALENDAR_ID = "primary";
export const MAX_GOOGLE_CALENDAR_ID_LENGTH = 255;

export function normalizeGoogleCalendarId(value: string | null | undefined): string {
  const normalized = typeof value === "string" ? value.trim() : "";
  return normalized || DEFAULT_GOOGLE_CALENDAR_ID;
}

export async function findGoogleCalendarCredential(userId: string) {
  const connection = await findCalendarConnection(userId);
  if (!connection || connection.provider !== GOOGLE_CALENDAR_PROVIDER) return null;
  const source = await getWritableCalendarSourceContext(userId);
  return {
    ...connection,
    scope: connection.scopes,
    calendarId: source?.source.providerCalendarId ?? DEFAULT_GOOGLE_CALENDAR_ID,
  };
}

export async function findGoogleCalendarCredentialCalendarId(userId: string) {
  const source = await getWritableCalendarSourceContext(userId);
  return source?.source.providerCalendarId ?? null;
}

export async function updateGoogleCalendarCredentialTokens(input: {
  userId: string;
  accessToken: string;
  expiresIn: number;
  refreshToken: string;
  tokenType: string | null;
  scope: string | null;
}) {
  const connection = await findCalendarConnection(input.userId);
  if (!connection) throw new Error("calendar-not-connected");
  return updateCalendarConnectionTokens({
    userId: input.userId,
    connectionId: connection.id,
    tokens: {
      accessToken: input.accessToken,
      expiresIn: input.expiresIn,
      refreshToken: input.refreshToken,
      tokenType: input.tokenType ?? undefined,
      scope: input.scope ?? undefined,
    },
  });
}

export async function updateGoogleCalendarCredentialCalendarId(input: {
  userId: string;
  calendarId: string;
}) {
  const calendarId = normalizeGoogleCalendarId(input.calendarId);
  return withActorRlsContext(input.userId, async (db) => {
    const source = await db.calendarSource.findFirst({
      where: {
        userId: input.userId,
        providerCalendarId: calendarId,
        isAvailable: true,
        connection: { provider: GOOGLE_CALENDAR_PROVIDER, revokedAt: null },
      },
    });
    if (!source) return false;
    await db.calendarPreference.upsert({
      where: { userId: input.userId },
      update: {
        defaultConnectionId: source.connectionId,
        writeSourceId: source.id,
      },
      create: {
        userId: input.userId,
        defaultConnectionId: source.connectionId,
        writeSourceId: source.id,
      },
    });
    return true;
  });
}

export async function markGoogleCalendarCredentialRevokedForDisconnect(
  userId: string
): Promise<{ refreshToken: string } | null> {
  const connection = await findCalendarConnection(userId);
  if (!connection) return null;
  await withActorRlsContext(userId, (db) =>
    db.calendarConnection.updateMany({
      where: { id: connection.id, userId, revokedAt: null },
      data: { revokedAt: new Date() },
    })
  );
  return { refreshToken: connection.refreshToken };
}

export async function deleteGoogleCalendarCredential(userId: string): Promise<void> {
  await withActorRlsContext(userId, async (db) => {
    const preference = await db.calendarPreference.findUnique({ where: { userId } });
    const connectionId = preference?.defaultConnectionId;
    if (!connectionId) return;
    await db.calendarPreference.updateMany({
      where: { userId },
      data: { defaultConnectionId: null, writeSourceId: null },
    });
    await db.calendarConnection.deleteMany({ where: { id: connectionId, userId } });
  });
}

// Compatibility helper for callers that have not yet adopted provider identity.
// The OAuth callback uses connectGoogleCalendarAccount and never creates a new
// legacy identity.
export async function upsertGoogleCalendarCredentialTokens(input: {
  userId: string;
  accessToken: string;
  expiresIn: number;
  refreshToken?: string | null;
  tokenType?: string | null;
  scope?: string | null;
  providerAccountId?: string | null;
  calendarId?: string | null;
}) {
  return withActorRlsContext(input.userId, async (db) => {
    const existing = await db.calendarConnection.findFirst({
      where: { userId: input.userId, provider: GOOGLE_CALENDAR_PROVIDER },
      orderBy: { createdAt: "asc" },
    });
    const refreshToken = input.refreshToken ?? existing?.refreshToken ?? null;
    if (!refreshToken) throw new Error("missing-refresh-token");
    const connection = existing
      ? await db.calendarConnection.update({
          where: { id: existing.id },
          data: {
            accessToken: encryptGoogleToken(input.accessToken),
            refreshToken: input.refreshToken
              ? encryptGoogleToken(input.refreshToken)
              : refreshToken,
            tokenType: input.tokenType ?? null,
            scopes: input.scope ?? null,
            expiresAt: createExpiryDate(input.expiresIn),
            revokedAt: null,
          },
        })
      : await db.calendarConnection.create({
          data: {
            userId: input.userId,
            provider: GOOGLE_CALENDAR_PROVIDER,
            providerAccountId: input.providerAccountId ?? `legacy:${input.userId}`,
            accountLabel: "Google account",
            accessToken: encryptGoogleToken(input.accessToken),
            refreshToken: encryptGoogleToken(refreshToken),
            tokenType: input.tokenType ?? null,
            scopes: input.scope ?? null,
            expiresAt: createExpiryDate(input.expiresIn),
          },
        });
    const providerCalendarId = normalizeGoogleCalendarId(input.calendarId);
    const source = await db.calendarSource.upsert({
      where: {
        connectionId_providerCalendarId: {
          connectionId: connection.id,
          providerCalendarId,
        },
      },
      update: { isAvailable: true },
      create: {
        userId: input.userId,
        connectionId: connection.id,
        providerCalendarId,
        name: providerCalendarId === "primary" ? "Primary calendar" : providerCalendarId,
        accessRole: "owner",
        isPrimary: providerCalendarId === "primary",
        isSelected: true,
      },
    });
    await db.calendarPreference.upsert({
      where: { userId: input.userId },
      update: {},
      create: {
        userId: input.userId,
        defaultConnectionId: connection.id,
        writeSourceId: source.id,
      },
    });
  });
}
