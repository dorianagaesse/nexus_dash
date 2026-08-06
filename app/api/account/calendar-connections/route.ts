import { NextRequest, NextResponse } from "next/server";

import { requireAuthenticatedApiUser } from "@/lib/auth/api-guard";
import {
  getCalendarPreference,
  listCalendarConnections,
} from "@/lib/services/calendar-connection-service";

export async function GET(request: NextRequest) {
  const authenticatedUser = await requireAuthenticatedApiUser(request);
  if (!authenticatedUser.ok) return authenticatedUser.response;

  const [connections, preference] = await Promise.all([
    listCalendarConnections(authenticatedUser.userId),
    getCalendarPreference(authenticatedUser.userId),
  ]);
  return NextResponse.json({
    connections,
    preference: {
      defaultConnectionId: preference?.defaultConnectionId ?? null,
      writeSourceId: preference?.writeSourceId ?? null,
    },
  });
}
