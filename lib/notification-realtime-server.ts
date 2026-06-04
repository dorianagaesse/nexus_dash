import { cache } from "react";

import type { NotificationRealtimeSnapshot } from "@/lib/notification-realtime-types";
import { logServerError } from "@/lib/observability/logger";
import { getNotificationRealtimeSnapshotForUser } from "@/lib/services/notification-service";

function createEmptyNotificationRealtimeSnapshot(): NotificationRealtimeSnapshot {
  return {
    version: new Date(0).toISOString(),
    unreadCount: 0,
    latestUnreadNotification: null,
    serverTime: new Date().toISOString(),
  };
}

export const getInitialNotificationRealtimeSnapshotForUser = cache(
  async (actorUserId: string): Promise<NotificationRealtimeSnapshot> => {
    try {
      const result = await getNotificationRealtimeSnapshotForUser(actorUserId);
      if (result.ok) {
        return result.data;
      }

      logServerError(
        "getInitialNotificationRealtimeSnapshotForUser",
        new Error(result.error)
      );
    } catch (error) {
      logServerError("getInitialNotificationRealtimeSnapshotForUser", error);
    }

    return createEmptyNotificationRealtimeSnapshot();
  }
);
