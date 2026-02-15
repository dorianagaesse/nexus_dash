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

import { GET, POST } from "@/app/api/calendar/events/route";

async function readJson(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
}

describe("calendar events routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    googleCalendarAccessMock.hasCalendarWriteScope.mockReturnValue(true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("GET returns auth failure payload from calendar context resolver", async () => {
    googleCalendarAccessMock.getAuthorizedGoogleCalendarContext.mockResolvedValueOnce({
      ok: false,
      failure: { status: 401, error: "not-connected" },
    });

    const response = await GET(
      new NextRequest("http://localhost/api/calendar/events")
    );

    expect(response.status).toBe(401);
    await expect(readJson(response)).resolves.toEqual({
      connected: false,
      error: "not-connected",
    });
  });

  test("GET maps insufficient permissions from Google API to 403", async () => {
    googleCalendarAccessMock.getAuthorizedGoogleCalendarContext.mockResolvedValueOnce({
      ok: true,
      context: {
        accessToken: "access-token",
        calendarId: "primary",
        scope: "scope-a",
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

    const response = await GET(
      new NextRequest("http://localhost/api/calendar/events?range=current-week")
    );

    expect(response.status).toBe(403);
    await expect(readJson(response)).resolves.toEqual({
      connected: true,
      error: "insufficient-scope",
    });
  });

  test("GET maps 401 from Google API to reauthorization-required", async () => {
    googleCalendarAccessMock.getAuthorizedGoogleCalendarContext.mockResolvedValueOnce({
      ok: true,
      context: {
        accessToken: "access-token",
        calendarId: "primary",
        scope: "scope-a",
      },
    });
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ error: { message: "unauthorized" } }), {
        status: 401,
      })
    );

    const response = await GET(
      new NextRequest("http://localhost/api/calendar/events")
    );

    expect(response.status).toBe(401);
    await expect(readJson(response)).resolves.toEqual({
      connected: false,
      error: "reauthorization-required",
    });
  });

  test("GET maps unknown Google API failures to 502", async () => {
    googleCalendarAccessMock.getAuthorizedGoogleCalendarContext.mockResolvedValueOnce({
      ok: true,
      context: {
        accessToken: "access-token",
        calendarId: "primary",
        scope: "scope-a",
      },
    });
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ error: { message: "boom" } }), {
        status: 500,
      })
    );

    const response = await GET(
      new NextRequest("http://localhost/api/calendar/events")
    );

    expect(response.status).toBe(502);
    await expect(readJson(response)).resolves.toEqual({
      connected: true,
      error: "calendar-fetch-failed",
    });
  });

  test("GET returns 500 when calendar fetch throws", async () => {
    googleCalendarAccessMock.getAuthorizedGoogleCalendarContext.mockResolvedValueOnce({
      ok: true,
      context: {
        accessToken: "access-token",
        calendarId: "primary",
        scope: "scope-a",
      },
    });
    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new Error("network-failure"));

    const response = await GET(
      new NextRequest("http://localhost/api/calendar/events")
    );

    expect(response.status).toBe(500);
    await expect(readJson(response)).resolves.toEqual({
      connected: false,
      error: "calendar-internal-error",
    });
  });

  test("GET returns normalized event payload", async () => {
    googleCalendarAccessMock.getAuthorizedGoogleCalendarContext.mockResolvedValueOnce({
      ok: true,
      context: {
        accessToken: "access-token",
        calendarId: "primary",
        scope: "scope-a",
      },
    });

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          items: [
            {
              id: "evt-1",
              summary: "  Kickoff  ",
              start: { dateTime: "2026-02-14T08:00:00.000Z" },
              end: { dateTime: "2026-02-14T09:00:00.000Z" },
              status: "confirmed",
              htmlLink: "https://calendar.google.com/event?eid=abc",
            },
            {
              summary: "Missing id should be filtered",
              start: { dateTime: "2026-02-15T08:00:00.000Z" },
            },
          ],
        }),
        { status: 200 }
      )
    );

    const response = await GET(
      new NextRequest("http://localhost/api/calendar/events?days=3")
    );
    const payload = await readJson(response);

    expect(response.status).toBe(200);
    expect(payload.connected).toBe(true);
    expect(payload.range).toBe("rolling-days");
    expect(payload.days).toBe(3);
    expect(Array.isArray(payload.events)).toBe(true);
    expect((payload.events as unknown[]).length).toBe(1);
    expect(payload.events).toEqual([
      {
        id: "evt-1",
        summary: "Kickoff",
        start: "2026-02-14T08:00:00.000Z",
        end: "2026-02-14T09:00:00.000Z",
        isAllDay: false,
        location: null,
        description: null,
        htmlLink: "https://calendar.google.com/event?eid=abc",
        status: "confirmed",
      },
    ]);
  });

  test("POST rejects writes when scope is read-only", async () => {
    googleCalendarAccessMock.getAuthorizedGoogleCalendarContext.mockResolvedValueOnce({
      ok: true,
      context: {
        accessToken: "access-token",
        calendarId: "primary",
        scope: "readonly-scope",
      },
    });
    googleCalendarAccessMock.hasCalendarWriteScope.mockReturnValueOnce(false);

    const response = await POST(
      new NextRequest("http://localhost/api/calendar/events", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          summary: "Kickoff",
          start: "2026-02-14T08:00:00.000Z",
          end: "2026-02-14T09:00:00.000Z",
          isAllDay: false,
        }),
      })
    );

    expect(response.status).toBe(403);
    await expect(readJson(response)).resolves.toEqual({
      error: "insufficient-scope",
    });
  });

  test("POST returns auth failure payload when calendar is not connected", async () => {
    googleCalendarAccessMock.getAuthorizedGoogleCalendarContext.mockResolvedValueOnce({
      ok: false,
      failure: { status: 401, error: "not-connected" },
    });

    const response = await POST(
      new NextRequest("http://localhost/api/calendar/events", {
        method: "POST",
      })
    );

    expect(response.status).toBe(401);
    await expect(readJson(response)).resolves.toEqual({ error: "not-connected" });
  });

  test("POST validates payload and returns 400 for invalid summary", async () => {
    googleCalendarAccessMock.getAuthorizedGoogleCalendarContext.mockResolvedValueOnce({
      ok: true,
      context: {
        accessToken: "access-token",
        calendarId: "primary",
        scope: "write-scope",
      },
    });

    const response = await POST(
      new NextRequest("http://localhost/api/calendar/events", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          summary: "   ",
          start: "2026-02-14T08:00:00.000Z",
          end: "2026-02-14T09:00:00.000Z",
          isAllDay: false,
        }),
      })
    );

    expect(response.status).toBe(400);
    await expect(readJson(response)).resolves.toEqual({
      error: "invalid-summary",
    });
  });

  test("POST maps 401 from Google API to reauthorization-required", async () => {
    googleCalendarAccessMock.getAuthorizedGoogleCalendarContext.mockResolvedValueOnce({
      ok: true,
      context: {
        accessToken: "access-token",
        calendarId: "primary",
        scope: "write-scope",
      },
    });

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ error: { message: "unauthorized" } }), {
        status: 401,
      })
    );

    const response = await POST(
      new NextRequest("http://localhost/api/calendar/events", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          summary: "Kickoff",
          start: "2026-02-14T08:00:00.000Z",
          end: "2026-02-14T09:00:00.000Z",
          isAllDay: false,
        }),
      })
    );

    expect(response.status).toBe(401);
    await expect(readJson(response)).resolves.toEqual({
      error: "reauthorization-required",
    });
  });

  test("POST maps insufficient permissions from Google API to 403", async () => {
    googleCalendarAccessMock.getAuthorizedGoogleCalendarContext.mockResolvedValueOnce({
      ok: true,
      context: {
        accessToken: "access-token",
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

    const response = await POST(
      new NextRequest("http://localhost/api/calendar/events", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          summary: "Kickoff",
          start: "2026-02-14T08:00:00.000Z",
          end: "2026-02-14T09:00:00.000Z",
          isAllDay: false,
        }),
      })
    );

    expect(response.status).toBe(403);
    await expect(readJson(response)).resolves.toEqual({
      error: "insufficient-scope",
    });
  });

  test("POST maps malformed success payload to 502", async () => {
    googleCalendarAccessMock.getAuthorizedGoogleCalendarContext.mockResolvedValueOnce({
      ok: true,
      context: {
        accessToken: "access-token",
        calendarId: "primary",
        scope: "write-scope",
      },
    });
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ summary: "missing id/start" }), { status: 200 })
    );

    const response = await POST(
      new NextRequest("http://localhost/api/calendar/events", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          summary: "Kickoff",
          start: "2026-02-14T08:00:00.000Z",
          end: "2026-02-14T09:00:00.000Z",
          isAllDay: false,
        }),
      })
    );

    expect(response.status).toBe(502);
    await expect(readJson(response)).resolves.toEqual({
      error: "calendar-create-failed",
    });
  });

  test("POST returns 500 when downstream request throws", async () => {
    googleCalendarAccessMock.getAuthorizedGoogleCalendarContext.mockResolvedValueOnce({
      ok: true,
      context: {
        accessToken: "access-token",
        calendarId: "primary",
        scope: "write-scope",
      },
    });
    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new Error("network-failure"));

    const response = await POST(
      new NextRequest("http://localhost/api/calendar/events", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          summary: "Kickoff",
          start: "2026-02-14T08:00:00.000Z",
          end: "2026-02-14T09:00:00.000Z",
          isAllDay: false,
        }),
      })
    );

    expect(response.status).toBe(500);
    await expect(readJson(response)).resolves.toEqual({
      error: "calendar-internal-error",
    });
  });

  test("POST creates all-day event and converts end date to exclusive day", async () => {
    googleCalendarAccessMock.getAuthorizedGoogleCalendarContext.mockResolvedValueOnce({
      ok: true,
      context: {
        accessToken: "access-token",
        calendarId: "team-calendar@example.com",
        scope: "write-scope",
      },
    });

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          id: "evt-created",
          summary: "Day off",
          start: { date: "2026-02-20" },
          end: { date: "2026-02-21" },
          status: "confirmed",
        }),
        { status: 200 }
      )
    );

    const response = await POST(
      new NextRequest("http://localhost/api/calendar/events", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          summary: "Day off",
          start: "2026-02-20",
          end: "2026-02-20",
          isAllDay: true,
        }),
      })
    );

    expect(response.status).toBe(201);
    await expect(readJson(response)).resolves.toEqual({
      event: {
        id: "evt-created",
        summary: "Day off",
        start: "2026-02-20",
        end: "2026-02-21",
        isAllDay: true,
        location: null,
        description: null,
        htmlLink: null,
        status: "confirmed",
      },
    });

    const requestInit = fetchSpy.mock.calls[0][1] as RequestInit;
    const sentBody = JSON.parse(String(requestInit.body)) as {
      start: { date: string };
      end: { date: string };
    };
    expect(sentBody.start.date).toBe("2026-02-20");

    const expectedExclusiveEnd = new Date("2026-02-20T00:00:00");
    expectedExclusiveEnd.setDate(expectedExclusiveEnd.getDate() + 1);
    expect(sentBody.end.date).toBe(expectedExclusiveEnd.toISOString().slice(0, 10));
  });
});
