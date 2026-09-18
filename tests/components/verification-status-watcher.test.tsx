// @vitest-environment jsdom

import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const fetchMock = vi.hoisted(() => vi.fn());

import {
  VerificationStatusWatcher,
  verificationStatusWatcherInternals,
} from "@/app/verify-email/verification-status-watcher";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function createTestRenderer() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  return {
    container,
    root,
  };
}

async function renderWithRoot(root: Root, ui: React.ReactElement) {
  await act(async () => {
    root.render(ui);
  });
}

function mockStatusResponse(payload: { isVerified: boolean }) {
  fetchMock.mockResolvedValueOnce({
    ok: true,
    json: vi.fn().mockResolvedValue(payload),
  });
}

function mockUnverifiedResponse() {
  fetchMock.mockResolvedValue({
    ok: true,
    json: vi.fn().mockResolvedValue({ isVerified: false }),
  });
}

function mockErrorResponse(status: number, body: Record<string, unknown>) {
  fetchMock.mockResolvedValue({
    ok: false,
    status,
    json: vi.fn().mockResolvedValue(body),
  });
}

describe("VerificationStatusWatcher", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(verificationStatusWatcherInternals, "assignLocation").mockImplementation(
      () => {}
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    document.body.innerHTML = "";
  });

  test("polls the verification status and redirects once verified", async () => {
    const { container, root } = createTestRenderer();
    mockStatusResponse({ isVerified: false });
    mockStatusResponse({ isVerified: true });

    await renderWithRoot(
      root,
      React.createElement(VerificationStatusWatcher, {
        returnToPath: "/projects",
        pollIntervalMs: 50,
      })
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/auth/verify-email/status",
      expect.objectContaining({ cache: "no-store" })
    );
    expect(verificationStatusWatcherInternals.assignLocation).not.toHaveBeenCalled();
    expect(container.textContent).toContain(
      "This page will continue automatically once your email is verified."
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(50);
    });

    expect(verificationStatusWatcherInternals.assignLocation).toHaveBeenCalledWith(
      "/projects"
    );
    expect(container.textContent).toContain("Email verified. Redirecting...");

    await act(async () => {
      root.unmount();
    });
  });

  test("keeps polling without redirecting while the email stays unverified", async () => {
    const { root } = createTestRenderer();
    mockUnverifiedResponse();

    await renderWithRoot(
      root,
      React.createElement(VerificationStatusWatcher, {
        returnToPath: "/projects",
        pollIntervalMs: 50,
      })
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(130);
    });

    expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(verificationStatusWatcherInternals.assignLocation).not.toHaveBeenCalled();

    await act(async () => {
      root.unmount();
    });
  });

  test("keeps polling when a status check fails", async () => {
    const { root } = createTestRenderer();
    const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    fetchMock
      .mockRejectedValueOnce(new TypeError("network unavailable"))
      .mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({ isVerified: false }),
      });

    await renderWithRoot(
      root,
      React.createElement(VerificationStatusWatcher, {
        returnToPath: "/projects",
        pollIntervalMs: 50,
      })
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60);
    });

    expect(consoleWarnSpy).toHaveBeenCalled();
    expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(verificationStatusWatcherInternals.assignLocation).not.toHaveBeenCalled();

    await act(async () => {
      root.unmount();
    });
  });

  test("keeps polling when the status endpoint returns a server error", async () => {
    const { container, root } = createTestRenderer();
    mockErrorResponse(500, { error: "verification-status-unavailable" });

    await renderWithRoot(
      root,
      React.createElement(VerificationStatusWatcher, {
        returnToPath: "/projects",
        pollIntervalMs: 50,
      })
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(130);
    });

    expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(verificationStatusWatcherInternals.assignLocation).not.toHaveBeenCalled();
    expect(container.textContent).toContain(
      "This page will continue automatically once your email is verified."
    );

    await act(async () => {
      root.unmount();
    });
  });

  test("redirects to sign in and stops polling when the session is no longer valid", async () => {
    const { container, root } = createTestRenderer();
    mockErrorResponse(401, { error: "unauthorized" });

    await renderWithRoot(
      root,
      React.createElement(VerificationStatusWatcher, {
        returnToPath: "/projects",
        pollIntervalMs: 50,
      })
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(verificationStatusWatcherInternals.assignLocation).toHaveBeenCalledWith(
      "/?form=signin&returnTo=%2Fprojects"
    );
    expect(container.textContent).toContain(
      "Your session ended. Redirecting to sign in..."
    );

    fetchMock.mockClear();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });
    expect(fetchMock).not.toHaveBeenCalled();

    await act(async () => {
      root.unmount();
    });
  });

  test("redirects to sign in and stops polling when the session user no longer exists", async () => {
    const { root } = createTestRenderer();
    mockErrorResponse(404, { error: "user-not-found" });

    await renderWithRoot(
      root,
      React.createElement(VerificationStatusWatcher, {
        returnToPath: "/workspace?tab=inbox",
        pollIntervalMs: 50,
      })
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(verificationStatusWatcherInternals.assignLocation).toHaveBeenCalledWith(
      "/?form=signin&returnTo=%2Fworkspace%3Ftab%3Dinbox"
    );

    fetchMock.mockClear();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });
    expect(fetchMock).not.toHaveBeenCalled();

    await act(async () => {
      root.unmount();
    });
  });

  test("polls immediately when the window regains focus", async () => {
    const { root } = createTestRenderer();
    mockUnverifiedResponse();

    await renderWithRoot(
      root,
      React.createElement(VerificationStatusWatcher, {
        returnToPath: "/projects",
        pollIntervalMs: 50,
      })
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      window.dispatchEvent(new Event("focus"));
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);

    await act(async () => {
      root.unmount();
    });
  });

  test("stops polling after unmount", async () => {
    const { root } = createTestRenderer();
    mockUnverifiedResponse();

    await renderWithRoot(
      root,
      React.createElement(VerificationStatusWatcher, {
        returnToPath: "/projects",
        pollIntervalMs: 50,
      })
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    await act(async () => {
      root.unmount();
    });
    fetchMock.mockClear();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });

    expect(fetchMock).not.toHaveBeenCalled();
  });
});
