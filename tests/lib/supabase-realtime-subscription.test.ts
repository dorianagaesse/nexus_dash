// @vitest-environment jsdom

import { afterEach, describe, expect, test, vi } from "vitest";

import { MockBroadcastChannel } from "../helpers/mock-broadcast-channel";

const supabase = vi.hoisted(() => {
  const channels: Array<{
    topic: string;
    config: unknown;
    subscribe: ReturnType<typeof vi.fn>;
  }> = [];
  const disconnect = vi.fn();
  const setAuth = vi.fn().mockResolvedValue(undefined);
  const removeChannel = vi.fn().mockResolvedValue("ok");
  const createClient = vi.fn(() => ({
    channel: (topic: string, config: unknown) => {
      const channel = {
        topic,
        config,
        on: vi.fn().mockReturnThis(),
        subscribe: vi.fn((callback: (status: string) => void) => {
          callback("SUBSCRIBED");
          return channel;
        }),
      };
      channels.push(channel);
      return channel;
    },
    removeChannel,
    realtime: { disconnect, setAuth },
  }));
  return { channels, disconnect, setAuth, removeChannel, createClient };
});
vi.mock("@supabase/supabase-js", () => ({ createClient: supabase.createClient }));

function stubToken() {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      token: "jwt",
      expiresAt: new Date(Date.now() + 600_000).toISOString(),
      supabaseUrl: "https://preview-ref.supabase.co",
      supabasePublishableKey: "sb_publishable_preview",
    }),
  }));
}

async function flush() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

describe("private Broadcast subscriptions", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.resetModules();
    vi.useRealTimers();
    supabase.channels.length = 0;
    supabase.createClient.mockClear();
    supabase.disconnect.mockClear();
    supabase.setAuth.mockClear();
    supabase.removeChannel.mockClear();
    MockBroadcastChannel.reset();
  });

  test("multiplexes two scopes onto one client and reconciles on subscribe", async () => {
    vi.stubGlobal("BroadcastChannel", undefined);
    stubToken();
    const { startBroadcastSubscription } = await import("@/lib/realtime/supabase-realtime-client");
    const activity = vi.fn();
    const notification = vi.fn();
    const stopActivity = startBroadcastSubscription({
      scope: "project:p1", topic: "project:p1:activity", event: "project-activity",
      onMessage: activity, reconcile: async () => ({ version: "one" }),
      onFailure: vi.fn(),
    });
    const stopNotification = startBroadcastSubscription({
      scope: "notifications", topic: "user:u1:notifications", event: "notification-snapshot",
      onMessage: notification, reconcile: async () => ({ version: "two" }),
      onFailure: vi.fn(),
    });
    await vi.waitFor(() => expect(supabase.channels).toHaveLength(2));
    await flush();
    expect(supabase.createClient).toHaveBeenCalledOnce();
    expect(supabase.setAuth).toHaveBeenCalledOnce();
    expect(supabase.channels.map((channel) => channel.topic)).toEqual([
      "project:p1:activity", "user:u1:notifications",
    ]);
    expect(supabase.channels.every((channel) =>
      JSON.stringify(channel.config).includes('"private":true'))).toBe(true);
    expect(activity).toHaveBeenCalledWith({ version: "one" });
    expect(notification).toHaveBeenCalledWith({ version: "two" });
    stopActivity();
    expect(supabase.disconnect).not.toHaveBeenCalled();
    stopNotification();
    expect(supabase.disconnect).toHaveBeenCalledOnce();
  });

  test("a hidden leader releases its channel", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("BroadcastChannel", MockBroadcastChannel);
    stubToken();
    let hidden = false;
    vi.spyOn(document, "hidden", "get").mockImplementation(() => hidden);
    const { startBroadcastSubscription } = await import("@/lib/realtime/supabase-realtime-client");
    const stop = startBroadcastSubscription({
      scope: "notifications", topic: "user:u1:notifications", event: "notification-snapshot",
      onMessage: vi.fn(), reconcile: async () => ({ version: "one" }),
      onFailure: vi.fn(),
    });
    await vi.advanceTimersByTimeAsync(650);
    expect(supabase.channels).toHaveLength(1);
    hidden = true;
    document.dispatchEvent(new Event("visibilitychange"));
    expect(supabase.removeChannel).toHaveBeenCalledOnce();
    stop();
  });
});
