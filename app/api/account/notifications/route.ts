import { NextRequest, NextResponse } from "next/server";

import { requireAuthenticatedApiUser } from "@/lib/auth/api-guard";
import { isRealtimeStreamEnabled } from "@/lib/env.server";
import { logServerWarning } from "@/lib/observability/logger";
import { recordRealtimeCounter } from "@/lib/observability/realtime-metrics";
import { startServerTiming } from "@/lib/observability/server-timing";
import {
  listNotificationsForUser,
  setNotificationReadState,
} from "@/lib/services/notification-service";

interface UpdateNotificationRequestBody {
  notificationId?: unknown;
  read?: unknown;
}

export async function GET(request: NextRequest) {
  const timing = startServerTiming("account.notifications.poll");
  const authenticatedUser = await requireAuthenticatedApiUser(request);
  if (!authenticatedUser.ok) {
    return authenticatedUser.response;
  }

  recordRealtimeCounter("notifications.snapshotChecks");
  if (isRealtimeStreamEnabled()) {
    recordRealtimeCounter("notifications.pollingFallbacks");
  }

  const result = await listNotificationsForUser(authenticatedUser.userId);
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error },
      { status: result.status, headers: timing.headers() }
    );
  }

  return NextResponse.json(result.data, {
    status: result.status,
    headers: timing.headers(),
  });
}

export async function PATCH(request: NextRequest) {
  const authenticatedUser = await requireAuthenticatedApiUser(request);
  if (!authenticatedUser.ok) {
    return authenticatedUser.response;
  }

  let payload: UpdateNotificationRequestBody;
  try {
    payload = (await request.json()) as UpdateNotificationRequestBody;
  } catch (error) {
    logServerWarning(
      "PATCH /api/account/notifications.invalidJson",
      "Invalid JSON payload",
      { error }
    );
    return NextResponse.json({ error: "invalid-json" }, { status: 400 });
  }

  const notificationId =
    typeof payload.notificationId === "string" ? payload.notificationId : "";
  if (typeof payload.read !== "boolean") {
    return NextResponse.json({ error: "invalid-payload" }, { status: 400 });
  }

  const result = await setNotificationReadState({
    actorUserId: authenticatedUser.userId,
    notificationId,
    read: payload.read,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json(result.data, { status: result.status });
}
