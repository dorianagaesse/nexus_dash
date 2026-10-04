import { NextRequest, NextResponse } from "next/server";

import { requireAuthenticatedApiUser } from "@/lib/auth/api-guard";
import { isRealtimeStreamEnabled } from "@/lib/env.server";
import { recordRealtimeCounter } from "@/lib/observability/realtime-metrics";
import { startServerTiming } from "@/lib/observability/server-timing";
import { getNotificationRealtimeSnapshotForUser } from "@/lib/services/notification-service";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const timing = startServerTiming("account.notifications.poll");
  const authenticatedUser = await requireAuthenticatedApiUser(request);
  if (!authenticatedUser.ok) {
    return authenticatedUser.response;
  }

  recordRealtimeCounter("notifications.snapshotChecks");
  if (isRealtimeStreamEnabled() &&
      request.headers.get("x-realtime-reconcile") !== "1") {
    recordRealtimeCounter("notifications.pollingFallbacks");
  }

  const result = await getNotificationRealtimeSnapshotForUser(
    authenticatedUser.userId
  );
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error },
      {
        status: result.status,
        headers: {
          "Cache-Control": "no-store",
          ...timing.headers(),
        },
      }
    );
  }

  return NextResponse.json(result.data, {
    status: result.status,
    headers: {
      "Cache-Control": "no-store",
      ...timing.headers(),
    },
  });
}
