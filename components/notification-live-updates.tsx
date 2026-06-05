"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  publishNotificationRealtimeSnapshot,
} from "@/lib/notification-realtime-client";
import type { NotificationRealtimeSnapshot } from "@/lib/notification-realtime-types";

const DEFAULT_ACTIVE_POLL_INTERVAL_MS = 2000;
const BACKGROUND_POLL_INTERVAL_MS = 15000;

interface NotificationLiveUpdatesProps {
  initialSnapshot: NotificationRealtimeSnapshot;
  pollIntervalMs?: number;
  streamEnabled?: boolean;
}

function canUseNotificationStream(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.EventSource === "function"
  );
}

function resolveNextPollIntervalMs(activePollIntervalMs: number): number {
  if (typeof document !== "undefined" && document.hidden) {
    return Math.max(BACKGROUND_POLL_INTERVAL_MS, activePollIntervalMs * 4);
  }

  return activePollIntervalMs;
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
}: NotificationLiveUpdatesProps) {
  const [isPollingFallbackActive, setIsPollingFallbackActive] = useState(
    () => !streamEnabled || !canUseNotificationStream()
  );
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

  useEffect(() => {
    setIsPollingFallbackActive(!streamEnabled || !canUseNotificationStream());
  }, [streamEnabled]);

  useEffect(() => {
    if (!streamEnabled || !canUseNotificationStream()) {
      return;
    }

    let opened = false;
    const eventSource = new window.EventSource(
      "/api/account/notifications/stream"
    );

    function handleOpen() {
      opened = true;
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
      if (opened) {
        return;
      }

      eventSource.close();
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
  }, [handleSnapshot, streamEnabled]);

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
      timeoutId = setTimeout(pollNotifications, delayMs);
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
          return;
        }

        handleSnapshot((await response.json()) as NotificationRealtimeSnapshot);
      } catch (error) {
        if ((error as { name?: string }).name === "AbortError") {
          return;
        }

        console.warn("[NotificationLiveUpdates.poll]", error);
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
  }, [handleSnapshot, isPollingFallbackActive, pollIntervalMs]);

  return null;
}

export const notificationLiveUpdatesInternals = {
  canUseNotificationStream,
  isSnapshotChanged,
  resolveNextPollIntervalMs,
};
