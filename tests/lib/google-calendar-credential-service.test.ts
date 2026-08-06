import { beforeEach, describe, expect, test, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  googleCalendarCredential: {
    findUnique: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    deleteMany: vi.fn(),
    upsert: vi.fn(),
  },
}));

const googleCalendarMock = vi.hoisted(() => ({
  createExpiryDate: vi.fn(),
}));

const googleTokenCryptoMock = vi.hoisted(() => ({
  encryptGoogleToken: vi.fn((value: string) => value),
  decryptGoogleToken: vi.fn((value: string) => value),
  hasGoogleTokenEncryptionKey: vi.fn(() => false),
  isEncryptedGoogleToken: vi.fn((value: string) => value.startsWith("enc:v1:")),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: prismaMock,
}));

vi.mock("@/lib/google-calendar", () => ({
  createExpiryDate: googleCalendarMock.createExpiryDate,
}));

vi.mock("@/lib/services/google-token-crypto", () => ({
  encryptGoogleToken: googleTokenCryptoMock.encryptGoogleToken,
  decryptGoogleToken: googleTokenCryptoMock.decryptGoogleToken,
  hasGoogleTokenEncryptionKey: googleTokenCryptoMock.hasGoogleTokenEncryptionKey,
  isEncryptedGoogleToken: googleTokenCryptoMock.isEncryptedGoogleToken,
}));

import {
  DEFAULT_GOOGLE_CALENDAR_ID,
  findGoogleCalendarCredential,
  findGoogleCalendarCredentialCalendarId,
  deleteGoogleCalendarCredential,
  markGoogleCalendarCredentialRevokedForDisconnect,
  normalizeGoogleCalendarId,
  updateGoogleCalendarCredentialCalendarId,
  updateGoogleCalendarCredentialTokens,
  upsertGoogleCalendarCredentialTokens,
} from "@/lib/services/google-calendar-credential-service";

describe("google-calendar-credential-service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    googleCalendarMock.createExpiryDate.mockReturnValue(
      new Date("2026-02-16T00:00:00.000Z")
    );
    googleTokenCryptoMock.hasGoogleTokenEncryptionKey.mockReturnValue(false);
    googleTokenCryptoMock.encryptGoogleToken.mockImplementation((value: string) => value);
    googleTokenCryptoMock.decryptGoogleToken.mockImplementation((value: string) => value);
    googleTokenCryptoMock.isEncryptedGoogleToken.mockImplementation((value: string) =>
      value.startsWith("enc:v1:")
    );
  });

  test("finds credential by fixed connection id", async () => {
    prismaMock.googleCalendarCredential.findUnique.mockResolvedValueOnce({
      userId: "user-1",
      accessToken: "access-token",
      refreshToken: "refresh-token",
    });

    const result = await findGoogleCalendarCredential("user-1");

    expect(result).toMatchObject({
      userId: "user-1",
      accessToken: "access-token",
      refreshToken: "refresh-token",
    });
    expect(prismaMock.googleCalendarCredential.findUnique).toHaveBeenCalledWith({
      where: { userId: "user-1" },
    });
  });

  test("updates credential tokens with refreshed expiry", async () => {
    prismaMock.googleCalendarCredential.updateMany.mockResolvedValueOnce({ count: 1 });

    await updateGoogleCalendarCredentialTokens({
      userId: "user-1",
      accessToken: "new-access",
      expiresIn: 3600,
      refreshToken: "refresh",
      tokenType: "Bearer",
      scope: "scope-a",
    });

    expect(googleCalendarMock.createExpiryDate).toHaveBeenCalledWith(3600);
    expect(prismaMock.googleCalendarCredential.updateMany).toHaveBeenCalledWith({
      where: { userId: "user-1", revokedAt: null },
      data: {
        accessToken: "new-access",
        refreshToken: "refresh",
        tokenType: "Bearer",
        scope: "scope-a",
        expiresAt: new Date("2026-02-16T00:00:00.000Z"),
      },
    });
  });

  test("normalizes missing calendar id to primary when reading calendar target", async () => {
    prismaMock.googleCalendarCredential.findUnique.mockResolvedValueOnce({
      calendarId: "  ",
    });

    const result = await findGoogleCalendarCredentialCalendarId("user-1");

    expect(result).toBe(DEFAULT_GOOGLE_CALENDAR_ID);
    expect(prismaMock.googleCalendarCredential.findUnique).toHaveBeenCalledWith({
      where: { userId: "user-1" },
      select: { calendarId: true, revokedAt: true },
    });
  });

  test("updates calendar id for existing credential row", async () => {
    prismaMock.googleCalendarCredential.updateMany.mockResolvedValueOnce({ count: 1 });

    const didUpdate = await updateGoogleCalendarCredentialCalendarId({
      userId: "user-1",
      calendarId: "  team@example.com  ",
    });

    expect(didUpdate).toBe(true);
    expect(prismaMock.googleCalendarCredential.updateMany).toHaveBeenCalledWith({
      where: { userId: "user-1", revokedAt: null },
      data: { calendarId: "team@example.com" },
    });
  });

  test("treats revoked credentials as disconnected", async () => {
    prismaMock.googleCalendarCredential.findUnique.mockResolvedValueOnce({
      userId: "user-1",
      accessToken: "access-token",
      refreshToken: "refresh-token",
      revokedAt: new Date("2026-08-06T10:00:00.000Z"),
    });

    await expect(findGoogleCalendarCredential("user-1")).resolves.toBeNull();
    expect(googleTokenCryptoMock.decryptGoogleToken).not.toHaveBeenCalled();
  });

  test("rewrites plaintext tokens when an encryption key is available", async () => {
    googleTokenCryptoMock.hasGoogleTokenEncryptionKey.mockReturnValue(true);
    googleTokenCryptoMock.encryptGoogleToken.mockImplementation(
      (value: string) => `enc:v1:${value}`
    );
    prismaMock.googleCalendarCredential.findUnique.mockResolvedValueOnce({
      userId: "user-1",
      accessToken: "access-token",
      refreshToken: "refresh-token",
      revokedAt: null,
    });
    prismaMock.googleCalendarCredential.updateMany.mockResolvedValueOnce({ count: 1 });

    await findGoogleCalendarCredential("user-1");

    expect(prismaMock.googleCalendarCredential.updateMany).toHaveBeenCalledWith({
      where: { userId: "user-1", revokedAt: null },
      data: {
        accessToken: "enc:v1:access-token",
        refreshToken: "enc:v1:refresh-token",
      },
    });
  });

  test("marks a credential revoked before disconnect and then deletes it", async () => {
    prismaMock.googleCalendarCredential.findUnique.mockResolvedValueOnce({
      refreshToken: "refresh-token",
      revokedAt: null,
    });
    prismaMock.googleCalendarCredential.updateMany.mockResolvedValueOnce({ count: 1 });
    prismaMock.googleCalendarCredential.deleteMany.mockResolvedValueOnce({ count: 1 });

    await expect(
      markGoogleCalendarCredentialRevokedForDisconnect("user-1")
    ).resolves.toEqual({ refreshToken: "refresh-token" });
    await deleteGoogleCalendarCredential("user-1");

    expect(prismaMock.googleCalendarCredential.updateMany).toHaveBeenCalledWith({
      where: { userId: "user-1", revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
    expect(prismaMock.googleCalendarCredential.deleteMany).toHaveBeenCalledWith({
      where: { userId: "user-1" },
    });
  });

  test("normalizeGoogleCalendarId falls back to primary", () => {
    expect(normalizeGoogleCalendarId("")).toBe(DEFAULT_GOOGLE_CALENDAR_ID);
    expect(normalizeGoogleCalendarId("  ")).toBe(DEFAULT_GOOGLE_CALENDAR_ID);
    expect(normalizeGoogleCalendarId("team@example.com")).toBe("team@example.com");
  });

  test("upserts credential using provided refresh token", async () => {
    prismaMock.googleCalendarCredential.upsert.mockResolvedValueOnce({});

    await upsertGoogleCalendarCredentialTokens({
      userId: "user-1",
      accessToken: "access-token",
      expiresIn: 3600,
      refreshToken: "fresh-refresh",
      tokenType: "Bearer",
      scope: "scope-a",
    });

    const upsertCall = prismaMock.googleCalendarCredential.upsert.mock.calls[0][0];
    expect(upsertCall.where).toEqual({ userId: "user-1" });
    expect(upsertCall.update.refreshToken).toBe("fresh-refresh");
    expect(upsertCall.create.refreshToken).toBe("fresh-refresh");
    expect(prismaMock.googleCalendarCredential.findUnique).not.toHaveBeenCalled();
  });

  test("reuses stored refresh token when token input omits it", async () => {
    prismaMock.googleCalendarCredential.findUnique.mockResolvedValueOnce({
      refreshToken: "stored-refresh",
    });
    prismaMock.googleCalendarCredential.upsert.mockResolvedValueOnce({});

    await upsertGoogleCalendarCredentialTokens({
      userId: "user-1",
      accessToken: "access-token",
      expiresIn: 3600,
      tokenType: "Bearer",
      scope: "scope-a",
    });

    const upsertCall = prismaMock.googleCalendarCredential.upsert.mock.calls[0][0];
    expect(upsertCall.update.refreshToken).toBe("stored-refresh");
    expect(upsertCall.create.refreshToken).toBe("stored-refresh");
  });

  test("throws when refresh token is unavailable from input and storage", async () => {
    prismaMock.googleCalendarCredential.findUnique.mockResolvedValueOnce(null);

    await expect(
      upsertGoogleCalendarCredentialTokens({
        userId: "user-1",
        accessToken: "access-token",
        expiresIn: 3600,
        tokenType: "Bearer",
        scope: "scope-a",
      })
    ).rejects.toThrow("missing-refresh-token");

    expect(prismaMock.googleCalendarCredential.upsert).not.toHaveBeenCalled();
  });
});
