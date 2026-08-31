import type { GoogleCalendarCredential } from "@prisma/client";
import {
  createExpiryDate,
} from "@/lib/google-calendar";
import {
  decryptGoogleToken,
  encryptGoogleToken,
  hasGoogleTokenEncryptionKey,
  isEncryptedGoogleToken,
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

type DecryptedGoogleCalendarCredential = Omit<
  GoogleCalendarCredential,
  "accessToken" | "refreshToken"
> & {
  accessToken: string | null;
  refreshToken: string;
};

export class GoogleCalendarCredentialTokenDecryptionError extends Error {
  readonly originalError: unknown;
  readonly credentialId: string;

  constructor(credentialId: string, originalError: unknown) {
    super("google-calendar-credential-token-decryption-failed");
    this.name = "GoogleCalendarCredentialTokenDecryptionError";
    this.credentialId = credentialId;
    this.originalError = originalError;
  }
}

function normalizeUserId(userId: string): string {
  return userId.trim();
}

const legacyConnectionOrder = [
  { createdAt: "asc" as const },
  { id: "asc" as const },
];

export function normalizeGoogleCalendarId(calendarId: string | null | undefined): string {
  const normalized = typeof calendarId === "string" ? calendarId.trim() : "";
  return normalized.length > 0 ? normalized : DEFAULT_GOOGLE_CALENDAR_ID;
}

export async function findGoogleCalendarCredential(
  userId: string
): Promise<DecryptedGoogleCalendarCredential | null> {
  const normalizedUserId = normalizeUserId(userId);
  if (!normalizedUserId) {
    return null;
  }

  return withActorRlsContext(normalizedUserId, async (db) => {
    const credential = await db.googleCalendarCredential.findFirst({
      where: { userId: normalizedUserId, revokedAt: null },
      orderBy: legacyConnectionOrder,
    });

    if (!credential) {
      return null;
    }

    const accessToken = credential.accessToken
      ? decryptGoogleToken(credential.accessToken)
      : null;
    const refreshToken = decryptGoogleToken(credential.refreshToken);

    if (
      hasGoogleTokenEncryptionKey() &&
      ((credential.accessToken && !isEncryptedGoogleToken(credential.accessToken)) ||
        !isEncryptedGoogleToken(credential.refreshToken))
    ) {
      await db.googleCalendarCredential.updateMany({
        where: {
          id: credential.id,
          userId: normalizedUserId,
          revokedAt: null,
        },
        data: {
          accessToken: accessToken ? encryptGoogleToken(accessToken) : null,
          refreshToken: encryptGoogleToken(refreshToken),
        },
      });
    }

    return {
      ...credential,
      accessToken,
      refreshToken,
    };
  });
}

export async function findGoogleCalendarCredentialCalendarId(userId: string) {
  const normalizedUserId = normalizeUserId(userId);
  if (!normalizedUserId) {
    return null;
  }

  const credential = await withActorRlsContext(normalizedUserId, (db) =>
    db.googleCalendarCredential.findFirst({
      where: { userId: normalizedUserId, revokedAt: null },
      orderBy: legacyConnectionOrder,
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
  return withActorRlsContext(normalizedUserId, async (db) => {
    const credential = await db.googleCalendarCredential.findFirst({
      where: { userId: normalizedUserId, revokedAt: null },
      orderBy: legacyConnectionOrder,
      select: { id: true },
    });
    if (!credential) {
      throw new Error("calendar-not-connected");
    }

    const result = await db.googleCalendarCredential.updateMany({
      where: { id: credential.id, userId: normalizedUserId, revokedAt: null },
      data: {
        accessToken: encryptGoogleToken(input.accessToken),
        refreshToken: encryptGoogleToken(input.refreshToken),
        tokenType: input.tokenType,
        scope: input.scope,
        expiresAt: createExpiryDate(input.expiresIn),
      },
    });

    if (result.count !== 1) {
      throw new Error("calendar-not-connected");
    }
  });
}

export async function updateGoogleCalendarCredentialCalendarId(
  input: GoogleCalendarCalendarIdUpdateInput
) {
  const normalizedUserId = normalizeUserId(input.userId);
  const result = await withActorRlsContext(normalizedUserId, async (db) => {
    const credential = await db.googleCalendarCredential.findFirst({
      where: { userId: normalizedUserId, revokedAt: null },
      orderBy: legacyConnectionOrder,
      select: { id: true },
    });
    if (!credential) return { count: 0 };

    return db.googleCalendarCredential.updateMany({
      where: { id: credential.id, userId: normalizedUserId, revokedAt: null },
      data: {
        calendarId: normalizeGoogleCalendarId(input.calendarId),
      },
    });
  });

  return result.count > 0;
}

export async function markGoogleCalendarCredentialRevokedForDisconnect(
  userId: string
): Promise<{ credentialId: string; refreshToken: string } | null> {
  const normalizedUserId = normalizeUserId(userId);
  if (!normalizedUserId) {
    return null;
  }

  return withActorRlsContext(normalizedUserId, async (db) => {
    const credential = await db.googleCalendarCredential.findFirst({
      where: { userId: normalizedUserId, revokedAt: null },
      orderBy: legacyConnectionOrder,
      select: { id: true, refreshToken: true },
    });

    if (!credential) {
      return null;
    }

    await db.googleCalendarCredential.updateMany({
      where: { id: credential.id, userId: normalizedUserId, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    try {
      return {
        credentialId: credential.id,
        refreshToken: decryptGoogleToken(credential.refreshToken),
      };
    } catch (error) {
      throw new GoogleCalendarCredentialTokenDecryptionError(credential.id, error);
    }
  });
}

export async function deleteGoogleCalendarCredential(
  userId: string,
  credentialId: string
): Promise<void> {
  const normalizedUserId = normalizeUserId(userId);
  const normalizedCredentialId = credentialId.trim();
  if (!normalizedUserId || !normalizedCredentialId) {
    return;
  }

  await withActorRlsContext(normalizedUserId, (db) =>
    db.googleCalendarCredential.deleteMany({
      where: { id: normalizedCredentialId, userId: normalizedUserId },
    })
  );
}

export async function upsertGoogleCalendarCredentialTokens(
  input: GoogleCalendarTokenInput
) {
  const normalizedUserId = normalizeUserId(input.userId);
  return withActorRlsContext(normalizedUserId, async (db) => {
    const existing = await db.googleCalendarCredential.findFirst({
      where: { userId: normalizedUserId },
      orderBy: legacyConnectionOrder,
      select: { id: true, refreshToken: true },
    });
    let refreshToken = input.refreshToken ?? null;
    if (!refreshToken) {
      refreshToken = existing?.refreshToken
        ? decryptGoogleToken(existing.refreshToken)
        : null;
    }

    if (!refreshToken) {
      throw new Error("missing-refresh-token");
    }

    const expiresAt = createExpiryDate(input.expiresIn);

    const data = {
      accessToken: encryptGoogleToken(input.accessToken),
      refreshToken: encryptGoogleToken(refreshToken),
      tokenType: input.tokenType ?? null,
      scope: input.scope ?? null,
      providerAccountId: input.providerAccountId ?? null,
      calendarId: normalizeGoogleCalendarId(input.calendarId),
      expiresAt,
      revokedAt: null,
    };

    if (existing) {
      await db.googleCalendarCredential.update({
        where: { id: existing.id },
        data,
      });
    } else {
      await db.googleCalendarCredential.create({
        data: {
          userId: normalizedUserId,
          ...data,
        },
      });
    }
  });
}
