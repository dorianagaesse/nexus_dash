import { beforeEach, describe, expect, test, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  calendarConnection: {
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    deleteMany: vi.fn(),
    count: vi.fn(),
  },
  calendarSource: {
    findMany: vi.fn(),
    updateMany: vi.fn(),
    upsert: vi.fn(),
  },
  calendarPreference: {
    findUnique: vi.fn(),
    create: vi.fn(),
    upsert: vi.fn(),
    updateMany: vi.fn(),
  },
}));

const providerMock = vi.hoisted(() => ({
  discoverCalendars: vi.fn(),
  revoke: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/calendar-providers/google", () => ({
  getCalendarProvider: () => providerMock,
}));

import {
  connectGoogleCalendarAccount,
  disconnectCalendarConnection,
  updateCalendarPreferences,
} from "@/lib/services/calendar-connection-service";

describe("calendar connection service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.calendarConnection.findUnique.mockResolvedValue(null);
    prismaMock.calendarConnection.findFirst.mockResolvedValue(null);
    prismaMock.calendarConnection.create.mockResolvedValue({ id: "connection-1" });
    prismaMock.calendarConnection.count.mockResolvedValue(1);
    prismaMock.calendarPreference.findUnique.mockResolvedValue(null);
    prismaMock.calendarSource.updateMany.mockResolvedValue({ count: 0 });
    prismaMock.calendarSource.upsert.mockResolvedValue({ id: "source-primary" });
    prismaMock.calendarConnection.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.calendarPreference.create.mockResolvedValue({});
    prismaMock.calendarPreference.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.calendarConnection.deleteMany.mockResolvedValue({ count: 1 });
    providerMock.revoke.mockResolvedValue(true);
    providerMock.discoverCalendars.mockResolvedValue([
      {
        providerCalendarId: "primary@example.com",
        name: "Primary",
        color: "#4285f4",
        timeZone: "Europe/Paris",
        accessRole: "owner",
        isPrimary: true,
        writable: true,
      },
    ]);
  });

  test("creates a distinct provider account and selects its primary calendar first", async () => {
    await connectGoogleCalendarAccount({
      userId: "user-1",
      identity: {
        accountId: "google-sub-1",
        email: "one@example.com",
        label: "one@example.com",
      },
      tokens: {
        accessToken: "access-token",
        refreshToken: "refresh-token",
        expiresIn: 3600,
        scope: "openid email calendar",
      },
    });

    expect(prismaMock.calendarConnection.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: "user-1",
        provider: "google",
        providerAccountId: "google-sub-1",
        accountEmail: "one@example.com",
      }),
    });
    expect(prismaMock.calendarSource.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          userId: "user-1",
          isPrimary: true,
          isSelected: true,
        }),
      })
    );
    expect(prismaMock.calendarPreference.create).toHaveBeenCalledWith({
      data: {
        userId: "user-1",
        defaultConnectionId: "connection-1",
        writeSourceId: "source-primary",
      },
    });
  });

  test("rejects reconnect when Google returns a different established account", async () => {
    prismaMock.calendarConnection.findFirst.mockResolvedValueOnce({
      id: "connection-1",
      providerAccountId: "google-sub-original",
    });
    await expect(
      connectGoogleCalendarAccount({
        userId: "user-1",
        reconnectConnectionId: "connection-1",
        identity: {
          accountId: "google-sub-other",
          email: "other@example.com",
          label: "other@example.com",
        },
        tokens: { accessToken: "access", refreshToken: "refresh", expiresIn: 60 },
      })
    ).rejects.toThrow("calendar-reconnect-account-mismatch");
    expect(prismaMock.calendarConnection.update).not.toHaveBeenCalled();
  });

  test("rejects forged cross-user source preferences", async () => {
    prismaMock.calendarSource.findMany.mockResolvedValue([]);
    await expect(
      updateCalendarPreferences({
        userId: "user-1",
        selectedSourceIds: ["source-owned-by-user-2"],
      })
    ).rejects.toThrow("calendar-source-not-found");
  });

  test("adopts a legacy identity in place on the next successful OAuth callback", async () => {
    prismaMock.calendarConnection.findFirst.mockResolvedValueOnce({
      id: "legacy-connection",
      providerAccountId: "legacy:legacy-connection",
      refreshToken: "legacy-refresh",
    });
    prismaMock.calendarConnection.update.mockResolvedValueOnce({
      id: "legacy-connection",
    });

    await connectGoogleCalendarAccount({
      userId: "user-1",
      identity: {
        accountId: "google-sub-adopted",
        email: "adopted@example.com",
        label: "adopted@example.com",
      },
      tokens: {
        accessToken: "new-access",
        refreshToken: "new-refresh",
        expiresIn: 3600,
      },
    });

    expect(prismaMock.calendarConnection.update).toHaveBeenCalledWith({
      where: { id: "legacy-connection" },
      data: expect.objectContaining({
        providerAccountId: "google-sub-adopted",
        accountEmail: "adopted@example.com",
      }),
    });
    expect(prismaMock.calendarConnection.create).not.toHaveBeenCalled();
  });

  test("adding a second account does not replace the existing write target", async () => {
    prismaMock.calendarConnection.count.mockResolvedValueOnce(2);
    prismaMock.calendarPreference.findUnique.mockResolvedValueOnce({
      userId: "user-1",
      defaultConnectionId: "connection-existing",
      writeSourceId: "source-existing",
    });

    await connectGoogleCalendarAccount({
      userId: "user-1",
      identity: {
        accountId: "google-sub-2",
        email: "two@example.com",
        label: "two@example.com",
      },
      tokens: {
        accessToken: "access-two",
        refreshToken: "refresh-two",
        expiresIn: 3600,
      },
    });

    expect(prismaMock.calendarSource.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ isSelected: false }),
      })
    );
    expect(prismaMock.calendarPreference.create).not.toHaveBeenCalled();
  });

  test("disconnect deletes only the selected connection and clears its write target", async () => {
    prismaMock.calendarConnection.findFirst.mockResolvedValueOnce({
      id: "connection-2",
      userId: "user-1",
      provider: "google",
      providerAccountId: "google-sub-2",
      accountLabel: "two@example.com",
      accountEmail: "two@example.com",
      accessToken: null,
      refreshToken: "refresh-two",
      tokenType: null,
      scopes: "scope-a",
      expiresAt: null,
      revokedAt: null,
      reauthorizationRequiredAt: null,
      calendarListSyncedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    prismaMock.calendarSource.findMany.mockResolvedValueOnce([
      { id: "source-2" },
    ]);

    await expect(
      disconnectCalendarConnection({
        userId: "user-1",
        connectionId: "connection-2",
      })
    ).resolves.toEqual({ revocationStatus: "revoked" });
    expect(prismaMock.calendarConnection.deleteMany).toHaveBeenCalledWith({
      where: { id: "connection-2", userId: "user-1" },
    });
    expect(prismaMock.calendarPreference.updateMany).toHaveBeenCalledWith({
      where: { userId: "user-1", writeSourceId: { in: ["source-2"] } },
      data: { writeSourceId: null },
    });
  });
});
