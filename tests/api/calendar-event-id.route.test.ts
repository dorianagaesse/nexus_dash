import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { NextRequest } from "next/server";

const googleCalendarAccessMock = vi.hoisted(() => ({
  getAuthorizedGoogleCalendarContext: vi.fn(),
  hasCalendarWriteScope: vi.fn(),
}));

vi.mock("@/lib/google-calendar-access", () => ({
  getAuthorizedGoogleCalendarContext:
    googleCalendarAccessMock.getAuthorizedGoogleCalendarContext,
  hasCalendarWriteScope: googleCalendarAccessMock.hasCalendarWriteScope,
}));

import {
  DELETE,
  PATCH,
} from "@/app/api/calendar/events/[eventId]/route";

async function readJson(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
}

describe("calendar event by id routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    googleCalendarAccessMock.hasCalendarWriteScope.mockReturnValue(true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("PATCH returns 400 when event id is missing", async () => {
    const response = await PATCH(new NextRequest("http://localhost/api/calendar/events"), {
      params: { eventId: "" },
    });

    expect(response.status).toBe(400);
    await expect(readJson(response)).resolves.toEqual({
      error: "missing-event-id",
    });
  });

  test("PATCH returns auth failure from calendar resolver", async () => {
    googleCalendarAccessMock.getAuthorizedGoogleCalendarContext.mockResolvedValueOnce({
      ok: false,
      failure: { status: 401, error: "not-connected" },
    });

    const response = await PATCH(
      new NextRequest("http://localhost/api/calendar/events/evt-1", {
        method: "PATCH",
      }),
      { params: { eventId: "evt-1" } }
    );

    expect(response.status).toBe(401);
    await expect(readJson(response)).resolves.toEqual({ error: "not-connected" });
  });

  test("PATCH rejects when write scope is missing", async () => {
    googleCalendarAccessMock.getAuthorizedGoogleCalendarContext.mockResolvedValueOnce({
      ok: true,
      context: {
        accessToken: "token",
        calendarId: "primary",
        scope: "readonly",
      },
    });
    googleCalendarAccessMock.hasCalendarWriteScope.mockReturnValueOnce(false);

    const response = await PATCH(
      new NextRequest("http://localhost/api/calendar/events/evt-1", {
        method: "PATCH",
      }),
      { params: { eventId: "evt-1" } }
    );

    expect(response.status).toBe(403);
    await expect(readJson(response)).resolves.toEqual({
      error: "insufficient-scope",
    });
  });

  test("PATCH maps Google insufficient permissions to 403", async () => {
    googleCalendarAccessMock.getAuthorizedGoogleCalendarContext.mockResolvedValueOnce({
      ok: true,
      context: {
        accessToken: "token",
        calendarId: "primary",
        scope: "write-scope",
      },
    });
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          error: {
            errors: [{ reason: "insufficientPermissions" }],
          },
        }),
        { status: 403 }
      )
    );

    const response = await PATCH(
      new NextRequest("http://localhost/api/calendar/events/evt-1", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          summary: "Updated title",
          start: "2026-02-14T10:00:00.000Z",
          end: "2026-02-14T11:00:00.000Z",
          isAllDay: false,
        }),
      }),
      { params: { eventId: "evt-1" } }
    );

    expect(response.status).toBe(403);
    await expect(readJson(response)).resolves.toEqual({
      error: "insufficient-scope",
    });
  });

  test("PATCH maps Google 401 to reauthorization-required", async () => {
    googleCalendarAccessMock.getAuthorizedGoogleCalendarContext.mockResolvedValueOnce({
      ok: true,
      context: {
        accessToken: "token",
        calendarId: "primary",
        scope: "write-scope",
      },
    });
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ error: { message: "unauthorized" } }), { status: 401 })
    );

    const response = await PATCH(
      new NextRequest("http://localhost/api/calendar/events/evt-1", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          summary: "Updated title",
          start: "2026-02-14T10:00:00.000Z",
          end: "2026-02-14T11:00:00.000Z",
          isAllDay: false,
        }),
      }),
      { params: { eventId: "evt-1" } }
    );

    expect(response.status).toBe(401);
    await expect(readJson(response)).resolves.toEqual({
      error: "reauthorization-required",
    });
  });

  test("PATCH maps google 404 to event-not-found", async () => {
    googleCalendarAccessMock.getAuthorizedGoogleCalendarContext.mockResolvedValueOnce({
      ok: true,
      context: {
        accessToken: "token",
        calendarId: "primary",
        scope: "write-scope",
      },
    });
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ error: { message: "not found" } }), { status: 404 })
    );

    const response = await PATCH(
      new NextRequest("http://localhost/api/calendar/events/evt-1", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          summary: "Updated title",
          start: "2026-02-14T10:00:00.000Z",
          end: "2026-02-14T11:00:00.000Z",
          isAllDay: false,
        }),
      }),
      { params: { eventId: "evt-1" } }
    );

    expect(response.status).toBe(404);
    await expect(readJson(response)).resolves.toEqual({
      error: "event-not-found",
    });
  });

  test("PATCH returns normalized updated event payload", async () => {
    googleCalendarAccessMock.getAuthorizedGoogleCalendarContext.mockResolvedValueOnce({
      ok: true,
      context: {
        accessToken: "token",
        calendarId: "primary",
        scope: "write-scope",
      },
    });
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          id: "evt-1",
          summary: "  Updated title  ",
          start: { dateTime: "2026-02-14T10:00:00.000Z" },
          end: { dateTime: "2026-02-14T11:00:00.000Z" },
          htmlLink: "https://calendar.google.com/event?eid=evt-1",
        }),
        { status: 200 }
      )
    );

    const response = await PATCH(
      new NextRequest("http://localhost/api/calendar/events/evt-1", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          summary: "Updated title",
          start: "2026-02-14T10:00:00.000Z",
          end: "2026-02-14T11:00:00.000Z",
          isAllDay: false,
        }),
      }),
      { params: { eventId: "evt-1" } }
    );

    expect(response.status).toBe(200);
    await expect(readJson(response)).resolves.toEqual({
      event: {
        id: "evt-1",
        summary: "Updated title",
        start: "2026-02-14T10:00:00.000Z",
        end: "2026-02-14T11:00:00.000Z",
        isAllDay: false,
        location: null,
        description: null,
        htmlLink: "https://calendar.google.com/event?eid=evt-1",
        status: "confirmed",
      },
    });
  });

  test("PATCH maps malformed success payload to 502", async () => {
    googleCalendarAccessMock.getAuthorizedGoogleCalendarContext.mockResolvedValueOnce({
      ok: true,
      context: {
        accessToken: "token",
        calendarId: "primary",
        scope: "write-scope",
      },
    });
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ summary: "missing id/start" }), { status: 200 })
    );

    const response = await PATCH(
      new NextRequest("http://localhost/api/calendar/events/evt-1", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          summary: "Updated title",
          start: "2026-02-14T10:00:00.000Z",
          end: "2026-02-14T11:00:00.000Z",
          isAllDay: false,
        }),
      }),
      { params: { eventId: "evt-1" } }
    );

    expect(response.status).toBe(502);
    await expect(readJson(response)).resolves.toEqual({
      error: "calendar-update-failed",
    });
  });

  test("PATCH returns 500 when upstream request throws", async () => {
    googleCalendarAccessMock.getAuthorizedGoogleCalendarContext.mockResolvedValueOnce({
      ok: true,
      context: {
        accessToken: "token",
        calendarId: "primary",
        scope: "write-scope",
      },
    });
    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new Error("network-failure"));

    const response = await PATCH(
      new NextRequest("http://localhost/api/calendar/events/evt-1", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          summary: "Updated title",
          start: "2026-02-14T10:00:00.000Z",
          end: "2026-02-14T11:00:00.000Z",
          isAllDay: false,
        }),
      }),
      { params: { eventId: "evt-1" } }
    );

    expect(response.status).toBe(500);
    await expect(readJson(response)).resolves.toEqual({
      error: "calendar-internal-error",
    });
  });

  test("DELETE rejects when write scope is missing", async () => {
    googleCalendarAccessMock.getAuthorizedGoogleCalendarContext.mockResolvedValueOnce({
      ok: true,
      context: {
        accessToken: "token",
        calendarId: "primary",
        scope: "readonly",
      },
    });
    googleCalendarAccessMock.hasCalendarWriteScope.mockReturnValueOnce(false);

    const response = await DELETE(
      new NextRequest("http://localhost/api/calendar/events/evt-1", {
        method: "DELETE",
      }),
      { params: { eventId: "evt-1" } }
    );

    expect(response.status).toBe(403);
    await expect(readJson(response)).resolves.toEqual({
      error: "insufficient-scope",
    });
  });

  test("DELETE returns auth failure from calendar resolver", async () => {
    googleCalendarAccessMock.getAuthorizedGoogleCalendarContext.mockResolvedValueOnce({
      ok: false,
      failure: { status: 401, error: "not-connected" },
    });

    const response = await DELETE(
      new NextRequest("http://localhost/api/calendar/events/evt-1", {
        method: "DELETE",
      }),
      { params: { eventId: "evt-1" } }
    );

    expect(response.status).toBe(401);
    await expect(readJson(response)).resolves.toEqual({ error: "not-connected" });
  });

  test("DELETE maps Google insufficient permissions to 403", async () => {
    googleCalendarAccessMock.getAuthorizedGoogleCalendarContext.mockResolvedValueOnce({
      ok: true,
      context: {
        accessToken: "token",
        calendarId: "primary",
        scope: "write-scope",
      },
    });
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          error: {
            errors: [{ reason: "insufficientPermissions" }],
          },
        }),
        { status: 403 }
      )
    );

    const response = await DELETE(
      new NextRequest("http://localhost/api/calendar/events/evt-1", {
        method: "DELETE",
      }),
      { params: { eventId: "evt-1" } }
    );

    expect(response.status).toBe(403);
    await expect(readJson(response)).resolves.toEqual({
      error: "insufficient-scope",
    });
  });

  test("DELETE maps Google 401 to reauthorization-required", async () => {
    googleCalendarAccessMock.getAuthorizedGoogleCalendarContext.mockResolvedValueOnce({
      ok: true,
      context: {
        accessToken: "token",
        calendarId: "primary",
        scope: "write-scope",
      },
    });
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ error: { message: "unauthorized" } }), { status: 401 })
    );

    const response = await DELETE(
      new NextRequest("http://localhost/api/calendar/events/evt-1", {
        method: "DELETE",
      }),
      { params: { eventId: "evt-1" } }
    );

    expect(response.status).toBe(401);
    await expect(readJson(response)).resolves.toEqual({
      error: "reauthorization-required",
    });
  });

  test("DELETE maps google 404 to event-not-found", async () => {
    googleCalendarAccessMock.getAuthorizedGoogleCalendarContext.mockResolvedValueOnce({
      ok: true,
      context: {
        accessToken: "token",
        calendarId: "primary",
        scope: "write-scope",
      },
    });
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ error: { message: "not found" } }), { status: 404 })
    );

    const response = await DELETE(
      new NextRequest("http://localhost/api/calendar/events/evt-1", {
        method: "DELETE",
      }),
      { params: { eventId: "evt-1" } }
    );

    expect(response.status).toBe(404);
    await expect(readJson(response)).resolves.toEqual({
      error: "event-not-found",
    });
  });

  test("DELETE maps unknown Google API error to 502", async () => {
    googleCalendarAccessMock.getAuthorizedGoogleCalendarContext.mockResolvedValueOnce({
      ok: true,
      context: {
        accessToken: "token",
        calendarId: "primary",
        scope: "write-scope",
      },
    });
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ error: { message: "server error" } }), {
        status: 500,
      })
    );

    const response = await DELETE(
      new NextRequest("http://localhost/api/calendar/events/evt-1", {
        method: "DELETE",
      }),
      { params: { eventId: "evt-1" } }
    );

    expect(response.status).toBe(502);
    await expect(readJson(response)).resolves.toEqual({
      error: "calendar-delete-failed",
    });
  });

  test("DELETE returns ok when google delete succeeds", async () => {
    googleCalendarAccessMock.getAuthorizedGoogleCalendarContext.mockResolvedValueOnce({
      ok: true,
      context: {
        accessToken: "token",
        calendarId: "primary",
        scope: "write-scope",
      },
    });
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(null, { status: 204 }));

    const response = await DELETE(
      new NextRequest("http://localhost/api/calendar/events/evt-1", {
        method: "DELETE",
      }),
      { params: { eventId: "evt-1" } }
    );

    expect(response.status).toBe(200);
    await expect(readJson(response)).resolves.toEqual({ ok: true });
  });

  test("DELETE returns 500 when upstream request throws", async () => {
    googleCalendarAccessMock.getAuthorizedGoogleCalendarContext.mockResolvedValueOnce({
      ok: true,
      context: {
        accessToken: "token",
        calendarId: "primary",
        scope: "write-scope",
      },
    });
    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new Error("network-failure"));

    const response = await DELETE(
      new NextRequest("http://localhost/api/calendar/events/evt-1", {
        method: "DELETE",
      }),
      { params: { eventId: "evt-1" } }
    );

    expect(response.status).toBe(500);
    await expect(readJson(response)).resolves.toEqual({
      error: "calendar-internal-error",
    });
  });
});
