import { NextRequest, NextResponse } from "next/server";

import { requireAuthenticatedApiUser } from "@/lib/auth/api-guard";
import {
  encodeServerSentEvent,
  sleepWithAbort,
} from "@/lib/realtime/server-sent-events";
import type { NotificationRealtimeSnapshot } from "@/lib/notification-realtime-types";
import { getNotificationRealtimeSnapshotForUser } from "@/lib/services/notification-service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

const NOTIFICATION_STREAM_EVENT = "notification-snapshot";
const NOTIFICATION_STREAM_RETRY_MS = 2_000;
const NOTIFICATION_STREAM_POLL_INTERVAL_MS = 1_000;
const NOTIFICATION_STREAM_HEARTBEAT_INTERVAL_MS = 15_000;
const NOTIFICATION_STREAM_MAX_DURATION_MS = 280_000;

function streamHeaders(): HeadersInit {
  return {
    "Cache-Control": "no-store, no-transform",
    Connection: "keep-alive",
    "Content-Type": "text/event-stream; charset=utf-8",
    "X-Accel-Buffering": "no",
  };
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

export async function GET(request: NextRequest) {
  const authenticatedUser = await requireAuthenticatedApiUser(request);
  if (!authenticatedUser.ok) {
    return authenticatedUser.response;
  }

  const initialSnapshot = await getNotificationRealtimeSnapshotForUser(
    authenticatedUser.userId
  );
  if (!initialSnapshot.ok) {
    return NextResponse.json(
      { error: initialSnapshot.error },
      {
        status: initialSnapshot.status,
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  }

  const encoder = new TextEncoder();
  let streamCancelled = false;
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let lastSnapshot = initialSnapshot.data;
      let lastHeartbeatAt = Date.now();
      const closeAt = Date.now() + NOTIFICATION_STREAM_MAX_DURATION_MS;

      function enqueueEvent(input: {
        event?: string;
        id?: string;
        data?: unknown;
        comment?: string;
        retry?: number;
      }) {
        if (streamCancelled) {
          return;
        }

        controller.enqueue(encoder.encode(encodeServerSentEvent(input)));
      }

      enqueueEvent({
        event: NOTIFICATION_STREAM_EVENT,
        id: lastSnapshot.version,
        retry: NOTIFICATION_STREAM_RETRY_MS,
        data: lastSnapshot,
      });

      while (
        !streamCancelled &&
        !request.signal.aborted &&
        Date.now() < closeAt
      ) {
        try {
          await sleepWithAbort(
            NOTIFICATION_STREAM_POLL_INTERVAL_MS,
            request.signal
          );
        } catch (error) {
          if ((error as { name?: string }).name === "AbortError") {
            break;
          }

          throw error;
        }

        const snapshot = await getNotificationRealtimeSnapshotForUser(
          authenticatedUser.userId,
          { syncProjectInvitations: false }
        );
        if (!snapshot.ok) {
          enqueueEvent({
            event: "error",
            data: {
              error: snapshot.error,
              status: snapshot.status,
            },
          });
          break;
        }

        if (isSnapshotChanged(snapshot.data, lastSnapshot)) {
          lastSnapshot = snapshot.data;
          lastHeartbeatAt = Date.now();
          enqueueEvent({
            event: NOTIFICATION_STREAM_EVENT,
            id: lastSnapshot.version,
            data: lastSnapshot,
          });
          continue;
        }

        if (
          Date.now() - lastHeartbeatAt >=
          NOTIFICATION_STREAM_HEARTBEAT_INTERVAL_MS
        ) {
          lastHeartbeatAt = Date.now();
          enqueueEvent({ comment: "heartbeat" });
        }
      }

      if (!streamCancelled) {
        controller.close();
      }
    },
    cancel() {
      streamCancelled = true;
    },
  });

  return new Response(stream, {
    headers: streamHeaders(),
  });
}

export const notificationStreamRouteInternals = {
  encodeServerSentEvent,
  isSnapshotChanged,
  NOTIFICATION_STREAM_EVENT,
};
