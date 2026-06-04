"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import {
  dispatchProjectActivityRemoteEvent,
  PROJECT_ACTIVITY_ACK_EVENT,
  PROJECT_ACTIVITY_MUTATION_EVENT,
  type ProjectActivityAcknowledgementDetail,
  type ProjectActivityMutationDetail,
} from "@/lib/project-activity-client";
import type { ProjectActivityEventPayload } from "@/lib/project-activity-event-types";

const DEFAULT_ACTIVE_POLL_INTERVAL_MS = 2000;
const BACKGROUND_POLL_INTERVAL_MS = 15000;
const PENDING_REFRESH_CHECK_INTERVAL_MS = 500;

interface ProjectLiveRefreshProps {
  projectId: string;
  initialVersion: string;
  pollIntervalMs?: number;
  streamEnabled?: boolean;
}

type ProjectActivityResponse = ProjectActivityEventPayload;

function parseVersion(value: string): number {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function isNewerVersion(nextVersion: string, currentVersion: string): boolean {
  return parseVersion(nextVersion) > parseVersion(currentVersion);
}

function resolveNextPollIntervalMs(activePollIntervalMs: number): number {
  if (typeof document !== "undefined" && document.hidden) {
    return Math.max(BACKGROUND_POLL_INTERVAL_MS, activePollIntervalMs * 4);
  }

  return activePollIntervalMs;
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
}: ProjectLiveRefreshProps) {
  const router = useRouter();
  const [pendingVersion, setPendingVersion] = useState<string | null>(null);
  const [isPollingFallbackActive, setIsPollingFallbackActive] = useState(
    () => !streamEnabled || !canUseActivityStream()
  );
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

      if (hasRefreshLock() || isRefreshingRef.current) {
        pendingVersionRef.current = payload.version;
        setPendingVersion(payload.version);
        return;
      }

      if (payload.eventId && dispatchProjectActivityRemoteEvent(payload)) {
        markProjectActivityTiming("patched");
        acknowledgeVersion(payload.version);
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

  useEffect(() => {
    setIsPollingFallbackActive(!streamEnabled || !canUseActivityStream());
  }, [streamEnabled]);

  useEffect(() => {
    if (!streamEnabled || !canUseActivityStream()) {
      return;
    }

    let opened = false;
    const eventSource = new window.EventSource(
      `/api/projects/${encodeURIComponent(projectId)}/activity/stream`
    );

    function handleOpen() {
      opened = true;
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
      if (opened) {
        return;
      }

      eventSource.close();
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
  }, [handleActivitySnapshot, projectId, streamEnabled]);

  useEffect(() => {
    if (!isPollingFallbackActive) {
      return;
    }

    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let controller: AbortController | null = null;
    let isPolling = false;
    let pollAgainAfterCurrent = false;

    function clearScheduledPoll() {
      if (!timeoutId) {
        return;
      }

      clearTimeout(timeoutId);
      timeoutId = null;
    }

    function schedulePoll(delayMs = resolveNextPollIntervalMs(pollIntervalMs)) {
      clearScheduledPoll();
      timeoutId = setTimeout(pollActivity, delayMs);
    }

    function requestImmediatePoll() {
      if (typeof document !== "undefined" && document.hidden) {
        return;
      }

      if (isPolling) {
        pollAgainAfterCurrent = true;
        return;
      }

      schedulePoll(0);
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
          return;
        }

        const payload = (await response.json()) as ProjectActivityResponse;
        handleActivitySnapshot(payload);
      } catch (error) {
        if ((error as { name?: string }).name === "AbortError") {
          return;
        }

        console.warn("[ProjectLiveRefresh.pollActivity]", error);
      } finally {
        isPolling = false;
        if (!cancelled) {
          if (pollAgainAfterCurrent) {
            pollAgainAfterCurrent = false;
            schedulePoll(0);
          } else {
            schedulePoll();
          }
        }
      }
    }

    schedulePoll();
    document.addEventListener("visibilitychange", requestImmediatePoll);
    window.addEventListener("focus", requestImmediatePoll);

    return () => {
      cancelled = true;
      clearScheduledPoll();
      controller?.abort();
      document.removeEventListener("visibilitychange", requestImmediatePoll);
      window.removeEventListener("focus", requestImmediatePoll);
    };
  }, [handleActivitySnapshot, isPollingFallbackActive, pollIntervalMs, projectId]);

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

  if (!pendingVersion) {
    return null;
  }

  return (
    <div
      aria-live="polite"
      className="fixed bottom-4 left-1/2 z-50 flex w-[calc(100%-2rem)] max-w-md -translate-x-1/2 items-center justify-between gap-3 rounded-md border border-border bg-popover px-4 py-3 text-sm text-popover-foreground shadow-lg sm:left-auto sm:right-4 sm:w-auto sm:translate-x-0"
    >
      <span>Project updates are ready.</span>
      <Button
        type="button"
        size="sm"
        onClick={() => refreshDashboard(pendingVersion)}
        disabled={isRefreshing}
      >
        <RefreshCw className="h-4 w-4" />
        Refresh
      </Button>
    </div>
  );
}

export const projectLiveRefreshInternals = {
  canUseActivityStream,
  hasRefreshLock,
  isNewerVersion,
  markProjectActivityTiming,
  parseVersion,
  resolveNextPollIntervalMs,
};
