"use client";

import { useEffect, useState } from "react";

import type { NotificationRealtimeSnapshot } from "@/lib/notification-realtime-types";

export const NOTIFICATION_REALTIME_EVENT = "nexusdash:notification-realtime";

interface NotificationRealtimeEventDetail {
  snapshot: NotificationRealtimeSnapshot;
}

let latestSnapshot: NotificationRealtimeSnapshot | null = null;

export function publishNotificationRealtimeSnapshot(
  snapshot: NotificationRealtimeSnapshot
) {
  latestSnapshot = snapshot;

  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(
    new CustomEvent<NotificationRealtimeEventDetail>(NOTIFICATION_REALTIME_EVENT, {
      detail: {
        snapshot,
      },
    })
  );
}

export function getLatestNotificationRealtimeSnapshot() {
  return latestSnapshot;
}

export function useNotificationRealtimeSnapshot(
  initialSnapshot: NotificationRealtimeSnapshot
) {
  const [snapshot, setSnapshot] = useState<NotificationRealtimeSnapshot>(
    () => latestSnapshot ?? initialSnapshot
  );

  useEffect(() => {
    if (!latestSnapshot) {
      latestSnapshot = initialSnapshot;
    }

    function handleSnapshot(event: Event) {
      const detail = (event as CustomEvent<NotificationRealtimeEventDetail>)
        .detail;
      if (!detail?.snapshot) {
        return;
      }

      setSnapshot(detail.snapshot);
    }

    window.addEventListener(NOTIFICATION_REALTIME_EVENT, handleSnapshot);

    return () => {
      window.removeEventListener(NOTIFICATION_REALTIME_EVENT, handleSnapshot);
    };
  }, [initialSnapshot]);

  return snapshot;
}
