export const TAB_LEADER_HEARTBEAT_INTERVAL_MS = 4_000;
export const TAB_LEADER_LEASE_TTL_MS = 12_000;
export const TAB_LEADER_MIN_CLAIM_JITTER_MS = 200;
export const TAB_LEADER_MAX_CLAIM_JITTER_MS = 600;

export interface TabLeaderChannel {
  postMessage(message: unknown): void;
  addEventListener(
    type: "message",
    listener: (event: MessageEvent) => void
  ): void;
  removeEventListener(
    type: "message",
    listener: (event: MessageEvent) => void
  ): void;
  close(): void;
}

export type TabLeaderRole = "leader" | "follower";

type TabLeaderMessageKind =
  | "probe"
  | "heartbeat"
  | "resign"
  | "request-refresh"
  | "data";

interface TabLeaderMessageEnvelope {
  kind: TabLeaderMessageKind;
  scope: string;
  tabId: string;
  term?: number;
  payload?: unknown;
}

export interface TabLeaderCoordinatorOptions<TPayload> {
  scope: string;
  onRoleChange: (isLeader: boolean) => void;
  onData: (payload: TPayload) => void;
  onRefreshRequest: () => void;
  heartbeatIntervalMs?: number;
  leaseTtlMs?: number;
  claimJitterMs?: () => number;
  tabId?: string;
  now?: () => number;
  createChannel?: (name: string) => TabLeaderChannel | null;
}

export interface TabLeaderCoordinator<TPayload> {
  start: () => void;
  stop: () => void;
  setVisible: (visible: boolean) => void;
  publish: (payload: TPayload) => void;
  requestRefresh: () => void;
  getRole: () => TabLeaderRole;
}

function defaultClaimJitterMs(): number {
  return (
    TAB_LEADER_MIN_CLAIM_JITTER_MS +
    Math.random() * (TAB_LEADER_MAX_CLAIM_JITTER_MS - TAB_LEADER_MIN_CLAIM_JITTER_MS)
  );
}

function createDefaultTabId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `tab-${Math.random().toString(36).slice(2)}`;
}

function createDefaultChannel(name: string): TabLeaderChannel | null {
  if (typeof BroadcastChannel === "undefined") {
    return null;
  }

  try {
    return new BroadcastChannel(name);
  } catch {
    return null;
  }
}

function parseTabLeaderMessage(value: unknown): TabLeaderMessageEnvelope | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Record<string, unknown>;
  const kind = candidate.kind;
  if (
    kind !== "probe" &&
    kind !== "heartbeat" &&
    kind !== "resign" &&
    kind !== "request-refresh" &&
    kind !== "data"
  ) {
    return null;
  }

  if (typeof candidate.scope !== "string" || typeof candidate.tabId !== "string") {
    return null;
  }

  if (kind !== "probe" && kind !== "request-refresh") {
    if (typeof candidate.term !== "number" || !Number.isInteger(candidate.term)) {
      return null;
    }
  }

  return candidate as unknown as TabLeaderMessageEnvelope;
}

export function createTabLeaderCoordinator<TPayload>(
  options: TabLeaderCoordinatorOptions<TPayload>
): TabLeaderCoordinator<TPayload> {
  const { scope, onRoleChange, onData, onRefreshRequest } = options;
  const heartbeatIntervalMs =
    options.heartbeatIntervalMs ?? TAB_LEADER_HEARTBEAT_INTERVAL_MS;
  const leaseTtlMs = options.leaseTtlMs ?? TAB_LEADER_LEASE_TTL_MS;
  const claimJitterMs = options.claimJitterMs ?? defaultClaimJitterMs;
  const tabId = options.tabId ?? createDefaultTabId();
  const now = options.now ?? Date.now;
  const channel = (options.createChannel ?? createDefaultChannel)(
    `nexusdash-tab-leader:${scope}`
  );

  let role: TabLeaderRole = channel ? "follower" : "leader";
  let knownTerm = 0;
  let lastLeaderSeenAt: number | null = null;
  let isVisible = true;
  let started = false;
  let stopped = false;
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  let leaseTimer: ReturnType<typeof setTimeout> | null = null;
  let claimTimer: ReturnType<typeof setTimeout> | null = null;

  function post(message: TabLeaderMessageEnvelope) {
    if (stopped || !channel) {
      return;
    }

    channel.postMessage(message);
  }

  function clearHeartbeatTimer() {
    if (heartbeatTimer !== null) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
  }

  function clearLeaseTimer() {
    if (leaseTimer !== null) {
      clearTimeout(leaseTimer);
      leaseTimer = null;
    }
  }

  function clearClaimTimer() {
    if (claimTimer !== null) {
      clearTimeout(claimTimer);
      claimTimer = null;
    }
  }

  function postHeartbeat() {
    post({ kind: "heartbeat", scope, tabId, term: knownTerm });
  }

  function armLeaseTimer() {
    clearLeaseTimer();

    if (stopped || lastLeaderSeenAt === null) {
      return;
    }

    const remainingMs = lastLeaderSeenAt + leaseTtlMs - now();
    if (remainingMs <= 0) {
      handleLeaseExpired();
      return;
    }

    leaseTimer = setTimeout(handleLeaseExpired, remainingMs);
  }

  function handleLeaseExpired() {
    leaseTimer = null;

    if (stopped || !channel || role !== "follower" || !isVisible) {
      return;
    }

    lastLeaderSeenAt = null;
    post({ kind: "probe", scope, tabId });
    armClaimTimer();
  }

  function armClaimTimer() {
    clearClaimTimer();
    claimTimer = setTimeout(handleClaimTimeout, claimJitterMs());
  }

  function handleClaimTimeout() {
    claimTimer = null;

    if (stopped || !channel || role !== "follower" || !isVisible) {
      return;
    }

    if (lastLeaderSeenAt !== null && now() - lastLeaderSeenAt < leaseTtlMs) {
      armLeaseTimer();
      return;
    }

    becomeLeader();
  }

  function recordLeaderSeen() {
    lastLeaderSeenAt = now();
    clearClaimTimer();
    armLeaseTimer();
  }

  function becomeLeader() {
    role = "leader";
    knownTerm += 1;
    clearLeaseTimer();
    clearClaimTimer();
    clearHeartbeatTimer();

    postHeartbeat();
    heartbeatTimer = setInterval(postHeartbeat, heartbeatIntervalMs);

    onRoleChange(true);
    onRefreshRequest();
  }

  function stepDown() {
    role = "follower";
    clearHeartbeatTimer();
    recordLeaderSeen();
    onRoleChange(false);
  }

  function handleChannelMessage(event: MessageEvent) {
    if (stopped || !isVisible) {
      return;
    }

    const message = parseTabLeaderMessage(event.data);
    if (!message || message.scope !== scope || message.tabId === tabId) {
      return;
    }

    switch (message.kind) {
      case "probe":
        if (role === "leader") {
          postHeartbeat();
          onRefreshRequest();
        }
        return;

      case "heartbeat": {
        const term = message.term ?? 0;

        if (term < knownTerm) {
          if (role === "leader") {
            postHeartbeat();
          }
          return;
        }

        if (term > knownTerm) {
          knownTerm = term;
          if (role === "leader") {
            stepDown();
          } else {
            recordLeaderSeen();
          }
          return;
        }

        if (role === "leader") {
          if (message.tabId > tabId) {
            stepDown();
          } else {
            postHeartbeat();
          }
          return;
        }

        recordLeaderSeen();
        return;
      }

      case "resign": {
        const term = message.term ?? 0;

        if (term < knownTerm) {
          return;
        }

        if (term > knownTerm) {
          knownTerm = term;
        }

        if (role === "leader") {
          return;
        }

        lastLeaderSeenAt = null;
        clearLeaseTimer();
        armClaimTimer();
        return;
      }

      case "request-refresh":
        if (role === "leader") {
          onRefreshRequest();
        }
        return;

      case "data": {
        const term = message.term ?? 0;

        if (term < knownTerm) {
          return;
        }

        if (term > knownTerm) {
          knownTerm = term;
          if (role === "leader") {
            stepDown();
          } else {
            recordLeaderSeen();
          }
        } else if (role === "follower") {
          recordLeaderSeen();
        }

        onData(message.payload as TPayload);
        return;
      }
    }
  }

  function start() {
    if (started || stopped) {
      return;
    }
    started = true;

    if (!channel) {
      role = "leader";
      onRoleChange(true);
      return;
    }

    channel.addEventListener("message", handleChannelMessage);
    role = "follower";
    onRoleChange(false);
    post({ kind: "probe", scope, tabId });
    armClaimTimer();
  }

  function stop() {
    if (stopped) {
      return;
    }

    clearHeartbeatTimer();
    clearLeaseTimer();
    clearClaimTimer();

    if (channel) {
      if (role === "leader") {
        post({ kind: "resign", scope, tabId, term: knownTerm });
      }
      channel.removeEventListener("message", handleChannelMessage);
      channel.close();
    }

    stopped = true;
  }

  function setVisible(nextVisible: boolean) {
    if (stopped || !channel || nextVisible === isVisible) {
      return;
    }

    isVisible = nextVisible;
    clearLeaseTimer();
    clearClaimTimer();

    if (!isVisible) {
      clearHeartbeatTimer();

      if (role === "leader") {
        post({ kind: "resign", scope, tabId, term: knownTerm });
        role = "follower";
        onRoleChange(false);
      }

      lastLeaderSeenAt = null;
      return;
    }

    // Rejoin as a follower: a probe finds any live leader, otherwise the
    // bounded claim below re-elects this tab.
    lastLeaderSeenAt = null;
    post({ kind: "probe", scope, tabId });
    armClaimTimer();
  }

  function publish(payload: TPayload) {
    if (stopped || !channel || role !== "leader") {
      return;
    }

    post({ kind: "data", scope, tabId, term: knownTerm, payload });
  }

  function requestRefresh() {
    if (stopped) {
      return;
    }

    if (!channel || role === "leader") {
      onRefreshRequest();
      return;
    }

    post({ kind: "request-refresh", scope, tabId });
  }

  function getRole(): TabLeaderRole {
    return role;
  }

  return {
    start,
    stop,
    setVisible,
    publish,
    requestRefresh,
    getRole,
  };
}
