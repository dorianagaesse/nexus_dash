import { beforeEach, describe, expect, test, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  calendarPreference: {
    findUnique: vi.fn(),
    upsert: vi.fn(),
  },
  calendarSource: {
    findFirst: vi.fn(),
  },
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/services/calendar-connection-service", () => ({
  GOOGLE_CALENDAR_PROVIDER: "google",
  findCalendarConnection: vi.fn(),
  getWritableCalendarSourceContext: vi.fn(),
  updateCalendarConnectionTokens: vi.fn(),
}));

import { updateGoogleCalendarCredentialCalendarId } from "@/lib/services/google-calendar-credential-service";

describe("singular Google Calendar settings compatibility", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.calendarPreference.findUnique.mockResolvedValue({
      defaultConnectionId: "default-connection",
    });
    prismaMock.calendarPreference.upsert.mockResolvedValue({});
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
});
