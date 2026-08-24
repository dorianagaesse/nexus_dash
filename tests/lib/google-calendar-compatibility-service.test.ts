import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  calendarPreference: {
    findUnique: vi.fn(),
    upsert: vi.fn(),
  },
  calendarSource: {
    findFirst: vi.fn(),
    upsert: vi.fn(),
  },
  calendarConnection: {
    findFirst: vi.fn(),
    update: vi.fn(),
    create: vi.fn(),
  },
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/services/calendar-connection-service", () => ({
  GOOGLE_CALENDAR_PROVIDER: "google",
  findCalendarConnection: vi.fn(),
  getWritableCalendarSourceContext: vi.fn(),
  updateCalendarConnectionTokens: vi.fn(),
}));

import {
  GoogleCalendarCredentialTokenDecryptionError,
  markGoogleCalendarCredentialRevokedForDisconnect,
  updateGoogleCalendarCredentialCalendarId,
  upsertGoogleCalendarCredentialTokens,
} from "@/lib/services/google-calendar-credential-service";
import { findCalendarConnection } from "@/lib/services/calendar-connection-service";

describe("singular Google Calendar settings compatibility", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.calendarPreference.findUnique.mockResolvedValue({
      defaultConnectionId: "default-connection",
    });
    prismaMock.calendarPreference.upsert.mockResolvedValue({});
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  test("resolves duplicate provider calendar IDs only within the default connection", async () => {
    prismaMock.calendarSource.findFirst.mockResolvedValue({
      id: "default-source",
      connectionId: "default-connection",
    });

    await expect(
      updateGoogleCalendarCredentialCalendarId({
        userId: "user-1",
        calendarId: "shared@example.com",
      })
    ).resolves.toBe(true);
    expect(prismaMock.calendarSource.findFirst).toHaveBeenCalledWith({
      where: {
        userId: "user-1",
        connectionId: "default-connection",
        providerCalendarId: "shared@example.com",
        isAvailable: true,
        accessRole: { in: ["owner", "writer"] },
        connection: { provider: "google", revokedAt: null },
      },
    });
  });

  test("refuses an undiscovered or read-only compatibility target", async () => {
    prismaMock.calendarSource.findFirst.mockResolvedValue(null);
    await expect(
      updateGoogleCalendarCredentialCalendarId({
        userId: "user-1",
        calendarId: "reader@example.com",
      })
    ).resolves.toBe(false);
    expect(prismaMock.calendarPreference.upsert).not.toHaveBeenCalled();
  });

  test("upgrades a reused plaintext refresh token when encryption becomes configured", async () => {
    vi.stubEnv("GOOGLE_TOKEN_ENCRYPTION_KEY", "task-327-test-encryption-key");
    prismaMock.calendarConnection.findFirst.mockResolvedValue({
      id: "legacy-connection",
      refreshToken: "legacy-plaintext-refresh",
    });
    prismaMock.calendarConnection.update.mockResolvedValue({
      id: "legacy-connection",
    });
    prismaMock.calendarSource.upsert.mockResolvedValue({
      id: "primary-source",
    });

    await upsertGoogleCalendarCredentialTokens({
      userId: "user-1",
      accessToken: "fresh-access",
      expiresIn: 3600,
    });

    expect(prismaMock.calendarConnection.update).toHaveBeenCalledWith({
      where: { id: "legacy-connection" },
      data: expect.objectContaining({
        refreshToken: expect.stringMatching(/^enc:v1:/),
      }),
    });
    expect(
      prismaMock.calendarConnection.update.mock.calls[0]?.[0]?.data.refreshToken
    ).not.toBe("legacy-plaintext-refresh");
  });

  test("classifies connection token decryption failures during disconnect", async () => {
    const decryptionError = new Error("invalid-google-token-ciphertext");
    vi.mocked(findCalendarConnection).mockRejectedValueOnce(decryptionError);

    await expect(
      markGoogleCalendarCredentialRevokedForDisconnect("user-1")
    ).rejects.toMatchObject({
      name: GoogleCalendarCredentialTokenDecryptionError.name,
      originalError: decryptionError,
    });
  });
});
