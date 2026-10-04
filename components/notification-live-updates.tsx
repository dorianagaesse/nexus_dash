"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  publishNotificationRealtimeSnapshot,
} from "@/lib/notification-realtime-client";
import type { NotificationRealtimeSnapshot } from "@/lib/notification-realtime-types";
import { resolveAdaptivePollDelayMs } from "@/lib/adaptive-live-polling";
import { createTabLeaderCoordinator } from "@/lib/tab-leader-coordinator";
import { startBroadcastSubscription } from "@/lib/realtime/supabase-realtime-client";

const DEFAULT_ACTIVE_POLL_INTERVAL_MS = 20000;

interface NotificationLiveUpdatesProps {
  initialSnapshot: NotificationRealtimeSnapshot;
  pollIntervalMs?: number;
  streamEnabled?: boolean;
  broadcastEnabled?: boolean;
  userId?: string;
}

function canUseNotificationStream(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.EventSource === "function"
  );
}

function isSnapshotChanged(
  next: NotificationRealtimeSnapshot,
  previous: NotificationRealtimeSnapshot
): boolean {
  return (
    next.version !== previous.version ||
    next.unreadCount !== previous.unreadCount ||
    next.latestUnreadNotification?.title !==
      previous.latestUnreadNotification?.title
  );
}

export function NotificationLiveUpdates({
  initialSnapshot,
  pollIntervalMs = DEFAULT_ACTIVE_POLL_INTERVAL_MS,
  streamEnabled = true,
  broadcastEnabled = false,
  userId,
}: NotificationLiveUpdatesProps) {
  const [isPollingFallbackActive, setIsPollingFallbackActive] = useState(
    () => !broadcastEnabled && (!streamEnabled || !canUseNotificationStream())
  );
  const [broadcastFailed, setBroadcastFailed] = useState(false);
  const [streamFailed, setStreamFailed] = useState(false);
  const knownSnapshotRef = useRef(initialSnapshot);

  const handleSnapshot = useCallback((snapshot: NotificationRealtimeSnapshot) => {
    if (!isSnapshotChanged(snapshot, knownSnapshotRef.current)) {
      return;
    }

    knownSnapshotRef.current = snapshot;
    publishNotificationRealtimeSnapshot(snapshot);
  }, []);

  useEffect(() => {
    knownSnapshotRef.current = initialSnapshot;
    publishNotificationRealtimeSnapshot(initialSnapshot);
  }, [initialSnapshot]);

  const useBroadcast = broadcastEnabled && Boolean(userId) && !broadcastFailed;
  const useStream = streamEnabled && !useBroadcast && !streamFailed &&
    canUseNotificationStream();

  useEffect(() => {
    setIsPollingFallbackActive(!useBroadcast && !useStream);
  }, [useBroadcast, useStream]);

  useEffect(() => {
    if (!useBroadcast || !userId) return;
    return startBroadcastSubscription<NotificationRealtimeSnapshot>({
      scope: "notifications",
      topic: `user:${userId}:notifications`,
      event: "notification-snapshot",
      onMessage: handleSnapshot,
      async reconcile() {
        const response = await fetch("/api/account/notifications/summary", {
          cache: "no-store",
        });
        if (!response.ok) throw new Error("Notification reconciliation failed");
        return (await response.json()) as NotificationRealtimeSnapshot;
      },
      onFailure: () => setBroadcastFailed(true),
    });
  }, [handleSnapshot, useBroadcast, userId]);

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
      "/api/account/notifications/stream"
    );

    function handleOpen() {
      setIsPollingFallbackActive(false);
    }

    function handleNotificationSnapshot(event: MessageEvent<string>) {
      try {
        handleSnapshot(JSON.parse(event.data) as NotificationRealtimeSnapshot);
      } catch (error) {
        console.warn("[NotificationLiveUpdates.stream]", error);
      }
    }

    function handleError() {
      eventSource.close();
      setStreamFailed(true);
      setIsPollingFallbackActive(true);
    }

    eventSource.addEventListener("open", handleOpen);
    eventSource.addEventListener(
      "notification-snapshot",
      handleNotificationSnapshot as EventListener
    );
    eventSource.addEventListener("error", handleError);

    return () => {
      eventSource.removeEventListener("open", handleOpen);
      eventSource.removeEventListener(
        "notification-snapshot",
        handleNotificationSnapshot as EventListener
      );
      eventSource.removeEventListener("error", handleError);
      eventSource.close();
    };
  }, [handleSnapshot, useStream]);

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
      timeoutId = setTimeout(pollNotifications, delayMs);
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

    const coordinator = createTabLeaderCoordinator<NotificationRealtimeSnapshot>({
      scope: "notifications",
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
      onData(snapshot) {
        handleSnapshot(snapshot);
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

    async function pollNotifications() {
      timeoutId = null;
      isPolling = true;
      controller?.abort();
      controller = new AbortController();

      try {
        const response = await fetch("/api/account/notifications/summary", {
          cache: "no-store",
          signal: controller.signal,
        });

        if (!response.ok) {
          consecutiveFailures += 1;
          return;
        }

        const snapshot = (await response.json()) as NotificationRealtimeSnapshot;
        consecutiveFailures = 0;
        handleSnapshot(snapshot);
        coordinator.publish(snapshot);
      } catch (error) {
        if ((error as { name?: string }).name === "AbortError") {
          return;
        }

        consecutiveFailures += 1;
        console.warn("[NotificationLiveUpdates.poll]", error);
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
  }, [broadcastEnabled, handleSnapshot, isPollingFallbackActive, pollIntervalMs]);

  return null;
}

export const notificationLiveUpdatesInternals = {
  canUseNotificationStream,
  isSnapshotChanged,
};
