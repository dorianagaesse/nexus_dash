import { beforeEach, describe, expect, test, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  googleCalendarCredential: {
    findUnique: vi.fn(),
    update: vi.fn(),
    upsert: vi.fn(),
  },
}));

const googleCalendarMock = vi.hoisted(() => ({
  createExpiryDate: vi.fn(),
  getGoogleCalendarId: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: prismaMock,
}));

vi.mock("@/lib/google-calendar", () => ({
  createExpiryDate: googleCalendarMock.createExpiryDate,
  getGoogleCalendarId: googleCalendarMock.getGoogleCalendarId,
}));

import {
  findGoogleCalendarCredential,
  updateGoogleCalendarCredentialTokens,
  upsertGoogleCalendarCredentialTokens,
} from "@/lib/services/google-calendar-credential-service";

describe("google-calendar-credential-service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    googleCalendarMock.createExpiryDate.mockReturnValue(
      new Date("2026-02-16T00:00:00.000Z")
    );
    googleCalendarMock.getGoogleCalendarId.mockReturnValue("primary");
  });

  test("finds credential by user id", async () => {
    prismaMock.googleCalendarCredential.findUnique.mockResolvedValueOnce({
      userId: "user-1",
    });

    const result = await findGoogleCalendarCredential("user-1");

    expect(result).toEqual({ userId: "user-1" });
    expect(prismaMock.googleCalendarCredential.findUnique).toHaveBeenCalledWith({
      where: { userId: "user-1" },
    });
  });

  test("updates credential tokens with refreshed expiry", async () => {
    prismaMock.googleCalendarCredential.update.mockResolvedValueOnce({});

    await updateGoogleCalendarCredentialTokens({
      userId: "user-1",
      accessToken: "new-access",
      expiresIn: 3600,
      refreshToken: "refresh",
      tokenType: "Bearer",
      scope: "scope-a",
    });

    expect(googleCalendarMock.createExpiryDate).toHaveBeenCalledWith(3600);
    expect(prismaMock.googleCalendarCredential.update).toHaveBeenCalledWith({
      where: { userId: "user-1" },
      data: {
        accessToken: "new-access",
        refreshToken: "refresh",
        tokenType: "Bearer",
        scope: "scope-a",
        providerAccountId: undefined,
        calendarId: undefined,
        revokedAt: null,
        expiresAt: new Date("2026-02-16T00:00:00.000Z"),
      },
    });
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
    expect(upsertCall.create.calendarId).toBe("primary");
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
