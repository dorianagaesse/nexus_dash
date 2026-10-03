import { afterEach, describe, expect, test, vi } from "vitest";

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
  });
}

function readStreamEnabled(element: Awaited<ReturnType<typeof renderShellElement>>) {
  return (element.props as { streamEnabled: boolean }).streamEnabled;
}

describe("authenticated app shell realtime transport wiring", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  test("enables the notification stream by default outside preview", async () => {
    vi.stubEnv("NODE_ENV", "production");

    expect(readStreamEnabled(await renderShellElement())).toBe(true);
  });

  test("disables the notification stream on Vercel Preview by default", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VERCEL_ENV", "preview");

    expect(readStreamEnabled(await renderShellElement())).toBe(false);
  });

  test("honors an explicit transport override", async () => {
    vi.stubEnv("REALTIME_TRANSPORT", "polling");

    expect(readStreamEnabled(await renderShellElement())).toBe(false);
  });
});
