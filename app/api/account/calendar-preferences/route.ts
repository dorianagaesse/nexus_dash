import { NextRequest, NextResponse } from "next/server";

import { requireAuthenticatedApiUser } from "@/lib/auth/api-guard";
import { updateCalendarPreferences } from "@/lib/services/calendar-connection-service";

export async function PATCH(request: NextRequest) {
  const authenticatedUser = await requireAuthenticatedApiUser(request);
  if (!authenticatedUser.ok) return authenticatedUser.response;
  const body = (await request.json().catch(() => null)) as {
    selectedSourceIds?: unknown;
    writeSourceId?: unknown;
  } | null;
  const selectedSourceIds = Array.isArray(body?.selectedSourceIds)
    ? body.selectedSourceIds.filter((id): id is string => typeof id === "string")
    : undefined;
  const writeSourceId =
    body && "writeSourceId" in body
      ? typeof body.writeSourceId === "string"
        ? body.writeSourceId
        : null
      : undefined;

  try {
    await updateCalendarPreferences({
      userId: authenticatedUser.userId,
      selectedSourceIds,
      writeSourceId,
    });
    return NextResponse.json({ saved: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "invalid-preferences";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
