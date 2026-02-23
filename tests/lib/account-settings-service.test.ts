import { beforeEach, describe, expect, test, vi } from "vitest";

const googleCalendarCredentialServiceMock = vi.hoisted(() => ({
  findGoogleCalendarCredentialCalendarId: vi.fn(),
  updateGoogleCalendarCredentialCalendarId: vi.fn(),
}));

vi.mock("@/lib/services/google-calendar-credential-service", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/services/google-calendar-credential-service")
  >("@/lib/services/google-calendar-credential-service");

  return {
    ...actual,
    findGoogleCalendarCredentialCalendarId:
      googleCalendarCredentialServiceMock.findGoogleCalendarCredentialCalendarId,
    updateGoogleCalendarCredentialCalendarId:
      googleCalendarCredentialServiceMock.updateGoogleCalendarCredentialCalendarId,
  };
});

import {
  getGoogleCalendarTargetSettings,
  updateGoogleCalendarTargetSettings,
} from "@/lib/services/account-settings-service";
import {
  DEFAULT_GOOGLE_CALENDAR_ID,
  MAX_GOOGLE_CALENDAR_ID_LENGTH,
} from "@/lib/services/google-calendar-credential-service";

describe("account-settings-service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("returns primary and disconnected status when user has no credential", async () => {
    googleCalendarCredentialServiceMock.findGoogleCalendarCredentialCalendarId.mockResolvedValueOnce(
      null
    );

    const result = await getGoogleCalendarTargetSettings("user-1");

    expect(result).toEqual({
      ok: true,
      status: 200,
      data: {
        calendarId: DEFAULT_GOOGLE_CALENDAR_ID,
        hasCalendarConnection: false,
      },
    });
  });

  test("returns stored calendar id when user has credential", async () => {
    googleCalendarCredentialServiceMock.findGoogleCalendarCredentialCalendarId.mockResolvedValueOnce(
      "team-calendar@example.com"
    );

    const result = await getGoogleCalendarTargetSettings("user-1");

    expect(result).toEqual({
      ok: true,
      status: 200,
      data: {
        calendarId: "team-calendar@example.com",
        hasCalendarConnection: true,
      },
    });
  });

  test("rejects updates when actor is missing", async () => {
    const result = await updateGoogleCalendarTargetSettings({
      actorUserId: " ",
      calendarIdRaw: "team@example.com",
    });

    expect(result).toEqual({
      ok: false,
      status: 401,
      error: "unauthorized",
    });
  });

  test("rejects cross-user updates", async () => {
    const result = await updateGoogleCalendarTargetSettings({
      actorUserId: "user-1",
      subjectUserId: "user-2",
      calendarIdRaw: "team@example.com",
    });

    expect(result).toEqual({
      ok: false,
      status: 403,
      error: "forbidden",
    });
    expect(
      googleCalendarCredentialServiceMock.updateGoogleCalendarCredentialCalendarId
    ).not.toHaveBeenCalled();
  });

  test("rejects calendar id values that exceed max length", async () => {
    const result = await updateGoogleCalendarTargetSettings({
      actorUserId: "user-1",
      calendarIdRaw: "x".repeat(MAX_GOOGLE_CALENDAR_ID_LENGTH + 1),
    });

    expect(result).toEqual({
      ok: false,
      status: 400,
      error: "invalid-calendar-id",
    });
    expect(
      googleCalendarCredentialServiceMock.updateGoogleCalendarCredentialCalendarId
    ).not.toHaveBeenCalled();
  });

  test("resets to primary when empty value is submitted", async () => {
    googleCalendarCredentialServiceMock.updateGoogleCalendarCredentialCalendarId.mockResolvedValueOnce(
      true
    );

    const result = await updateGoogleCalendarTargetSettings({
      actorUserId: "user-1",
      calendarIdRaw: "   ",
    });

    expect(result).toEqual({
      ok: true,
      status: 200,
      data: {
        calendarId: DEFAULT_GOOGLE_CALENDAR_ID,
      },
    });
    expect(
      googleCalendarCredentialServiceMock.updateGoogleCalendarCredentialCalendarId
    ).toHaveBeenCalledWith({
      userId: "user-1",
      calendarId: DEFAULT_GOOGLE_CALENDAR_ID,
    });
  });

  test("returns calendar-not-connected when actor has no credential row", async () => {
    googleCalendarCredentialServiceMock.updateGoogleCalendarCredentialCalendarId.mockResolvedValueOnce(
      false
    );

    const result = await updateGoogleCalendarTargetSettings({
      actorUserId: "user-1",
      calendarIdRaw: "team@example.com",
    });

    expect(result).toEqual({
      ok: false,
      status: 409,
      error: "calendar-not-connected",
    });
  });
});
