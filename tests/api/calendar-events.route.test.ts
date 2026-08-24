import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { NextRequest } from "next/server";

const googleCalendarAccessMock = vi.hoisted(() => ({
  getAuthorizedGoogleCalendarContext: vi.fn(),
  authorizeCalendarSourceContext: vi.fn(),
  hasCalendarWriteScope: vi.fn(),
}));

const calendarConnectionServiceMock = vi.hoisted(() => ({
  getCalendarPreference: vi.fn(),
  getSelectedCalendarSourceContexts: vi.fn(),
}));

const projectAccessServiceMock = vi.hoisted(() => ({
  requireProjectRole: vi.fn(),
}));

vi.mock("@/lib/google-calendar-access", () => ({
  getAuthorizedGoogleCalendarContext:
    googleCalendarAccessMock.getAuthorizedGoogleCalendarContext,
  authorizeCalendarSourceContext:
    googleCalendarAccessMock.authorizeCalendarSourceContext,
  hasCalendarWriteScope: googleCalendarAccessMock.hasCalendarWriteScope,
}));

vi.mock("@/lib/services/calendar-connection-service", () => ({
  getCalendarPreference: calendarConnectionServiceMock.getCalendarPreference,
  getSelectedCalendarSourceContexts:
    calendarConnectionServiceMock.getSelectedCalendarSourceContexts,
}));

vi.mock("@/lib/services/project-access-service", () => ({
  requireProjectRole: projectAccessServiceMock.requireProjectRole,
}));

import { GET, POST } from "@/app/api/calendar/events/route";

const PROJECT_ID = "project-1";

async function readJson(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
}

describe("calendar events routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    googleCalendarAccessMock.hasCalendarWriteScope.mockReturnValue(true);
    googleCalendarAccessMock.authorizeCalendarSourceContext.mockImplementation(
      (...args: unknown[]) =>
        googleCalendarAccessMock.getAuthorizedGoogleCalendarContext(...args)
    );
    calendarConnectionServiceMock.getSelectedCalendarSourceContexts.mockResolvedValue([
      {
        connection: { id: "connection-1", scopes: "scope-a" },
        source: {
          id: "source-1",
          providerCalendarId: "primary",
          name: "Primary",
          color: null,
        },
        writable: true,
      },
    ]);
    calendarConnectionServiceMock.getCalendarPreference.mockResolvedValue({
      writeSourceId: "source-1",
    });
    projectAccessServiceMock.requireProjectRole.mockResolvedValue({
      ok: true,
      role: "owner",
    });
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
      new NextRequest(`http://localhost/api/calendar/events?projectId=${PROJECT_ID}`)
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
      new NextRequest(
        `http://localhost/api/calendar/events?range=current-week&projectId=${PROJECT_ID}`
      )
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
      new NextRequest(`http://localhost/api/calendar/events?projectId=${PROJECT_ID}`)
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
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: { message: "boom" } }), {
        status: 500,
      })
    );

    const response = await GET(
      new NextRequest(`http://localhost/api/calendar/events?projectId=${PROJECT_ID}`)
    );

    expect(response.status).toBe(502);
    await expect(readJson(response)).resolves.toEqual({
      connected: true,
      error: "calendar-fetch-failed",
    });
  });

  test("GET maps a single source network failure to a provider error", async () => {
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
      new NextRequest(`http://localhost/api/calendar/events?projectId=${PROJECT_ID}`)
    );

    expect(response.status).toBe(502);
    await expect(readJson(response)).resolves.toEqual({
      connected: true,
      error: "calendar-fetch-failed",
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
      new NextRequest(`http://localhost/api/calendar/events?days=3&projectId=${PROJECT_ID}`)
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

  test("GET returns successful sources with warnings when another source fails", async () => {
    calendarConnectionServiceMock.getSelectedCalendarSourceContexts.mockResolvedValueOnce([
      {
        connection: { id: "connection-1", scopes: "scope-a" },
        source: { id: "source-1", providerCalendarId: "one", name: "One", color: "#111111" },
        writable: true,
      },
      {
        connection: { id: "connection-2", scopes: "scope-a" },
        source: { id: "source-2", providerCalendarId: "two", name: "Two", color: "#222222" },
        writable: false,
      },
    ]);
    googleCalendarAccessMock.getAuthorizedGoogleCalendarContext
      .mockResolvedValueOnce({
        ok: true,
        context: {
          accessToken: "access-one",
          calendarId: "one",
          calendarSourceId: "source-1",
          connectionId: "connection-1",
          calendarName: "One",
          calendarColor: "#111111",
          scope: "scope-a",
          writable: true,
        },
      })
      .mockResolvedValueOnce({
        ok: true,
        context: {
          accessToken: "access-two",
          calendarId: "two",
          calendarSourceId: "source-2",
          connectionId: "connection-2",
          calendarName: "Two",
          calendarColor: "#222222",
          scope: "scope-a",
          writable: false,
        },
      });
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            items: [
              {
                id: "event-one",
                summary: "Available event",
                start: { dateTime: "2026-02-14T08:00:00.000Z" },
              },
            ],
          }),
          { status: 200 }
        )
      )
      .mockRejectedValue(new Error("network unavailable"));

    const response = await GET(
      new NextRequest(`http://localhost/api/calendar/events?projectId=${PROJECT_ID}`)
    );
    const payload = await readJson(response);
    expect(response.status).toBe(200);
    expect(payload.events).toEqual([
      expect.objectContaining({
        id: "event-one",
        calendarSourceId: "source-1",
        calendarName: "One",
        writable: true,
      }),
    ]);
    expect(payload.warnings).toEqual([
      {
        calendarSourceId: "source-2",
        connectionId: "connection-2",
        error: "calendar-fetch-failed",
      },
    ]);
    expect(payload.writeSourceId).toBe("source-1");
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
          projectId: PROJECT_ID,
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
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          projectId: PROJECT_ID,
        }),
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
          projectId: PROJECT_ID,
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
          projectId: PROJECT_ID,
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
          projectId: PROJECT_ID,
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
          projectId: PROJECT_ID,
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
          projectId: PROJECT_ID,
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
          projectId: PROJECT_ID,
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
