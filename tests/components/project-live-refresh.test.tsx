// @vitest-environment jsdom

import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const { routerRefreshMock, useRouterMock } = vi.hoisted(() => {
  const routerRefreshMock = vi.fn();
  const router = { refresh: routerRefreshMock };

  return {
    routerRefreshMock,
    useRouterMock: () => router,
  };
});
const fetchMock = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  useRouter: useRouterMock,
}));

import { ProjectLiveRefresh } from "@/components/project-live-refresh";
import {
  acknowledgeProjectActivity,
  beginProjectActivityMutation,
  PROJECT_ACTIVITY_REMOTE_EVENT,
} from "@/lib/project-activity-client";
import { MockBroadcastChannel } from "../helpers/mock-broadcast-channel";

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

// Claim jitter is consumed in mount order: the first tab waits the longest,
// so the second tab wins the election deterministically.
function stubJitterSequence(values: number[]) {
  let index = 0;
  vi.spyOn(Math, "random").mockImplementation(() =>
    index < values.length ? values[index++] : 0
  );
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

class MockEventSource {
  static instances: MockEventSource[] = [];

  readonly url: string;
  closed = false;
  private listeners = new Map<string, Set<EventListener>>();

  constructor(url: string) {
    this.url = url;
    MockEventSource.instances.push(this);
  }

  addEventListener(type: string, listener: EventListener) {
    const listeners = this.listeners.get(type) ?? new Set<EventListener>();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type: string, listener: EventListener) {
    this.listeners.get(type)?.delete(listener);
  }

  close() {
    this.closed = true;
  }

  emit(type: string, event: Event) {
    for (const listener of this.listeners.get(type) ?? []) {
      listener(event);
    }
  }

  open() {
    this.emit("open", new Event("open"));
  }

  error() {
    this.emit("error", new Event("error"));
  }

  projectActivity(payload: unknown) {
    this.emit(
      "project-activity",
      new MessageEvent("project-activity", {
        data: JSON.stringify(payload),
      }) as unknown as Event
    );
  }
}

describe("ProjectLiveRefresh", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    MockEventSource.instances = [];
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("BroadcastChannel", undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    document.body.innerHTML = "";
  });

  test("uses the project activity stream when EventSource is available", async () => {
    vi.stubGlobal("EventSource", MockEventSource);
    const { root } = createTestRenderer();

    await renderWithRoot(
      root,
      React.createElement(ProjectLiveRefresh, {
        projectId: "project-1",
        initialVersion: "2026-05-30T10:00:00.000Z",
        pollIntervalMs: 50,
      })
    );

    expect(MockEventSource.instances).toHaveLength(1);
    expect(MockEventSource.instances[0]?.url).toBe(
      "/api/projects/project-1/activity/stream"
    );

    await act(async () => {
      MockEventSource.instances[0]?.open();
      await vi.advanceTimersByTimeAsync(100);
    });

    expect(fetchMock).not.toHaveBeenCalled();

    await act(async () => {
      MockEventSource.instances[0]?.projectActivity({
        projectId: "project-1",
        version: "2026-05-30T10:01:00.000Z",
        serverTime: "2026-05-30T10:01:00.000Z",
      });
    });

    expect(routerRefreshMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      root.unmount();
    });

    expect(MockEventSource.instances[0]?.closed).toBe(true);
  });

  test("dispatches typed stream activity without refreshing when a listener handles it", async () => {
    vi.stubGlobal("EventSource", MockEventSource);
    const { root } = createTestRenderer();
    const remoteActivityHandler = vi.fn((event: Event) => {
      const detail = (
        event as CustomEvent<{
          markHandled: () => void;
        }>
      ).detail;
      detail.markHandled();
    });
    window.addEventListener(PROJECT_ACTIVITY_REMOTE_EVENT, remoteActivityHandler);

    await renderWithRoot(
      root,
      React.createElement(ProjectLiveRefresh, {
        projectId: "project-1",
        initialVersion: "2026-05-30T10:00:00.000Z",
        pollIntervalMs: 50,
      })
    );

    await act(async () => {
      MockEventSource.instances[0]?.open();
      MockEventSource.instances[0]?.projectActivity({
        eventId: "event-1",
        projectId: "project-1",
        version: "2026-05-30T10:01:00.000Z",
        serverTime: "2026-05-30T10:01:00.000Z",
        actorUserId: "user-2",
        domain: "task",
        action: "created",
        entityId: "task-1",
        payload: {
          task: {
            id: "task-1",
            title: "Remote task",
          },
        },
      });
    });

    expect(remoteActivityHandler).toHaveBeenCalledTimes(1);
    expect(routerRefreshMock).not.toHaveBeenCalled();

    window.removeEventListener(PROJECT_ACTIVITY_REMOTE_EVENT, remoteActivityHandler);
    await act(async () => {
      root.unmount();
    });
  });

  test("falls back to adaptive polling when the activity stream fails before opening", async () => {
    vi.stubGlobal("EventSource", MockEventSource);
    const { root } = createTestRenderer();

    await renderWithRoot(
      root,
      React.createElement(ProjectLiveRefresh, {
        projectId: "project-1",
        initialVersion: "2026-05-30T10:00:00.000Z",
        pollIntervalMs: 50,
      })
    );

    mockActivityVersion("2026-05-30T10:01:00.000Z");

    await act(async () => {
      MockEventSource.instances[0]?.error();
      await vi.advanceTimersByTimeAsync(0);
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(50);
    });

    expect(MockEventSource.instances[0]?.closed).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(routerRefreshMock).toHaveBeenCalled();

    await act(async () => {
      root.unmount();
    });
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

  test("uses the active-page default cadence for remote activity checks", async () => {
    const { root } = createTestRenderer();
    mockActivityVersion("2026-05-30T10:01:00.000Z");

    await renderWithRoot(
      root,
      React.createElement(ProjectLiveRefresh, {
        projectId: "project-1",
        initialVersion: "2026-05-30T10:00:00.000Z",
      })
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(9999);
    });

    expect(fetchMock).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(routerRefreshMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      root.unmount();
    });
  });

  test("checks project activity immediately when the window regains focus", async () => {
    const { root } = createTestRenderer();
    mockActivityVersion("2026-05-30T10:01:00.000Z");

    await renderWithRoot(
      root,
      React.createElement(ProjectLiveRefresh, {
        projectId: "project-1",
        initialVersion: "2026-05-30T10:00:00.000Z",
        pollIntervalMs: 5000,
        streamEnabled: false,
      })
    );

    await act(async () => {
      window.dispatchEvent(new Event("focus"));
      await vi.advanceTimersByTimeAsync(0);
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

  test("pauses activity checks while the document is hidden and resumes on visibility", async () => {
    const hiddenSpy = vi.spyOn(document, "hidden", "get").mockReturnValue(true);
    const { root } = createTestRenderer();
    mockActivityVersion("2026-05-30T10:01:00.000Z");

    await renderWithRoot(
      root,
      React.createElement(ProjectLiveRefresh, {
        projectId: "project-1",
        initialVersion: "2026-05-30T10:00:00.000Z",
        pollIntervalMs: 50,
        streamEnabled: false,
      })
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });

    expect(fetchMock).not.toHaveBeenCalled();

    hiddenSpy.mockReturnValue(false);

    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);

    mockActivityVersion("2026-05-30T10:03:00.000Z");
    hiddenSpy.mockReturnValue(true);

    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
      await vi.advanceTimersByTimeAsync(5000);
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);

    hiddenSpy.mockReturnValue(false);

    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);

    await act(async () => {
      root.unmount();
    });
  });

  test("backs off repeated activity-check failures instead of retrying tightly", async () => {
    const { root } = createTestRenderer();
    fetchMock.mockResolvedValue({ ok: false, json: vi.fn() });

    await renderWithRoot(
      root,
      React.createElement(ProjectLiveRefresh, {
        projectId: "project-1",
        initialVersion: "2026-05-30T10:00:00.000Z",
        pollIntervalMs: 50,
        streamEnabled: false,
      })
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(50);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(99);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);

    mockActivityVersion("2026-05-30T10:01:00.000Z");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
    });
    expect(fetchMock).toHaveBeenCalledTimes(4);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(50);
    });
    expect(fetchMock).toHaveBeenCalledTimes(5);

    await act(async () => {
      root.unmount();
    });
  });

  test("defers refresh invisibly while local editing is active", async () => {
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
    expect(container.textContent).not.toContain("Project updates are ready.");
    expect(container.querySelector("button")).toBeNull();

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
    expect(container.textContent).not.toContain("Project updates are ready.");

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

  test("escalates the failure backoff when the payload cannot be parsed", async () => {
    const { root } = createTestRenderer();
    fetchMock.mockResolvedValue({
      ok: true,
      json: vi.fn().mockRejectedValue(new Error("invalid payload")),
    });

    await renderWithRoot(
      root,
      React.createElement(ProjectLiveRefresh, {
        projectId: "project-1",
        initialVersion: "2026-05-30T10:00:00.000Z",
        pollIntervalMs: 50,
        streamEnabled: false,
      })
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(50);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
    });
    expect(fetchMock).toHaveBeenCalledTimes(4);

    await act(async () => {
      root.unmount();
    });
  });

  test("does not fire the queued immediate check while the document is hidden", async () => {
    const hiddenSpy = vi.spyOn(document, "hidden", "get").mockReturnValue(false);
    const { root } = createTestRenderer();

    let resolveFetch: ((value: unknown) => void) | null = null;
    fetchMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve;
        })
    );

    await renderWithRoot(
      root,
      React.createElement(ProjectLiveRefresh, {
        projectId: "project-1",
        initialVersion: "2026-05-30T10:00:00.000Z",
        pollIntervalMs: 50,
        streamEnabled: false,
      })
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(50);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      window.dispatchEvent(new Event("focus"));
    });

    hiddenSpy.mockReturnValue(true);
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });

    await act(async () => {
      resolveFetch?.({
        ok: true,
        json: vi.fn().mockResolvedValue({
          projectId: "project-1",
          version: "2026-05-30T10:01:00.000Z",
          serverTime: "2026-05-30T10:01:00.000Z",
        }),
      });
      await vi.advanceTimersByTimeAsync(5000);
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);

    hiddenSpy.mockReturnValue(false);
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);

    await act(async () => {
      root.unmount();
    });
  });

  test("coordinates activity polling across tabs so only one tab checks", async () => {
    vi.stubGlobal("BroadcastChannel", MockBroadcastChannel);
    MockBroadcastChannel.reset();
    stubJitterSequence([1, 0]);

    const tabA = createTestRenderer();
    const tabB = createTestRenderer();
    fetchMock.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        projectId: "project-1",
        version: "2026-05-30T10:01:00.000Z",
        serverTime: "2026-05-30T10:00:01.000Z",
      }),
    });

    await renderWithRoot(
      tabA.root,
      React.createElement(ProjectLiveRefresh, {
        projectId: "project-1",
        initialVersion: "2026-05-30T10:00:00.000Z",
        pollIntervalMs: 50,
        streamEnabled: false,
      })
    );
    await renderWithRoot(
      tabB.root,
      React.createElement(ProjectLiveRefresh, {
        projectId: "project-1",
        initialVersion: "2026-05-30T10:00:00.000Z",
        pollIntervalMs: 50,
        streamEnabled: false,
      })
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });

    const settledCalls = fetchMock.mock.calls.length;
    expect(settledCalls).toBeGreaterThan(0);
    // once per tab for the first shared version: the leader applies it locally,
    // the follower applies the broadcast
    expect(routerRefreshMock).toHaveBeenCalledTimes(2);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

    const coordinatedCalls = fetchMock.mock.calls.length - settledCalls;
    expect(coordinatedCalls).toBeGreaterThanOrEqual(9);
    expect(coordinatedCalls).toBeLessThanOrEqual(11);

    await act(async () => {
      tabB.root.unmount();
    });
    await act(async () => {
      tabA.root.unmount();
    });
  });

  test("keeps checking project activity when the current leader tab closes", async () => {
    vi.stubGlobal("BroadcastChannel", MockBroadcastChannel);
    MockBroadcastChannel.reset();
    stubJitterSequence([1, 0, 0]);

    const tabA = createTestRenderer();
    const tabB = createTestRenderer();
    fetchMock.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        projectId: "project-1",
        version: "2026-05-30T10:01:00.000Z",
        serverTime: "2026-05-30T10:00:01.000Z",
      }),
    });

    await renderWithRoot(
      tabA.root,
      React.createElement(ProjectLiveRefresh, {
        projectId: "project-1",
        initialVersion: "2026-05-30T10:00:00.000Z",
        pollIntervalMs: 50,
        streamEnabled: false,
      })
    );
    await renderWithRoot(
      tabB.root,
      React.createElement(ProjectLiveRefresh, {
        projectId: "project-1",
        initialVersion: "2026-05-30T10:00:00.000Z",
        pollIntervalMs: 50,
        streamEnabled: false,
      })
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });

    await act(async () => {
      tabB.root.unmount();
    });

    const beforeTakeover = fetchMock.mock.calls.length;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });

    const takeoverCalls = fetchMock.mock.calls.length - beforeTakeover;
    expect(takeoverCalls).toBeGreaterThanOrEqual(15);

    await act(async () => {
      tabA.root.unmount();
    });
  });

  test("pauses all tabs while hidden and resumes a single checker", async () => {
    vi.stubGlobal("BroadcastChannel", MockBroadcastChannel);
    MockBroadcastChannel.reset();
    stubJitterSequence([1, 0, 1, 0]);

    const tabA = createTestRenderer();
    const tabB = createTestRenderer();
    fetchMock.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        projectId: "project-1",
        version: "2026-05-30T10:01:00.000Z",
        serverTime: "2026-05-30T10:00:01.000Z",
      }),
    });

    await renderWithRoot(
      tabA.root,
      React.createElement(ProjectLiveRefresh, {
        projectId: "project-1",
        initialVersion: "2026-05-30T10:00:00.000Z",
        pollIntervalMs: 50,
        streamEnabled: false,
      })
    );
    await renderWithRoot(
      tabB.root,
      React.createElement(ProjectLiveRefresh, {
        projectId: "project-1",
        initialVersion: "2026-05-30T10:00:00.000Z",
        pollIntervalMs: 50,
        streamEnabled: false,
      })
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });

    const hiddenSpy = vi.spyOn(document, "hidden", "get").mockReturnValue(true);
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
      await vi.advanceTimersByTimeAsync(3000);
    });

    const pollsWhileHidden = fetchMock.mock.calls.length;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(fetchMock.mock.calls.length).toBe(pollsWhileHidden);

    hiddenSpy.mockReturnValue(false);
    const beforeResume = fetchMock.mock.calls.length;
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
      await vi.advanceTimersByTimeAsync(2000);
    });

    const resumedCalls = fetchMock.mock.calls.length - beforeResume;
    expect(resumedCalls).toBeGreaterThanOrEqual(25);
    expect(resumedCalls).toBeLessThanOrEqual(45);

    await act(async () => {
      tabB.root.unmount();
    });
    await act(async () => {
      tabA.root.unmount();
    });
  });

  test("stays silent on the bus when mounted in an already-hidden document", async () => {
    vi.stubGlobal("BroadcastChannel", MockBroadcastChannel);
    MockBroadcastChannel.reset();
    const observer = new MockBroadcastChannel(
      "nexusdash-tab-leader:project:project-1"
    );
    const heardKinds: string[] = [];
    observer.addEventListener("message", (event) => {
      heardKinds.push(
        ((event.data as { kind?: string }).kind ?? "unknown") as string
      );
    });

    const hiddenSpy = vi.spyOn(document, "hidden", "get").mockReturnValue(true);
    const { root } = createTestRenderer();
    fetchMock.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        projectId: "project-1",
        version: "2026-05-30T10:01:00.000Z",
        serverTime: "2026-05-30T10:00:01.000Z",
      }),
    });

    await renderWithRoot(
      root,
      React.createElement(ProjectLiveRefresh, {
        projectId: "project-1",
        initialVersion: "2026-05-30T10:00:00.000Z",
        pollIntervalMs: 50,
        streamEnabled: false,
      })
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(heardKinds).toEqual([]);

    await act(async () => {
      root.unmount();
    });
  });
});
