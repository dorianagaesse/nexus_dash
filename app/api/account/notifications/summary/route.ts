import { NextRequest, NextResponse } from "next/server";

import { requireAuthenticatedApiUser } from "@/lib/auth/api-guard";
import { getNotificationRealtimeSnapshotForUser } from "@/lib/services/notification-service";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const authenticatedUser = await requireAuthenticatedApiUser(request);
  if (!authenticatedUser.ok) {
    return authenticatedUser.response;
  }

  const result = await getNotificationRealtimeSnapshotForUser(
    authenticatedUser.userId
  );
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json(result.data, {
    status: result.status,
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
