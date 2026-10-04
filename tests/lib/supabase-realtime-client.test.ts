// @vitest-environment jsdom

import { afterEach, describe, expect, test, vi } from "vitest";

describe("Realtime token cache", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  test("deduplicates concurrent mints and refreshes inside the expiry margin", async () => {
    const now = Date.now();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          token: "first", expiresAt: new Date(now + 120_000).toISOString(),
          supabaseUrl: "https://preview-ref.supabase.co",
          supabasePublishableKey: "sb_publishable_preview",
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          token: "second", expiresAt: new Date(now + 180_000).toISOString(),
          supabaseUrl: "https://preview-ref.supabase.co",
          supabasePublishableKey: "sb_publishable_preview",
        }),
      });
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(Date, "now").mockReturnValue(now);
    const { getRealtimeToken } = await import("@/lib/realtime/supabase-realtime-client");

    expect(await Promise.all([getRealtimeToken(), getRealtimeToken()])).toEqual([
      "first", "first",
    ]);
    expect(await getRealtimeToken()).toBe("first");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    vi.spyOn(Date, "now").mockReturnValue(now + 61_000);
    expect(await Promise.all([getRealtimeToken(), getRealtimeToken()])).toEqual([
      "second", "second",
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    vi.restoreAllMocks();
  });
});
