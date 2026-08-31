import { afterEach, describe, expect, test, vi } from "vitest";

import { googleCalendarProvider } from "@/lib/calendar-providers/google";

describe("Google Calendar provider adapter", () => {
  afterEach(() => vi.restoreAllMocks());

  test("uses Google sub as stable identity with a safe account label", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({ sub: "google-sub-1", email: "person@example.com" }),
        { status: 200 }
      )
    );
    await expect(googleCalendarProvider.identify("access-token")).resolves.toEqual({
      accountId: "google-sub-1",
      email: "person@example.com",
      label: "person@example.com",
    });
    expect(fetchSpy.mock.calls[0][1]).toMatchObject({
      headers: { Authorization: "Bearer access-token" },
      cache: "no-store",
    });
  });

  test("paginates CalendarList and preserves read-only metadata", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            items: [
              {
                id: "primary@example.com",
                summary: "Primary",
                accessRole: "owner",
                primary: true,
                backgroundColor: "#4285f4",
              },
            ],
            nextPageToken: "page-2",
          }),
          { status: 200 }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            items: [
              {
                id: "holidays@example.com",
                summary: "Holidays",
                accessRole: "reader",
                timeZone: "Europe/Paris",
              },
            ],
          }),
          { status: 200 }
        )
      );

    await expect(
      googleCalendarProvider.discoverCalendars("access-token")
    ).resolves.toEqual([
      expect.objectContaining({
        providerCalendarId: "primary@example.com",
        isPrimary: true,
        writable: true,
      }),
      expect.objectContaining({
        providerCalendarId: "holidays@example.com",
        accessRole: "reader",
        writable: false,
      }),
    ]);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(String(fetchSpy.mock.calls[1][0])).toContain("pageToken=page-2");
  });

  test("reports the safe provider status when CalendarList discovery fails", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ error: { message: "sensitive detail" } }), {
        status: 403,
      })
    );

    await expect(
      googleCalendarProvider.discoverCalendars("secret-access-token")
    ).rejects.toThrow("google-calendar-discovery-failed:403");
  });
});
