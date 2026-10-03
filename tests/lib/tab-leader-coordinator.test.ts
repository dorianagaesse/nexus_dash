import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import {
  createTabLeaderCoordinator,
  TAB_LEADER_HEARTBEAT_INTERVAL_MS,
  TAB_LEADER_LEASE_TTL_MS,
  type TabLeaderCoordinator,
  type TabLeaderCoordinatorOptions,
} from "@/lib/tab-leader-coordinator";
import { MockBroadcastChannel } from "../helpers/mock-broadcast-channel";

const SCOPE = "test-scope";
const CHANNEL_NAME = `nexusdash-tab-leader:${SCOPE}`;
const CLAIM_JITTER_MS = 300;
const SLOW_CLAIM_JITTER_MS = 400;

type Payload = { version: string };

interface TestTab {
  coordinator: TabLeaderCoordinator<Payload>;
  onRoleChange: ReturnType<typeof vi.fn>;
  onData: ReturnType<typeof vi.fn>;
  onRefreshRequest: ReturnType<typeof vi.fn>;
}

function createTab(
  tabId: string,
  overrides: Partial<TabLeaderCoordinatorOptions<Payload>> = {}
): TestTab {
  const onRoleChange = vi.fn();
  const onData = vi.fn();
  const onRefreshRequest = vi.fn();

  const coordinator = createTabLeaderCoordinator<Payload>({
    scope: SCOPE,
    tabId,
    claimJitterMs: () => CLAIM_JITTER_MS,
    createChannel: (name) => new MockBroadcastChannel(name),
    onRoleChange,
    onData,
    onRefreshRequest,
    ...overrides,
  });

  return { coordinator, onRoleChange, onData, onRefreshRequest };
}

async function advance(ms: number) {
  await vi.advanceTimersByTimeAsync(ms);
}

function injectMessage(message: unknown) {
  const injector = new MockBroadcastChannel(CHANNEL_NAME);
  injector.postMessage(message);
}

describe("createTabLeaderCoordinator", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    MockBroadcastChannel.reset();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  test("leads immediately without role churn when no channel is available", async () => {
    const tab = createTab("solo", { createChannel: () => null });

    tab.coordinator.start();
    tab.coordinator.start();

    expect(tab.coordinator.getRole()).toBe("leader");
    expect(tab.onRoleChange).toHaveBeenCalledTimes(1);
    expect(tab.onRoleChange).toHaveBeenLastCalledWith(true);
    expect(tab.onRefreshRequest).not.toHaveBeenCalled();

    await advance(TAB_LEADER_HEARTBEAT_INTERVAL_MS * 2);
    expect(tab.onRoleChange).toHaveBeenCalledTimes(1);

    tab.coordinator.publish({ version: "v2" });
    expect(tab.onData).not.toHaveBeenCalled();

    tab.coordinator.requestRefresh();
    expect(tab.onRefreshRequest).toHaveBeenCalledTimes(1);

    tab.coordinator.stop();
  });

  test("claims leadership after the bounded jitter when no leader answers", async () => {
    const tab = createTab("solo");

    tab.coordinator.start();
    expect(tab.coordinator.getRole()).toBe("follower");
    expect(tab.onRoleChange).toHaveBeenCalledTimes(1);
    expect(tab.onRoleChange).toHaveBeenLastCalledWith(false);

    await advance(CLAIM_JITTER_MS - 1);
    expect(tab.coordinator.getRole()).toBe("follower");

    await advance(1);
    expect(tab.coordinator.getRole()).toBe("leader");
    expect(tab.onRoleChange).toHaveBeenLastCalledWith(true);
    expect(tab.onRefreshRequest).toHaveBeenCalledTimes(1);

    tab.coordinator.stop();
  });

  test("elects one leader across two tabs and shares data through it", async () => {
    const first = createTab("aaa");
    const second = createTab("bbb", {
      claimJitterMs: () => SLOW_CLAIM_JITTER_MS,
    });

    first.coordinator.start();
    second.coordinator.start();

    await advance(CLAIM_JITTER_MS + 50);
    expect(first.coordinator.getRole()).toBe("leader");
    expect(second.coordinator.getRole()).toBe("follower");

    await advance(SLOW_CLAIM_JITTER_MS + 50);
    expect(first.coordinator.getRole()).toBe("leader");
    expect(second.coordinator.getRole()).toBe("follower");

    await advance(TAB_LEADER_LEASE_TTL_MS * 2);
    expect(first.coordinator.getRole()).toBe("leader");
    expect(second.coordinator.getRole()).toBe("follower");

    first.coordinator.publish({ version: "v2" });
    await advance(0);
    expect(second.onData).toHaveBeenCalledTimes(1);
    expect(second.onData).toHaveBeenLastCalledWith({ version: "v2" });

    const refreshesBefore = first.onRefreshRequest.mock.calls.length;
    second.coordinator.requestRefresh();
    await advance(0);
    expect(first.onRefreshRequest.mock.calls.length).toBe(refreshesBefore + 1);

    first.coordinator.stop();
    second.coordinator.stop();
  });

  test("hands leadership to the remaining tab when the leader stops", async () => {
    const first = createTab("aaa");
    const second = createTab("bbb", {
      claimJitterMs: () => SLOW_CLAIM_JITTER_MS,
    });

    first.coordinator.start();
    second.coordinator.start();
    await advance(CLAIM_JITTER_MS + 50);
    expect(first.coordinator.getRole()).toBe("leader");

    first.coordinator.stop();
    expect(MockBroadcastChannel.instances[0]?.closed).toBe(true);

    await advance(SLOW_CLAIM_JITTER_MS + 50);
    expect(second.coordinator.getRole()).toBe("leader");
    expect(second.onRoleChange).toHaveBeenLastCalledWith(true);
    expect(second.onRefreshRequest).toHaveBeenCalledTimes(1);

    second.coordinator.stop();
  });

  test("re-elects when a silent leader's lease expires", async () => {
    const first = createTab("aaa");
    const second = createTab("bbb", {
      claimJitterMs: () => SLOW_CLAIM_JITTER_MS,
    });

    first.coordinator.start();
    second.coordinator.start();
    await advance(CLAIM_JITTER_MS + 50);
    expect(first.coordinator.getRole()).toBe("leader");
    expect(second.coordinator.getRole()).toBe("follower");

    MockBroadcastChannel.silenceTab("aaa");

    await advance(
      TAB_LEADER_LEASE_TTL_MS + SLOW_CLAIM_JITTER_MS + TAB_LEADER_HEARTBEAT_INTERVAL_MS
    );

    expect(second.coordinator.getRole()).toBe("leader");
    expect(first.coordinator.getRole()).toBe("follower");
    expect(first.onRoleChange).toHaveBeenLastCalledWith(false);

    second.coordinator.stop();
    first.coordinator.stop();
  });

  test("suspends on hide and resumes as follower on visible", async () => {
    const first = createTab("aaa");
    const second = createTab("bbb", {
      claimJitterMs: () => SLOW_CLAIM_JITTER_MS,
    });

    first.coordinator.start();
    second.coordinator.start();
    await advance(CLAIM_JITTER_MS + 50);
    expect(first.coordinator.getRole()).toBe("leader");

    first.coordinator.setVisible(false);
    expect(first.coordinator.getRole()).toBe("follower");
    expect(first.onRoleChange).toHaveBeenLastCalledWith(false);

    await advance(SLOW_CLAIM_JITTER_MS + 50);
    expect(second.coordinator.getRole()).toBe("leader");

    second.coordinator.publish({ version: "v3" });
    await advance(0);
    expect(first.onData).not.toHaveBeenCalled();

    first.coordinator.setVisible(true);
    await advance(CLAIM_JITTER_MS + 50);
    expect(first.coordinator.getRole()).toBe("follower");
    expect(second.coordinator.getRole()).toBe("leader");

    second.coordinator.publish({ version: "v4" });
    await advance(0);
    expect(first.onData).toHaveBeenCalledTimes(1);
    expect(first.onData).toHaveBeenLastCalledWith({ version: "v4" });

    first.coordinator.stop();
    second.coordinator.stop();
  });

  test("a hidden tab starting up leaves an existing leader's schedule untouched", async () => {
    const leader = createTab("aaa");
    leader.coordinator.start();
    await advance(CLAIM_JITTER_MS + 50);
    expect(leader.coordinator.getRole()).toBe("leader");
    expect(leader.onRefreshRequest).toHaveBeenCalledTimes(1);

    const observer = new MockBroadcastChannel(CHANNEL_NAME);
    const heardKinds: string[] = [];
    observer.addEventListener("message", (event) => {
      heardKinds.push(
        ((event.data as { kind?: string }).kind ?? "unknown") as string
      );
    });

    const hiddenTab = createTab("bbb", { initialVisible: false });
    hiddenTab.coordinator.start();
    await advance(CLAIM_JITTER_MS + 50);

    expect(hiddenTab.coordinator.getRole()).toBe("follower");
    expect(hiddenTab.onRefreshRequest).not.toHaveBeenCalled();
    expect(heardKinds).toEqual([]);
    expect(leader.onRefreshRequest).toHaveBeenCalledTimes(1);

    observer.close();
    leader.coordinator.stop();
    hiddenTab.coordinator.stop();
  });

  test("ignores malformed, foreign, and stale messages", async () => {
    const tab = createTab("mmm");

    tab.coordinator.start();
    await advance(CLAIM_JITTER_MS + 50);
    expect(tab.coordinator.getRole()).toBe("leader");

    injectMessage(null);
    injectMessage("heartbeat");
    injectMessage({ kind: "unknown", scope: SCOPE, tabId: "aaa" });
    injectMessage({ kind: "heartbeat", scope: "other-scope", tabId: "aaa", term: 5 });
    injectMessage({ kind: "heartbeat", scope: SCOPE, tabId: "mmm", term: 5 });
    injectMessage({ kind: "heartbeat", scope: SCOPE, tabId: "aaa" });
    injectMessage({ kind: "heartbeat", scope: SCOPE, tabId: "zzz", term: Number.NaN });
    injectMessage({
      kind: "heartbeat",
      scope: SCOPE,
      tabId: "zzz",
      term: Number.POSITIVE_INFINITY,
    });
    injectMessage({ kind: "heartbeat", scope: SCOPE, tabId: "zzz", term: 1.5 });
    injectMessage({ kind: "data", scope: SCOPE, tabId: "aaa", term: 0, payload: { version: "stale" } });
    await advance(0);

    expect(tab.coordinator.getRole()).toBe("leader");
    expect(tab.onData).not.toHaveBeenCalled();

    tab.coordinator.stop();
  });

  test("breaks same-term leadership ties in favor of the higher tab id", async () => {
    const tab = createTab("mmm");

    tab.coordinator.start();
    await advance(CLAIM_JITTER_MS + 50);
    expect(tab.coordinator.getRole()).toBe("leader");

    injectMessage({ kind: "heartbeat", scope: SCOPE, tabId: "aaa", term: 1 });
    await advance(0);
    expect(tab.coordinator.getRole()).toBe("leader");

    injectMessage({ kind: "heartbeat", scope: SCOPE, tabId: "zzz", term: 1 });
    await advance(0);
    expect(tab.coordinator.getRole()).toBe("follower");
    expect(tab.onRoleChange).toHaveBeenLastCalledWith(false);

    tab.coordinator.stop();
  });

  test("steps down when data arrives from a higher elected term", async () => {
    const tab = createTab("mmm");

    tab.coordinator.start();
    await advance(CLAIM_JITTER_MS + 50);
    expect(tab.coordinator.getRole()).toBe("leader");

    injectMessage({
      kind: "data",
      scope: SCOPE,
      tabId: "zzz",
      term: 9,
      payload: { version: "v9" },
    });
    await advance(0);

    expect(tab.onData).toHaveBeenCalledTimes(1);
    expect(tab.onData).toHaveBeenLastCalledWith({ version: "v9" });
    expect(tab.coordinator.getRole()).toBe("follower");

    tab.coordinator.stop();
  });

  test("stops posting and detaches on stop", async () => {
    const first = createTab("aaa");
    const second = createTab("bbb", {
      claimJitterMs: () => SLOW_CLAIM_JITTER_MS,
    });

    first.coordinator.start();
    second.coordinator.start();
    await advance(CLAIM_JITTER_MS + 50);
    expect(first.coordinator.getRole()).toBe("leader");

    first.coordinator.stop();
    first.coordinator.stop();

    await advance(SLOW_CLAIM_JITTER_MS + 50);
    first.coordinator.publish({ version: "after-stop" });
    first.coordinator.setVisible(false);
    await advance(TAB_LEADER_HEARTBEAT_INTERVAL_MS);

    expect(second.onData).not.toHaveBeenCalled();

    second.coordinator.stop();
  });
});
