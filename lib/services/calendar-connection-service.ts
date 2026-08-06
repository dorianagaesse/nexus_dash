import type { CalendarConnection, CalendarSource, Prisma } from "@prisma/client";

import { getCalendarProvider } from "@/lib/calendar-providers/google";
import type {
  CalendarProviderIdentity,
  CalendarProviderSource,
  CalendarProviderTokens,
} from "@/lib/calendar-providers/types";
import { createExpiryDate } from "@/lib/google-calendar";
import { logServerWarning } from "@/lib/observability/logger";
import {
  decryptGoogleToken,
  encryptGoogleToken,
  hasGoogleTokenEncryptionKey,
  isEncryptedGoogleToken,
} from "@/lib/services/google-token-crypto";
import { withActorRlsContext } from "@/lib/services/rls-context";

export const GOOGLE_CALENDAR_PROVIDER = "google";

export type DecryptedCalendarConnection = Omit<
  CalendarConnection,
  "accessToken" | "refreshToken"
> & {
  accessToken: string | null;
  refreshToken: string;
};

export interface CalendarSourceContext {
  connection: DecryptedCalendarConnection;
  source: CalendarSource;
  writable: boolean;
}

function normalizeUserId(value: string): string {
  return value.trim();
}

export function isLegacyCalendarAccountId(value: string): boolean {
  return value.startsWith("legacy:");
}

export function isWritableCalendarRole(role: string | null): boolean {
  return role === "owner" || role === "writer";
}

async function decryptAndUpgrade(
  db: Prisma.TransactionClient,
  connection: CalendarConnection
): Promise<DecryptedCalendarConnection> {
  const accessToken = connection.accessToken
    ? decryptGoogleToken(connection.accessToken)
    : null;
  const refreshToken = decryptGoogleToken(connection.refreshToken);

  if (
    hasGoogleTokenEncryptionKey() &&
    ((connection.accessToken && !isEncryptedGoogleToken(connection.accessToken)) ||
      !isEncryptedGoogleToken(connection.refreshToken))
  ) {
    await db.calendarConnection.updateMany({
      where: { id: connection.id, userId: connection.userId, revokedAt: null },
      data: {
        accessToken: accessToken ? encryptGoogleToken(accessToken) : null,
        refreshToken: encryptGoogleToken(refreshToken),
      },
    });
  }

  return { ...connection, accessToken, refreshToken };
}

export async function listCalendarConnections(userId: string) {
  const normalizedUserId = normalizeUserId(userId);
  if (!normalizedUserId) return [];

  return withActorRlsContext(normalizedUserId, (db) =>
    db.calendarConnection.findMany({
      where: { userId: normalizedUserId, revokedAt: null },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: {
        id: true,
        provider: true,
        accountEmail: true,
        accountLabel: true,
        reauthorizationRequiredAt: true,
        calendarListSyncedAt: true,
        sources: {
          where: { isAvailable: true },
          orderBy: [{ isPrimary: "desc" }, { name: "asc" }, { id: "asc" }],
          select: {
            id: true,
            providerCalendarId: true,
            name: true,
            color: true,
            timeZone: true,
            accessRole: true,
            isPrimary: true,
            isSelected: true,
          },
        },
      },
    })
  );
}

export async function getCalendarPreference(userId: string) {
  const normalizedUserId = normalizeUserId(userId);
  if (!normalizedUserId) return null;
  return withActorRlsContext(normalizedUserId, (db) =>
    db.calendarPreference.findUnique({ where: { userId: normalizedUserId } })
  );
}

export async function findCalendarConnection(
  userId: string,
  connectionId?: string | null
): Promise<DecryptedCalendarConnection | null> {
  const normalizedUserId = normalizeUserId(userId);
  if (!normalizedUserId) return null;

  return withActorRlsContext(normalizedUserId, async (db) => {
    let resolvedConnectionId = connectionId?.trim() || null;
    if (!resolvedConnectionId) {
      const preference = await db.calendarPreference.findUnique({
        where: { userId: normalizedUserId },
        select: { defaultConnectionId: true },
      });
      resolvedConnectionId = preference?.defaultConnectionId ?? null;
    }

    const connection = await db.calendarConnection.findFirst({
      where: {
        userId: normalizedUserId,
        revokedAt: null,
        ...(resolvedConnectionId ? { id: resolvedConnectionId } : {}),
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    return connection ? decryptAndUpgrade(db, connection) : null;
  });
}

export async function updateCalendarConnectionTokens(input: {
  userId: string;
  connectionId: string;
  tokens: CalendarProviderTokens & { refreshToken: string };
}): Promise<void> {
  const normalizedUserId = normalizeUserId(input.userId);
  await withActorRlsContext(normalizedUserId, async (db) => {
    const result = await db.calendarConnection.updateMany({
      where: {
        id: input.connectionId,
        userId: normalizedUserId,
        revokedAt: null,
      },
      data: {
        accessToken: encryptGoogleToken(input.tokens.accessToken),
        refreshToken: encryptGoogleToken(input.tokens.refreshToken),
        tokenType: input.tokens.tokenType ?? null,
        scopes: input.tokens.scope ?? undefined,
        expiresAt: createExpiryDate(input.tokens.expiresIn),
        reauthorizationRequiredAt: null,
      },
    });
    if (result.count === 0) throw new Error("calendar-not-connected");
  });
}

async function persistDiscoveredSources(input: {
  userId: string;
  connectionId: string;
  sources: CalendarProviderSource[];
}): Promise<void> {
  await withActorRlsContext(input.userId, async (db) => {
    const existingCount = await db.calendarConnection.count({
      where: { userId: input.userId, revokedAt: null },
    });
    const preference = await db.calendarPreference.findUnique({
      where: { userId: input.userId },
    });

    await db.calendarSource.updateMany({
      where: { userId: input.userId, connectionId: input.connectionId },
      data: { isAvailable: false },
    });

    let primarySourceId: string | null = null;
    for (const source of input.sources) {
      const saved = await db.calendarSource.upsert({
        where: {
          connectionId_providerCalendarId: {
            connectionId: input.connectionId,
            providerCalendarId: source.providerCalendarId,
          },
        },
        update: {
          name: source.name,
          color: source.color,
          timeZone: source.timeZone,
          accessRole: source.accessRole,
          isPrimary: source.isPrimary,
          isAvailable: true,
        },
        create: {
          userId: input.userId,
          connectionId: input.connectionId,
          providerCalendarId: source.providerCalendarId,
          name: source.name,
          color: source.color,
          timeZone: source.timeZone,
          accessRole: source.accessRole,
          isPrimary: source.isPrimary,
          isAvailable: true,
          isSelected: existingCount === 1 && source.isPrimary,
        },
      });
      if (source.isPrimary) primarySourceId = saved.id;
    }

    await db.calendarConnection.updateMany({
      where: { id: input.connectionId, userId: input.userId },
      data: { calendarListSyncedAt: new Date() },
    });

    if (!preference && primarySourceId) {
      await db.calendarPreference.create({
        data: {
          userId: input.userId,
          defaultConnectionId: input.connectionId,
          writeSourceId: primarySourceId,
        },
      });
    }
  });
}

export async function connectGoogleCalendarAccount(input: {
  userId: string;
  identity: CalendarProviderIdentity;
  tokens: CalendarProviderTokens;
  reconnectConnectionId?: string | null;
}): Promise<{ connectionId: string }> {
  const userId = normalizeUserId(input.userId);
  const providerName = GOOGLE_CALENDAR_PROVIDER;
  const adapter = getCalendarProvider(providerName);

  const connection = await withActorRlsContext(userId, async (db) => {
    const requestedReconnect = input.reconnectConnectionId
      ? await db.calendarConnection.findFirst({
          where: { id: input.reconnectConnectionId, userId, provider: providerName },
        })
      : null;
    if (input.reconnectConnectionId && !requestedReconnect) {
      throw new Error("calendar-connection-not-found");
    }
    if (
      requestedReconnect &&
      !isLegacyCalendarAccountId(requestedReconnect.providerAccountId) &&
      requestedReconnect.providerAccountId !== input.identity.accountId
    ) {
      throw new Error("calendar-reconnect-account-mismatch");
    }

    const matching = await db.calendarConnection.findUnique({
      where: {
        userId_provider_providerAccountId: {
          userId,
          provider: providerName,
          providerAccountId: input.identity.accountId,
        },
      },
    });
    const legacy = !requestedReconnect && !matching
      ? await db.calendarConnection.findFirst({
          where: {
            userId,
            provider: providerName,
            providerAccountId: { startsWith: "legacy:" },
          },
          orderBy: { createdAt: "asc" },
        })
      : null;
    const target = requestedReconnect ?? matching ?? legacy;
    const refreshToken = input.tokens.refreshToken ??
      (target ? decryptGoogleToken(target.refreshToken) : null);
    if (!refreshToken) throw new Error("missing-refresh-token");

    const data = {
      provider: providerName,
      providerAccountId: input.identity.accountId,
      accountEmail: input.identity.email,
      accountLabel: input.identity.label,
      accessToken: encryptGoogleToken(input.tokens.accessToken),
      refreshToken: encryptGoogleToken(refreshToken),
      tokenType: input.tokens.tokenType ?? null,
      scopes: input.tokens.scope ?? null,
      expiresAt: createExpiryDate(input.tokens.expiresIn),
      revokedAt: null,
      reauthorizationRequiredAt: null,
    };

    if (target) {
      return db.calendarConnection.update({ where: { id: target.id }, data });
    }
    return db.calendarConnection.create({ data: { ...data, userId } });
  });

  const sources = await adapter.discoverCalendars(input.tokens.accessToken);
  await persistDiscoveredSources({ userId, connectionId: connection.id, sources });
  return { connectionId: connection.id };
}

export async function syncCalendarConnection(input: {
  userId: string;
  connectionId: string;
}): Promise<void> {
  const connection = await findCalendarConnection(input.userId, input.connectionId);
  if (!connection) throw new Error("calendar-connection-not-found");
  const provider = getCalendarProvider(connection.provider);
  const accessToken = await ensureFreshAccessToken(input.userId, connection);
  const sources = await provider.discoverCalendars(accessToken);
  await persistDiscoveredSources({ ...input, sources });
}

export async function ensureFreshAccessToken(
  userId: string,
  connection: DecryptedCalendarConnection
): Promise<string> {
  if (
    connection.accessToken &&
    connection.expiresAt &&
    connection.expiresAt.getTime() - Date.now() > 30_000
  ) {
    return connection.accessToken;
  }

  try {
    const provider = getCalendarProvider(connection.provider);
    const refreshed = await provider.refresh(connection.refreshToken);
    await updateCalendarConnectionTokens({
      userId,
      connectionId: connection.id,
      tokens: {
        ...refreshed,
        refreshToken: refreshed.refreshToken ?? connection.refreshToken,
      },
    });
    return refreshed.accessToken;
  } catch (error) {
    await withActorRlsContext(userId, (db) =>
      db.calendarConnection.updateMany({
        where: { id: connection.id, userId },
        data: { reauthorizationRequiredAt: new Date() },
      })
    );
    throw error;
  }
}

export async function getSelectedCalendarSourceContexts(
  userId: string
): Promise<CalendarSourceContext[]> {
  const rows = await withActorRlsContext(userId, (db) =>
    db.calendarSource.findMany({
      where: {
        userId,
        isSelected: true,
        isAvailable: true,
        connection: { revokedAt: null },
      },
      include: { connection: true },
      orderBy: [{ name: "asc" }, { id: "asc" }],
    })
  );
  return Promise.all(
    rows.map(async (row) => ({
      source: row,
      connection: await withActorRlsContext(userId, (db) =>
        decryptAndUpgrade(db, row.connection)
      ),
      writable: isWritableCalendarRole(row.accessRole),
    }))
  );
}

export async function getWritableCalendarSourceContext(
  userId: string,
  sourceId?: string | null
): Promise<CalendarSourceContext | null> {
  return withActorRlsContext(userId, async (db) => {
    let resolvedSourceId = sourceId?.trim() || null;
    if (!resolvedSourceId) {
      const preference = await db.calendarPreference.findUnique({
        where: { userId },
        select: { writeSourceId: true },
      });
      resolvedSourceId = preference?.writeSourceId ?? null;
    }
    if (!resolvedSourceId) return null;
    const source = await db.calendarSource.findFirst({
      where: { id: resolvedSourceId, userId, isAvailable: true },
      include: { connection: true },
    });
    if (
      !source ||
      source.connection.revokedAt ||
      !isWritableCalendarRole(source.accessRole)
    ) return null;
    return {
      source,
      connection: await decryptAndUpgrade(db, source.connection),
      writable: true,
    };
  });
}

export async function updateCalendarPreferences(input: {
  userId: string;
  selectedSourceIds?: string[];
  writeSourceId?: string | null;
}): Promise<void> {
  await withActorRlsContext(input.userId, async (db) => {
    const sources = await db.calendarSource.findMany({
      where: { userId: input.userId, isAvailable: true },
    });
    const ownedIds = new Set(sources.map((source) => source.id));
    if (input.selectedSourceIds?.some((id) => !ownedIds.has(id))) {
      throw new Error("calendar-source-not-found");
    }
    const writeSource = input.writeSourceId
      ? sources.find((source) => source.id === input.writeSourceId)
      : null;
    if (input.writeSourceId && (!writeSource || !isWritableCalendarRole(writeSource.accessRole))) {
      throw new Error("calendar-source-not-writable");
    }
    if (input.selectedSourceIds) {
      await db.calendarSource.updateMany({
        where: { userId: input.userId },
        data: { isSelected: false },
      });
      await db.calendarSource.updateMany({
        where: { userId: input.userId, id: { in: input.selectedSourceIds } },
        data: { isSelected: true },
      });
    }
    await db.calendarPreference.upsert({
      where: { userId: input.userId },
      update: {
        ...(input.writeSourceId !== undefined
          ? {
              writeSourceId: input.writeSourceId,
              defaultConnectionId: writeSource?.connectionId ?? undefined,
            }
          : {}),
      },
      create: {
        userId: input.userId,
        writeSourceId: input.writeSourceId ?? null,
        defaultConnectionId: writeSource?.connectionId ?? null,
      },
    });
  });
}

export async function disconnectCalendarConnection(input: {
  userId: string;
  connectionId: string;
}): Promise<{ revocationStatus: "revoked" | "not-connected" | "unconfirmed" }> {
  const connection = await findCalendarConnection(input.userId, input.connectionId);
  if (!connection) return { revocationStatus: "not-connected" };

  await withActorRlsContext(input.userId, async (db) => {
    await db.calendarPreference.updateMany({
      where: { userId: input.userId, defaultConnectionId: input.connectionId },
      data: { defaultConnectionId: null },
    });
    const sourceIds = await db.calendarSource.findMany({
      where: { userId: input.userId, connectionId: input.connectionId },
      select: { id: true },
    });
    await db.calendarPreference.updateMany({
      where: {
        userId: input.userId,
        writeSourceId: { in: sourceIds.map((source) => source.id) },
      },
      data: { writeSourceId: null },
    });
    await db.calendarConnection.updateMany({
      where: { id: input.connectionId, userId: input.userId },
      data: { revokedAt: new Date() },
    });
  });

  let revocationStatus: "revoked" | "unconfirmed" = "unconfirmed";
  try {
    revocationStatus = (await getCalendarProvider(connection.provider).revoke(
      connection.refreshToken
    ))
      ? "revoked"
      : "unconfirmed";
  } catch (error) {
    logServerWarning(
      "disconnectCalendarConnection.providerRevocationFailed",
      "Calendar provider token revocation could not be confirmed",
      { error }
    );
  } finally {
    await withActorRlsContext(input.userId, (db) =>
      db.calendarConnection.deleteMany({
        where: { id: input.connectionId, userId: input.userId },
      })
    );
  }
  return { revocationStatus };
}
