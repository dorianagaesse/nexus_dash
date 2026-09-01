import { beforeEach, describe, expect, test, vi } from "vitest";

const googleCalendarCredentialServiceMock = vi.hoisted(() => ({
  findGoogleCalendarCredentialCalendarId: vi.fn(),
  updateGoogleCalendarCredentialCalendarId: vi.fn(),
  markGoogleCalendarCredentialRevokedForDisconnect: vi.fn(),
  deleteGoogleCalendarCredential: vi.fn(),
}));

const googleCalendarMock = vi.hoisted(() => ({
  revokeGoogleToken: vi.fn(),
}));

vi.mock("@/lib/services/google-calendar-credential-service", () => {
  class GoogleCalendarCredentialTokenDecryptionError extends Error {
    readonly originalError: unknown;

    constructor(originalError: unknown) {
      super("google-calendar-credential-token-decryption-failed");
      this.name = "GoogleCalendarCredentialTokenDecryptionError";
      this.originalError = originalError;
    }
  }

  return {
    DEFAULT_GOOGLE_CALENDAR_ID: "primary",
    MAX_GOOGLE_CALENDAR_ID_LENGTH: 255,
    GoogleCalendarCredentialTokenDecryptionError,
    normalizeGoogleCalendarId: (value: string | null | undefined) =>
      value?.trim() || "primary",
    findGoogleCalendarCredentialCalendarId:
      googleCalendarCredentialServiceMock.findGoogleCalendarCredentialCalendarId,
    updateGoogleCalendarCredentialCalendarId:
      googleCalendarCredentialServiceMock.updateGoogleCalendarCredentialCalendarId,
    markGoogleCalendarCredentialRevokedForDisconnect:
      googleCalendarCredentialServiceMock.markGoogleCalendarCredentialRevokedForDisconnect,
    deleteGoogleCalendarCredential:
      googleCalendarCredentialServiceMock.deleteGoogleCalendarCredential,
  };
});

vi.mock("@/lib/google-calendar", async () => {
  const actual = await vi.importActual<typeof import("@/lib/google-calendar")>(
    "@/lib/google-calendar"
  );
  return { ...actual, revokeGoogleToken: googleCalendarMock.revokeGoogleToken };
});

import {
  disconnectGoogleCalendar,
  getGoogleCalendarTargetSettings,
  updateGoogleCalendarTargetSettings,
} from "@/lib/services/account-settings-service";
import {
  DEFAULT_GOOGLE_CALENDAR_ID,
  GoogleCalendarCredentialTokenDecryptionError,
  MAX_GOOGLE_CALENDAR_ID_LENGTH,
} from "@/lib/services/google-calendar-credential-service";

describe("account-settings-service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    googleCalendarCredentialServiceMock.deleteGoogleCalendarCredential.mockResolvedValue(
      undefined
    );
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

  test("rejects cross-user disconnect attempts", async () => {
    const result = await disconnectGoogleCalendar({
      actorUserId: "user-1",
      subjectUserId: "user-2",
    });

    expect(result).toEqual({ ok: false, status: 403, error: "forbidden" });
    expect(
      googleCalendarCredentialServiceMock.markGoogleCalendarCredentialRevokedForDisconnect
    ).not.toHaveBeenCalled();
  });

  test("disconnect is idempotent when no credential exists", async () => {
    googleCalendarCredentialServiceMock.markGoogleCalendarCredentialRevokedForDisconnect.mockResolvedValueOnce(
      null
    );

    await expect(
      disconnectGoogleCalendar({ actorUserId: "user-1" })
    ).resolves.toEqual({
      ok: true,
      status: 200,
      data: {
        hasCalendarConnection: false,
        revocationStatus: "not-connected",
      },
    });
    expect(googleCalendarMock.revokeGoogleToken).not.toHaveBeenCalled();
  });

  test("deletes local credentials after confirmed provider revocation", async () => {
    googleCalendarCredentialServiceMock.markGoogleCalendarCredentialRevokedForDisconnect.mockResolvedValueOnce(
      { refreshToken: "refresh-token" }
    );
    googleCalendarMock.revokeGoogleToken.mockResolvedValueOnce(true);

    await expect(
      disconnectGoogleCalendar({ actorUserId: "user-1" })
    ).resolves.toMatchObject({
      ok: true,
      data: { revocationStatus: "revoked" },
    });
    expect(
      googleCalendarCredentialServiceMock.deleteGoogleCalendarCredential
    ).toHaveBeenCalledWith("user-1");
  });

  test("deletes local credentials when provider revocation is unconfirmed", async () => {
    googleCalendarCredentialServiceMock.markGoogleCalendarCredentialRevokedForDisconnect.mockResolvedValueOnce(
      { refreshToken: "refresh-token" }
    );
    googleCalendarMock.revokeGoogleToken.mockRejectedValueOnce(new Error("network"));

    await expect(
      disconnectGoogleCalendar({ actorUserId: "user-1" })
    ).resolves.toMatchObject({
      ok: true,
      data: { revocationStatus: "unconfirmed" },
    });
    expect(
      googleCalendarCredentialServiceMock.deleteGoogleCalendarCredential
    ).toHaveBeenCalledWith("user-1");
  });

  test("deletes local credentials when the stored token cannot be decrypted", async () => {
    googleCalendarCredentialServiceMock.markGoogleCalendarCredentialRevokedForDisconnect.mockRejectedValueOnce(
      new GoogleCalendarCredentialTokenDecryptionError(
        new Error("invalid-google-token-ciphertext")
      )
    );

    await expect(
      disconnectGoogleCalendar({ actorUserId: "user-1" })
    ).resolves.toMatchObject({
      ok: true,
      data: { revocationStatus: "unconfirmed" },
    });
    expect(googleCalendarMock.revokeGoogleToken).not.toHaveBeenCalled();
    expect(
      googleCalendarCredentialServiceMock.deleteGoogleCalendarCredential
    ).toHaveBeenCalledWith("user-1");
  });

  test("rethrows unexpected credential lookup failures without deleting", async () => {
    const databaseError = new Error("database unavailable");
    googleCalendarCredentialServiceMock.markGoogleCalendarCredentialRevokedForDisconnect.mockRejectedValueOnce(
      databaseError
    );

    await expect(
      disconnectGoogleCalendar({ actorUserId: "user-1" })
    ).rejects.toBe(databaseError);
    expect(
      googleCalendarCredentialServiceMock.deleteGoogleCalendarCredential
    ).not.toHaveBeenCalled();
  });
});
