import { NextRequest, NextResponse } from "next/server";

import { requireAuthenticatedApiUser } from "@/lib/auth/api-guard";
import { logServerWarning } from "@/lib/observability/logger";
import {
  getGoogleCalendarTargetSettings,
  updateGoogleCalendarTargetSettings,
} from "@/lib/services/account-settings-service";

interface UpdateGoogleCalendarSettingsRequestBody {
  calendarId?: unknown;
}

type GoogleCalendarSettingsResult =
  | Awaited<ReturnType<typeof getGoogleCalendarTargetSettings>>
  | Awaited<ReturnType<typeof updateGoogleCalendarTargetSettings>>;

function jsonServiceResult(result: GoogleCalendarSettingsResult) {
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({ settings: result.data }, { status: result.status });
}

export async function GET(request: NextRequest) {
  const authenticatedUser = await requireAuthenticatedApiUser(request);
  if (!authenticatedUser.ok) {
    return authenticatedUser.response;
  }

  return jsonServiceResult(
    await getGoogleCalendarTargetSettings(authenticatedUser.userId)
  );
}

export async function PATCH(request: NextRequest) {
  const authenticatedUser = await requireAuthenticatedApiUser(request);
  if (!authenticatedUser.ok) {
    return authenticatedUser.response;
  }

  let payload: UpdateGoogleCalendarSettingsRequestBody;
  try {
    payload = (await request.json()) as UpdateGoogleCalendarSettingsRequestBody;
  } catch (error) {
    logServerWarning(
      "PATCH /api/account/settings/google-calendar.invalidJson",
      "Invalid JSON payload",
      { error }
    );
    return NextResponse.json({ error: "invalid-json" }, { status: 400 });
  }

  return jsonServiceResult(
    await updateGoogleCalendarTargetSettings({
      actorUserId: authenticatedUser.userId,
      calendarIdRaw: typeof payload.calendarId === "string" ? payload.calendarId : "",
    })
  );
}

export async function DELETE(request: NextRequest) {
  const authenticatedUser = await requireAuthenticatedApiUser(request);
  if (!authenticatedUser.ok) {
    return authenticatedUser.response;
  }

  return jsonServiceResult(
    await updateGoogleCalendarTargetSettings({
      actorUserId: authenticatedUser.userId,
      calendarIdRaw: "",
    })
  );
}
