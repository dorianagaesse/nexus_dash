import { NextRequest, NextResponse } from "next/server";

import { requireAuthenticatedApiUser } from "@/lib/auth/api-guard";
import { logServerWarning } from "@/lib/observability/logger";
import { updateAccountPassword } from "@/lib/services/account-profile-service";
import { readSessionTokenFromCookieReader } from "@/lib/services/session-service";

interface UpdateAccountPasswordRequestBody {
  currentPassword?: unknown;
  newPassword?: unknown;
  confirmNewPassword?: unknown;
}

export async function PATCH(request: NextRequest) {
  const authenticatedUser = await requireAuthenticatedApiUser(request);
  if (!authenticatedUser.ok) {
    return authenticatedUser.response;
  }

  let payload: UpdateAccountPasswordRequestBody;
  try {
    payload = (await request.json()) as UpdateAccountPasswordRequestBody;
  } catch (error) {
    logServerWarning("PATCH /api/account/password.invalidJson", "Invalid JSON payload", {
      error,
    });
    return NextResponse.json({ error: "invalid-json" }, { status: 400 });
  }

  const currentSessionToken = readSessionTokenFromCookieReader((name) => {
    return request.cookies.get(name)?.value ?? null;
  });

  const result = await updateAccountPassword({
    actorUserId: authenticatedUser.userId,
    currentPasswordRaw:
      typeof payload.currentPassword === "string" ? payload.currentPassword : "",
    newPasswordRaw: typeof payload.newPassword === "string" ? payload.newPassword : "",
    newPasswordConfirmationRaw:
      typeof payload.confirmNewPassword === "string"
        ? payload.confirmNewPassword
        : "",
    currentSessionToken,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({ password: result.data }, { status: result.status });
}
