"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  dispatchProjectActivityRemoteEvent,
  PROJECT_ACTIVITY_ACK_EVENT,
  PROJECT_ACTIVITY_MUTATION_EVENT,
  type ProjectActivityAcknowledgementDetail,
  type ProjectActivityMutationDetail,
} from "@/lib/project-activity-client";
import type { ProjectActivityEventPayload } from "@/lib/project-activity-event-types";
import { resolveAdaptivePollDelayMs } from "@/lib/adaptive-live-polling";
import { createTabLeaderCoordinator } from "@/lib/tab-leader-coordinator";
import { startBroadcastSubscription } from "@/lib/realtime/supabase-realtime-client";

const DEFAULT_ACTIVE_POLL_INTERVAL_MS = 10000;
const PENDING_REFRESH_CHECK_INTERVAL_MS = 500;

interface ProjectLiveRefreshProps {
  projectId: string;
  initialVersion: string;
  pollIntervalMs?: number;
  streamEnabled?: boolean;
  broadcastEnabled?: boolean;
}

type ProjectActivityResponse = ProjectActivityEventPayload;

function parseVersion(value: string): number {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function isNewerVersion(nextVersion: string, currentVersion: string): boolean {
  return parseVersion(nextVersion) > parseVersion(currentVersion);
}

function canUseActivityStream(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.EventSource === "function"
  );
}

function markProjectActivityTiming(name: string) {
  if (typeof performance === "undefined" || typeof performance.mark !== "function") {
    return;
  }

  performance.mark(`nexusdash.project-activity.${name}`);
}

function hasRefreshLock(): boolean {
  if (typeof document === "undefined") {
    return false;
  }

  if (document.querySelector("[data-project-live-refresh-lock='true']")) {
    return true;
  }

  if (document.querySelector("[role='dialog']")) {
    return true;
  }

  const activeElement = document.activeElement;
  if (!(activeElement instanceof HTMLElement)) {
    return false;
  }

  const tagName = activeElement.tagName.toLowerCase();
  return (
    activeElement.isContentEditable ||
    tagName === "input" ||
    tagName === "textarea" ||
    tagName === "select"
  );
}

export function ProjectLiveRefresh({
  projectId,
  initialVersion,
  pollIntervalMs = DEFAULT_ACTIVE_POLL_INTERVAL_MS,
  streamEnabled = true,
  broadcastEnabled = false,
}: ProjectLiveRefreshProps) {
  const router = useRouter();
  const [pendingVersion, setPendingVersion] = useState<string | null>(null);
  const [isPollingFallbackActive, setIsPollingFallbackActive] = useState(
    () => !broadcastEnabled && (!streamEnabled || !canUseActivityStream())
  );
  const [broadcastFailed, setBroadcastFailed] = useState(false);
  const [streamFailed, setStreamFailed] = useState(false);
  const [isRefreshing, startRefreshTransition] = useTransition();
  const knownVersionRef = useRef(initialVersion);
  const pendingVersionRef = useRef<string | null>(null);
  const locallyDeferredVersionRef = useRef<string | null>(null);
  const localMutationCountRef = useRef(0);
  const isRefreshingRef = useRef(false);

  useEffect(() => {
    knownVersionRef.current = initialVersion;
    pendingVersionRef.current = null;
    locallyDeferredVersionRef.current = null;
    localMutationCountRef.current = 0;
    setPendingVersion(null);
  }, [initialVersion]);

  useEffect(() => {
    isRefreshingRef.current = isRefreshing;
  }, [isRefreshing]);

  const refreshDashboard = useCallback(
    (nextVersion: string) => {
      knownVersionRef.current = nextVersion;
      pendingVersionRef.current = null;
      setPendingVersion(null);
      startRefreshTransition(() => {
        router.refresh();
      });
    },
    [router]
  );

  const acknowledgeVersion = useCallback((nextVersion: string) => {
    if (!isNewerVersion(nextVersion, knownVersionRef.current)) {
      return;
    }

    knownVersionRef.current = nextVersion;

    const pending = pendingVersionRef.current;
    if (pending && parseVersion(pending) <= parseVersion(nextVersion)) {
      pendingVersionRef.current = null;
      setPendingVersion(null);
    }

    const locallyDeferred = locallyDeferredVersionRef.current;
    if (
      locallyDeferred &&
      parseVersion(locallyDeferred) <= parseVersion(nextVersion)
    ) {
      locallyDeferredVersionRef.current = null;
    }
  }, []);

  const applyLocallyDeferredVersion = useCallback(() => {
    const deferred = locallyDeferredVersionRef.current;
    if (!deferred || !isNewerVersion(deferred, knownVersionRef.current)) {
      locallyDeferredVersionRef.current = null;
      return;
    }

    locallyDeferredVersionRef.current = null;

    if (hasRefreshLock() || isRefreshingRef.current || document.hidden) {
      pendingVersionRef.current = deferred;
      setPendingVersion(deferred);
      return;
    }

    refreshDashboard(deferred);
  }, [refreshDashboard]);

  const handleActivitySnapshot = useCallback(
    (payload: ProjectActivityResponse) => {
      if (payload.projectId !== projectId || !payload.version) {
        return;
      }

      if (!isNewerVersion(payload.version, knownVersionRef.current)) {
        return;
      }

      if (localMutationCountRef.current > 0) {
        const locallyDeferredVersion = locallyDeferredVersionRef.current;
        if (
          !locallyDeferredVersion ||
          isNewerVersion(payload.version, locallyDeferredVersion)
        ) {
          locallyDeferredVersionRef.current = payload.version;
        }
        return;
      }

      markProjectActivityTiming("received");

      if (payload.eventId && dispatchProjectActivityRemoteEvent(payload)) {
        markProjectActivityTiming("patched");
        acknowledgeVersion(payload.version);
        return;
      }

      if (hasRefreshLock() || isRefreshingRef.current) {
        pendingVersionRef.current = payload.version;
        setPendingVersion(payload.version);
        return;
      }

      markProjectActivityTiming("fallback-refresh-start");
      refreshDashboard(payload.version);
    },
    [acknowledgeVersion, projectId, refreshDashboard]
  );

  useEffect(() => {
    function handleProjectActivityAcknowledgement(event: Event) {
      const detail = (event as CustomEvent<ProjectActivityAcknowledgementDetail>)
        .detail;
      if (detail?.projectId !== projectId || typeof detail.version !== "string") {
        return;
      }

      acknowledgeVersion(detail.version);
    }

    window.addEventListener(
      PROJECT_ACTIVITY_ACK_EVENT,
      handleProjectActivityAcknowledgement
    );

    return () => {
      window.removeEventListener(
        PROJECT_ACTIVITY_ACK_EVENT,
        handleProjectActivityAcknowledgement
      );
    };
  }, [acknowledgeVersion, projectId]);

  useEffect(() => {
    function handleProjectActivityMutation(event: Event) {
      const detail = (event as CustomEvent<ProjectActivityMutationDetail>).detail;
      if (
        detail?.projectId !== projectId ||
        (detail.phase !== "start" && detail.phase !== "finish")
      ) {
        return;
      }

      if (detail.phase === "start") {
        localMutationCountRef.current += 1;
        return;
      }

      localMutationCountRef.current = Math.max(
        0,
        localMutationCountRef.current - 1
      );

      if (localMutationCountRef.current === 0) {
        applyLocallyDeferredVersion();
      }
    }

    window.addEventListener(
      PROJECT_ACTIVITY_MUTATION_EVENT,
      handleProjectActivityMutation
    );

    return () => {
      window.removeEventListener(
        PROJECT_ACTIVITY_MUTATION_EVENT,
        handleProjectActivityMutation
      );
    };
  }, [applyLocallyDeferredVersion, projectId]);

  const useStream = streamEnabled && (!broadcastEnabled || broadcastFailed) &&
    !streamFailed && canUseActivityStream();

  useEffect(() => {
    setIsPollingFallbackActive(
      (!broadcastEnabled || broadcastFailed) && !useStream
    );
  }, [broadcastEnabled, broadcastFailed, useStream]);

  useEffect(() => {
    if (!broadcastEnabled || broadcastFailed) return;
    return startBroadcastSubscription<ProjectActivityResponse>({
      scope: `project:${projectId}`,
      topic: `project:${projectId}:activity`,
      event: "project-activity",
      onMessage: handleActivitySnapshot,
      async reconcile() {
        const response = await fetch(
          `/api/projects/${encodeURIComponent(projectId)}/activity`,
          { cache: "no-store", headers: { "x-realtime-reconcile": "1" } }
        );
        if (!response.ok) throw new Error("Project activity reconciliation failed");
        return (await response.json()) as ProjectActivityResponse;
      },
      onFailure: () => setBroadcastFailed(true),
    });
  }, [broadcastEnabled, broadcastFailed, handleActivitySnapshot, projectId]);

  useEffect(() => {
    if (!broadcastEnabled) return;
    function retry() {
      if (!document.hidden) {
        setBroadcastFailed(false);
        setStreamFailed(false);
      }
    }
    document.addEventListener("visibilitychange", retry);
    window.addEventListener("online", retry);
    return () => {
      document.removeEventListener("visibilitychange", retry);
      window.removeEventListener("online", retry);
    };
  }, [broadcastEnabled]);

  useEffect(() => {
    if (!useStream) {
      return;
    }

    const eventSource = new window.EventSource(
      `/api/projects/${encodeURIComponent(projectId)}/activity/stream`
    );

    function handleOpen() {
      setIsPollingFallbackActive(false);
    }

    function handleProjectActivity(event: MessageEvent<string>) {
      try {
        handleActivitySnapshot(JSON.parse(event.data) as ProjectActivityResponse);
      } catch (error) {
        console.warn("[ProjectLiveRefresh.streamActivity]", error);
      }
    }

    function handleError() {
      eventSource.close();
      setStreamFailed(true);
      setIsPollingFallbackActive(true);
    }

    eventSource.addEventListener("open", handleOpen);
    eventSource.addEventListener(
      "project-activity",
      handleProjectActivity as EventListener
    );
    eventSource.addEventListener("error", handleError);

    return () => {
      eventSource.removeEventListener("open", handleOpen);
      eventSource.removeEventListener(
        "project-activity",
        handleProjectActivity as EventListener
      );
      eventSource.removeEventListener("error", handleError);
      eventSource.close();
    };
  }, [handleActivitySnapshot, projectId, useStream]);

  useEffect(() => {
    if (!isPollingFallbackActive) {
      return;
    }

    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let controller: AbortController | null = null;
    let isPolling = false;
    let pollAgainAfterCurrent = false;
    let isPollingLeader = false;
    let consecutiveFailures = 0;

    function clearScheduledPoll() {
      if (!timeoutId) {
        return;
      }

      clearTimeout(timeoutId);
      timeoutId = null;
    }

    function isDocumentHidden() {
      return typeof document !== "undefined" && document.hidden;
    }

    function schedulePoll(delayMs: number) {
      clearScheduledPoll();
      timeoutId = setTimeout(pollActivity, delayMs);
    }

    function scheduleNextPoll() {
      const delayMs = resolveAdaptivePollDelayMs({
        activeIntervalMs: pollIntervalMs,
        isHidden: isDocumentHidden(),
        consecutiveFailures,
      });

      if (delayMs === null) {
        clearScheduledPoll();
        return;
      }

      schedulePoll(delayMs);
    }

    function requestLeaderPoll() {
      if (isDocumentHidden()) {
        return;
      }

      if (isPolling) {
        pollAgainAfterCurrent = true;
        return;
      }

      schedulePoll(0);
    }

    const coordinator = createTabLeaderCoordinator<ProjectActivityResponse>({
      scope: `project:${projectId}`,
      initialVisible: !isDocumentHidden(),
      onRoleChange(isLeader) {
        isPollingLeader = isLeader;
        if (isLeader) {
          if (broadcastEnabled) schedulePoll(0);
          else scheduleNextPoll();
        } else {
          clearScheduledPoll();
        }
      },
      onData(payload) {
        handleActivitySnapshot(payload);
      },
      onRefreshRequest() {
        requestLeaderPoll();
      },
    });

    function requestImmediatePoll() {
      if (isDocumentHidden()) {
        return;
      }

      if (!isPollingLeader) {
        coordinator.requestRefresh();
        return;
      }

      requestLeaderPoll();
    }

    function handleVisibilityChange() {
      if (isDocumentHidden()) {
        coordinator.setVisible(false);
        clearScheduledPoll();
        return;
      }

      coordinator.setVisible(true);
      requestImmediatePoll();
    }

    async function pollActivity() {
      timeoutId = null;
      isPolling = true;
      controller?.abort();
      controller = new AbortController();

      try {
        const response = await fetch(
          `/api/projects/${encodeURIComponent(projectId)}/activity`,
          {
            cache: "no-store",
            signal: controller.signal,
          }
        );

        if (!response.ok) {
          consecutiveFailures += 1;
          return;
        }

        const payload = (await response.json()) as ProjectActivityResponse;
        consecutiveFailures = 0;
        handleActivitySnapshot(payload);
        coordinator.publish(payload);
      } catch (error) {
        if ((error as { name?: string }).name === "AbortError") {
          return;
        }

        consecutiveFailures += 1;
        console.warn("[ProjectLiveRefresh.pollActivity]", error);
      } finally {
        isPolling = false;
        if (!cancelled) {
          const shouldPollImmediately =
            pollAgainAfterCurrent && !isDocumentHidden() && isPollingLeader;
          pollAgainAfterCurrent = false;

          if (shouldPollImmediately) {
            schedulePoll(0);
          } else if (isPollingLeader) {
            scheduleNextPoll();
          } else {
            clearScheduledPoll();
          }
        }
      }
    }

    coordinator.start();
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("focus", requestImmediatePoll);

    return () => {
      cancelled = true;
      coordinator.stop();
      clearScheduledPoll();
      controller?.abort();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("focus", requestImmediatePoll);
    };
  }, [broadcastEnabled, handleActivitySnapshot, isPollingFallbackActive, pollIntervalMs, projectId]);

  useEffect(() => {
    function refreshWhenVisible() {
      const pending = pendingVersionRef.current;
      if (!pending || document.hidden || hasRefreshLock()) {
        return;
      }

      refreshDashboard(pending);
    }

    document.addEventListener("visibilitychange", refreshWhenVisible);
    window.addEventListener("focus", refreshWhenVisible);

    return () => {
      document.removeEventListener("visibilitychange", refreshWhenVisible);
      window.removeEventListener("focus", refreshWhenVisible);
    };
  }, [refreshDashboard]);

  useEffect(() => {
    if (!pendingVersion) {
      return;
    }

    const intervalId = window.setInterval(() => {
      const pending = pendingVersionRef.current;
      if (!pending || document.hidden || hasRefreshLock() || isRefreshingRef.current) {
        return;
      }

      refreshDashboard(pending);
    }, PENDING_REFRESH_CHECK_INTERVAL_MS);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [pendingVersion, refreshDashboard]);

  return null;
}

export const projectLiveRefreshInternals = {
  canUseActivityStream,
  hasRefreshLock,
  isNewerVersion,
  markProjectActivityTiming,
  parseVersion,
};
