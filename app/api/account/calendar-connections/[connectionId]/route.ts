import { NextRequest, NextResponse } from "next/server";

import { requireAuthenticatedApiUser } from "@/lib/auth/api-guard";
import { disconnectCalendarConnection } from "@/lib/services/calendar-connection-service";

export async function DELETE(
  request: NextRequest,
  props: { params: Promise<{ connectionId: string }> }
) {
  const authenticatedUser = await requireAuthenticatedApiUser(request);
  if (!authenticatedUser.ok) return authenticatedUser.response;
  const { connectionId } = await props.params;
  const result = await disconnectCalendarConnection({
    userId: authenticatedUser.userId,
    connectionId,
  });
  return NextResponse.json({ disconnected: true, ...result });
}
