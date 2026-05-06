import { beforeEach, describe, expect, test, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const apiGuardMock = vi.hoisted(() => ({
  requireAuthenticatedApiUser: vi.fn(),
}));

const settingsServiceMock = vi.hoisted(() => ({
  getGoogleCalendarTargetSettings: vi.fn(),
  updateGoogleCalendarTargetSettings: vi.fn(),
}));

const logServerWarningMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/api-guard", () => ({
  requireAuthenticatedApiUser: apiGuardMock.requireAuthenticatedApiUser,
}));

vi.mock("@/lib/observability/logger", () => ({
  logServerWarning: logServerWarningMock,
}));

vi.mock("@/lib/services/account-settings-service", () => ({
  getGoogleCalendarTargetSettings:
    settingsServiceMock.getGoogleCalendarTargetSettings,
  updateGoogleCalendarTargetSettings:
    settingsServiceMock.updateGoogleCalendarTargetSettings,
}));

import {
  DELETE,
  GET,
  PATCH,
} from "@/app/api/account/settings/google-calendar/route";

async function readJson(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
}

describe("account Google Calendar settings route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiGuardMock.requireAuthenticatedApiUser.mockResolvedValue({
      ok: true,
      userId: "user-1",
    });
  });

  test("GET returns auth failure response when unauthenticated", async () => {
    apiGuardMock.requireAuthenticatedApiUser.mockResolvedValueOnce({
      ok: false,
      response: NextResponse.json({ error: "unauthorized" }, { status: 401 }),
    });

    const response = await GET(
      new NextRequest("http://localhost/api/account/settings/google-calendar")
    );

    expect(response.status).toBe(401);
    await expect(readJson(response)).resolves.toEqual({ error: "unauthorized" });
    expect(settingsServiceMock.getGoogleCalendarTargetSettings).not.toHaveBeenCalled();
  });

  test("GET returns target settings", async () => {
    settingsServiceMock.getGoogleCalendarTargetSettings.mockResolvedValueOnce({
      ok: true,
      status: 200,
      data: {
        calendarId: "primary",
        hasCalendarConnection: true,
      },
    });

    const response = await GET(
      new NextRequest("http://localhost/api/account/settings/google-calendar")
    );

    expect(response.status).toBe(200);
    await expect(readJson(response)).resolves.toEqual({
      settings: {
        calendarId: "primary",
        hasCalendarConnection: true,
      },
    });
    expect(settingsServiceMock.getGoogleCalendarTargetSettings).toHaveBeenCalledWith(
      "user-1"
    );
  });

  test("PATCH updates target calendar", async () => {
    settingsServiceMock.updateGoogleCalendarTargetSettings.mockResolvedValueOnce({
      ok: true,
      status: 200,
      data: {
        calendarId: "team@example.com",
      },
    });

    const response = await PATCH(
      new NextRequest("http://localhost/api/account/settings/google-calendar", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ calendarId: "team@example.com" }),
      })
    );

    expect(response.status).toBe(200);
    await expect(readJson(response)).resolves.toEqual({
      settings: {
        calendarId: "team@example.com",
      },
    });
    expect(settingsServiceMock.updateGoogleCalendarTargetSettings).toHaveBeenCalledWith({
      actorUserId: "user-1",
      calendarIdRaw: "team@example.com",
    });
  });

  test("PATCH rejects invalid json payloads", async () => {
    const response = await PATCH(
      new NextRequest("http://localhost/api/account/settings/google-calendar", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: "{",
      })
    );

    expect(response.status).toBe(400);
    await expect(readJson(response)).resolves.toEqual({ error: "invalid-json" });
    expect(logServerWarningMock).toHaveBeenCalled();
    expect(settingsServiceMock.updateGoogleCalendarTargetSettings).not.toHaveBeenCalled();
  });

  test("DELETE resets target calendar to default", async () => {
    settingsServiceMock.updateGoogleCalendarTargetSettings.mockResolvedValueOnce({
      ok: true,
      status: 200,
      data: {
        calendarId: "primary",
      },
    });

    const response = await DELETE(
      new NextRequest("http://localhost/api/account/settings/google-calendar", {
        method: "DELETE",
      })
    );

    expect(response.status).toBe(200);
    await expect(readJson(response)).resolves.toEqual({
      settings: {
        calendarId: "primary",
      },
    });
    expect(settingsServiceMock.updateGoogleCalendarTargetSettings).toHaveBeenCalledWith({
      actorUserId: "user-1",
      calendarIdRaw: "",
    });
  });
});
