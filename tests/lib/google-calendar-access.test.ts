import { beforeEach, describe, expect, test, vi } from "vitest";

const calendarConnectionServiceMock = vi.hoisted(() => ({
  ensureFreshAccessToken: vi.fn(),
  getWritableCalendarSourceContext: vi.fn(),
}));

vi.mock("@/lib/services/calendar-connection-service", () =>
  calendarConnectionServiceMock
);

vi.mock("@/lib/google-calendar", () => ({
  GOOGLE_CALENDAR_SCOPE_EVENTS: "calendar-events-scope",
  GOOGLE_CALENDAR_SCOPE_FULL: "calendar-full-scope",
  createExpiryDate: vi.fn(),
  refreshAccessToken: vi.fn(),
}));

vi.mock("@/lib/observability/logger", () => ({
  logServerError: vi.fn(),
}));

import { getAuthorizedGoogleCalendarContext } from "@/lib/google-calendar-access";

describe("getAuthorizedGoogleCalendarContext", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("returns unauthorized for an empty actor", async () => {
    await expect(getAuthorizedGoogleCalendarContext("  ")).resolves.toEqual({
      ok: false,
      failure: { status: 401, error: "unauthorized" },
    });
    expect(
      calendarConnectionServiceMock.getWritableCalendarSourceContext
    ).not.toHaveBeenCalled();
  });

  test("returns not-connected when no active credential exists", async () => {
    calendarConnectionServiceMock.getWritableCalendarSourceContext.mockResolvedValueOnce(
      null
    );

    await expect(getAuthorizedGoogleCalendarContext("user-1")).resolves.toEqual({
      ok: false,
      failure: { status: 401, error: "not-connected" },
    });
  });

  test("maps credential-store failures to service unavailable instead of 401", async () => {
    calendarConnectionServiceMock.getWritableCalendarSourceContext.mockRejectedValueOnce(
      new Error('relation "CalendarConnection" does not exist')
    );

    await expect(getAuthorizedGoogleCalendarContext("user-1")).resolves.toEqual({
      ok: false,
      failure: { status: 503, error: "calendar-unavailable" },
    });
  });
});
