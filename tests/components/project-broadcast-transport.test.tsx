// @vitest-environment jsdom

import React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, test, vi } from "vitest";

const broadcast = vi.hoisted(() => ({ start: vi.fn() }));
vi.mock("@/lib/realtime/supabase-realtime-client", () => ({
  startBroadcastSubscription: broadcast.start,
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

import { ProjectLiveRefresh } from "@/components/project-live-refresh";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

class MockEventSource {
  static instances: MockEventSource[] = [];
  readonly url: string;
  private listeners = new Map<string, Set<EventListener>>();
  constructor(url: string) {
    this.url = url;
    MockEventSource.instances.push(this);
  }
  addEventListener(type: string, listener: EventListener) {
    const set = this.listeners.get(type) ?? new Set<EventListener>();
    set.add(listener);
    this.listeners.set(type, set);
  }
  removeEventListener(type: string, listener: EventListener) {
    this.listeners.get(type)?.delete(listener);
  }
  close() {}
  error() {
    for (const listener of this.listeners.get("error") ?? []) listener(new Event("error"));
  }
}

async function renderComponent() {
  const element = document.createElement("div");
  document.body.appendChild(element);
  const root = createRoot(element);
  await act(async () => {
    root.render(
      <ProjectLiveRefresh
        projectId="project-1"
        initialVersion="2026-10-04T00:00:00.000Z"
        broadcastEnabled
        streamEnabled
        pollIntervalMs={50}
      />
    );
  });
  return root;
}

function stubFetch() {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      projectId: "project-1",
      version: "2026-10-04T00:00:01.000Z",
      serverTime: "2026-10-04T00:00:01.000Z",
    }),
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("project Broadcast fallback", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    MockEventSource.instances = [];
    broadcast.start.mockReset();
    document.body.innerHTML = "";
  });

  test("uses Broadcast, then SSE, then polling after failures", async () => {
    vi.stubGlobal("EventSource", MockEventSource);
    vi.stubGlobal("BroadcastChannel", undefined);
    const fetchMock = stubFetch();
    broadcast.start.mockReturnValue(() => undefined);
    const root = await renderComponent();

    expect(broadcast.start).toHaveBeenCalledOnce();
    expect(broadcast.start.mock.calls[0][0]).toMatchObject({
      scope: "project:project-1",
      topic: "project:project-1:activity",
      event: "project-activity",
    });
    expect(MockEventSource.instances).toHaveLength(0);

    await act(async () => {
      broadcast.start.mock.calls[0][0].onFailure();
    });
    expect(MockEventSource.instances[0].url).toBe(
      "/api/projects/project-1/activity/stream"
    );

    await act(async () => {
      MockEventSource.instances[0].error();
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/projects/project-1/activity",
      expect.any(Object)
    );
    await act(async () => root.unmount());
  });

  test("reconciliation fetch marks itself for the telemetry exclusion", async () => {
    vi.stubGlobal("EventSource", MockEventSource);
    vi.stubGlobal("BroadcastChannel", undefined);
    const fetchMock = stubFetch();
    broadcast.start.mockReturnValue(() => undefined);
    const root = await renderComponent();

    const options = broadcast.start.mock.calls[0][0];
    fetchMock.mockClear();
    await act(async () => {
      await options.reconcile();
    });
    expect(fetchMock).toHaveBeenCalledWith("/api/projects/project-1/activity", {
      cache: "no-store",
      headers: { "x-realtime-reconcile": "1" },
    });
    await act(async () => root.unmount());
  });
});
