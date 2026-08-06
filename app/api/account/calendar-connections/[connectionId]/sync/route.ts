import { NextRequest, NextResponse } from "next/server";

import { requireAuthenticatedApiUser } from "@/lib/auth/api-guard";
import { syncCalendarConnection } from "@/lib/services/calendar-connection-service";

export async function POST(
  request: NextRequest,
  props: { params: Promise<{ connectionId: string }> }
) {
  const authenticatedUser = await requireAuthenticatedApiUser(request);
  if (!authenticatedUser.ok) return authenticatedUser.response;
  const { connectionId } = await props.params;
  try {
    await syncCalendarConnection({
      userId: authenticatedUser.userId,
      connectionId,
    });
    return NextResponse.json({ synced: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    return NextResponse.json(
      {
        error:
          message === "calendar-connection-not-found"
            ? message
            : "calendar-sync-failed",
      },
      { status: message === "calendar-connection-not-found" ? 404 : 502 }
    );
  }
}
