import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("next/cache", () => ({
  unstable_noStore: vi.fn(),
}));

import { AuthenticatedAppShell } from "@/components/authenticated-app-shell";

const identity = {
  displayName: "Dorian",
  usernameTag: "dorian#1234",
  avatarSeed: "seed",
};

const notificationSnapshot = {
  version: "2026-09-20T08:00:00.000Z",
  unreadCount: 0,
  latestUnreadNotification: null,
  serverTime: "2026-09-20T08:00:00.000Z",
};

async function renderShellElement() {
  return AuthenticatedAppShell({
    children: null,
    initialIdentity: identity,
    initialNotificationSnapshot: notificationSnapshot,
    userId: "user-1",
  });
}

function readBroadcastEnabled(
  element: Awaited<ReturnType<typeof renderShellElement>>
) {
  return (element.props as { broadcastEnabled: boolean }).broadcastEnabled;
}

describe("authenticated app shell realtime transport wiring", () => {
  beforeEach(() => {
    // "Default" assertions mean REALTIME_TRANSPORT is unset; the ambient value
    // may be pinned by the environment (CI pins polling for production-like
    // builds).
    vi.stubEnv("REALTIME_TRANSPORT", "");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  test("enables Broadcast by default in production", async () => {
    vi.stubEnv("NODE_ENV", "production");

    expect(readBroadcastEnabled(await renderShellElement())).toBe(true);
  });

  test("keeps polling on Vercel Preview by default", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VERCEL_ENV", "preview");

    expect(readBroadcastEnabled(await renderShellElement())).toBe(false);
  });

  test("honors an explicit polling override in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("REALTIME_TRANSPORT", "polling");

    expect(readBroadcastEnabled(await renderShellElement())).toBe(false);
  });
});
