// @vitest-environment jsdom

import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const routerRefreshMock = vi.hoisted(() => vi.fn());
const fetchMock = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: routerRefreshMock,
  }),
}));

import { ProjectLiveRefresh } from "@/components/project-live-refresh";
import {
  acknowledgeProjectActivity,
  beginProjectActivityMutation,
} from "@/lib/project-activity-client";

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

function mockActivityVersion(version: string) {
  fetchMock.mockResolvedValueOnce({
    ok: true,
    json: vi.fn().mockResolvedValue({
      projectId: "project-1",
      version,
      serverTime: "2026-05-30T10:00:01.000Z",
    }),
  });
}

describe("ProjectLiveRefresh", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    document.body.innerHTML = "";
  });

  test("refreshes the dashboard when project activity advances", async () => {
    const { root } = createTestRenderer();
    mockActivityVersion("2026-05-30T10:01:00.000Z");

    await renderWithRoot(
      root,
      React.createElement(ProjectLiveRefresh, {
        projectId: "project-1",
        initialVersion: "2026-05-30T10:00:00.000Z",
        pollIntervalMs: 50,
      })
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(50);
    });

    expect(fetchMock).toHaveBeenCalledWith("/api/projects/project-1/activity", {
      cache: "no-store",
      signal: expect.any(AbortSignal),
    });
    expect(routerRefreshMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      root.unmount();
    });
  });

  test("defers refresh while local editing is active and exposes a refresh action", async () => {
    const { container, root } = createTestRenderer();
    const lock = document.createElement("div");
    lock.setAttribute("data-project-live-refresh-lock", "true");
    document.body.appendChild(lock);
    mockActivityVersion("2026-05-30T10:02:00.000Z");

    await renderWithRoot(
      root,
      React.createElement(ProjectLiveRefresh, {
        projectId: "project-1",
        initialVersion: "2026-05-30T10:00:00.000Z",
        pollIntervalMs: 50,
      })
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(50);
    });

    expect(routerRefreshMock).not.toHaveBeenCalled();
    expect(container.textContent).toContain("Project updates are ready.");

    const refreshButton = Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("Refresh")
    );
    await act(async () => {
      refreshButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(routerRefreshMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      root.unmount();
    });
  });

  test("acknowledges local activity so the user's own mutation does not prompt", async () => {
    const { container, root } = createTestRenderer();

    await renderWithRoot(
      root,
      React.createElement(ProjectLiveRefresh, {
        projectId: "project-1",
        initialVersion: "2026-05-30T10:00:00.000Z",
        pollIntervalMs: 50,
      })
    );

    await act(async () => {
      acknowledgeProjectActivity("project-1", "2026-05-30T10:02:00.000Z");
    });

    mockActivityVersion("2026-05-30T10:02:00.000Z");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(50);
    });

    expect(routerRefreshMock).not.toHaveBeenCalled();
    expect(container.textContent).not.toContain("Project updates are ready.");

    await act(async () => {
      root.unmount();
    });
  });

  test("does not refresh mid-flight while a local mutation is awaiting acknowledgement", async () => {
    const { container, root } = createTestRenderer();

    await renderWithRoot(
      root,
      React.createElement(ProjectLiveRefresh, {
        projectId: "project-1",
        initialVersion: "2026-05-30T10:00:00.000Z",
        pollIntervalMs: 50,
      })
    );

    let finishMutation: (() => void) | null = null;
    await act(async () => {
      finishMutation = beginProjectActivityMutation("project-1");
    });

    mockActivityVersion("2026-05-30T10:02:00.000Z");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(50);
    });

    expect(routerRefreshMock).not.toHaveBeenCalled();
    expect(container.textContent).not.toContain("Project updates are ready.");

    await act(async () => {
      acknowledgeProjectActivity("project-1", "2026-05-30T10:02:00.000Z");
      finishMutation?.();
      await vi.advanceTimersByTimeAsync(500);
    });

    expect(routerRefreshMock).not.toHaveBeenCalled();
    expect(container.textContent).not.toContain("Project updates are ready.");

    await act(async () => {
      root.unmount();
    });
  });

  test("automatically applies a pending remote update when the edit lock clears", async () => {
    const { container, root } = createTestRenderer();
    const lock = document.createElement("div");
    lock.setAttribute("data-project-live-refresh-lock", "true");
    document.body.appendChild(lock);
    mockActivityVersion("2026-05-30T10:03:00.000Z");

    await renderWithRoot(
      root,
      React.createElement(ProjectLiveRefresh, {
        projectId: "project-1",
        initialVersion: "2026-05-30T10:00:00.000Z",
        pollIntervalMs: 50,
      })
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(50);
    });

    expect(routerRefreshMock).not.toHaveBeenCalled();
    expect(container.textContent).toContain("Project updates are ready.");

    lock.remove();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

    expect(routerRefreshMock).toHaveBeenCalledTimes(1);
    expect(container.textContent).not.toContain("Project updates are ready.");

    await act(async () => {
      root.unmount();
    });
  });
});
