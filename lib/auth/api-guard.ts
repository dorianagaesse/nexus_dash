import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { getSessionUserIdFromRequest } from "@/lib/auth/session-user";

interface AuthenticatedApiUserSuccess {
  ok: true;
  userId: string;
}

interface AuthenticatedApiUserFailure {
  ok: false;
  response: NextResponse;
}

export type AuthenticatedApiUserResult =
  | AuthenticatedApiUserSuccess
  | AuthenticatedApiUserFailure;

export async function requireAuthenticatedApiUser(
  request: NextRequest | Request
): Promise<AuthenticatedApiUserResult> {
  const actorUserId = await getSessionUserIdFromRequest(request);

  if (!actorUserId) {
    return {
      ok: false,
      response: NextResponse.json({ error: "unauthorized" }, { status: 401 }),
    };
  }

  return {
    ok: true,
    userId: actorUserId,
  };
}
