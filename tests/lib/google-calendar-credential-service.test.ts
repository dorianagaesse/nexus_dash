import { beforeEach, describe, expect, test, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  googleCalendarCredential: {
    findUnique: vi.fn(),
    update: vi.fn(),
    upsert: vi.fn(),
  },
}));

const googleCalendarMock = vi.hoisted(() => ({
  GOOGLE_CALENDAR_CONNECTION_ID: "default",
  createExpiryDate: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: prismaMock,
}));

vi.mock("@/lib/google-calendar", () => ({
  GOOGLE_CALENDAR_CONNECTION_ID: googleCalendarMock.GOOGLE_CALENDAR_CONNECTION_ID,
  createExpiryDate: googleCalendarMock.createExpiryDate,
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
  });

  test("finds credential by fixed connection id", async () => {
    prismaMock.googleCalendarCredential.findUnique.mockResolvedValueOnce({
      id: "default",
    });

    const result = await findGoogleCalendarCredential();

    expect(result).toEqual({ id: "default" });
    expect(prismaMock.googleCalendarCredential.findUnique).toHaveBeenCalledWith({
      where: { id: "default" },
    });
  });

  test("updates credential tokens with refreshed expiry", async () => {
    prismaMock.googleCalendarCredential.update.mockResolvedValueOnce({});

    await updateGoogleCalendarCredentialTokens({
      accessToken: "new-access",
      expiresIn: 3600,
      refreshToken: "refresh",
      tokenType: "Bearer",
      scope: "scope-a",
    });

    expect(googleCalendarMock.createExpiryDate).toHaveBeenCalledWith(3600);
    expect(prismaMock.googleCalendarCredential.update).toHaveBeenCalledWith({
      where: { id: "default" },
      data: {
        accessToken: "new-access",
        refreshToken: "refresh",
        tokenType: "Bearer",
        scope: "scope-a",
        expiresAt: new Date("2026-02-16T00:00:00.000Z"),
      },
    });
  });

  test("upserts credential using provided refresh token", async () => {
    prismaMock.googleCalendarCredential.upsert.mockResolvedValueOnce({});

    await upsertGoogleCalendarCredentialTokens({
      accessToken: "access-token",
      expiresIn: 3600,
      refreshToken: "fresh-refresh",
      tokenType: "Bearer",
      scope: "scope-a",
    });

    const upsertCall = prismaMock.googleCalendarCredential.upsert.mock.calls[0][0];
    expect(upsertCall.where).toEqual({ id: "default" });
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
        accessToken: "access-token",
        expiresIn: 3600,
        tokenType: "Bearer",
        scope: "scope-a",
      })
    ).rejects.toThrow("missing-refresh-token");

    expect(prismaMock.googleCalendarCredential.upsert).not.toHaveBeenCalled();
  });
});
