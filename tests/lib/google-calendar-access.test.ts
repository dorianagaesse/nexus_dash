import { beforeEach, describe, expect, test, vi } from "vitest";

const credentialServiceMock = vi.hoisted(() => ({
  findGoogleCalendarCredential: vi.fn(),
  normalizeGoogleCalendarId: vi.fn((value: string | null | undefined) =>
    value?.trim() || "primary"
  ),
  updateGoogleCalendarCredentialTokens: vi.fn(),
}));

vi.mock("@/lib/services/google-calendar-credential-service", () =>
  credentialServiceMock
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
    expect(credentialServiceMock.findGoogleCalendarCredential).not.toHaveBeenCalled();
  });

  test("returns not-connected when no active credential exists", async () => {
    credentialServiceMock.findGoogleCalendarCredential.mockResolvedValueOnce(null);

    await expect(getAuthorizedGoogleCalendarContext("user-1")).resolves.toEqual({
      ok: false,
      failure: { status: 401, error: "not-connected" },
    });
  });

  test("maps credential-store failures to service unavailable instead of 401", async () => {
    credentialServiceMock.findGoogleCalendarCredential.mockRejectedValueOnce(
      new Error('relation "GoogleCalendarCredential" does not exist')
    );

    await expect(getAuthorizedGoogleCalendarContext("user-1")).resolves.toEqual({
      ok: false,
      failure: { status: 503, error: "calendar-unavailable" },
    });
  });
});
