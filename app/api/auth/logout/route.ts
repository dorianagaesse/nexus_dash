import { NextRequest, NextResponse } from "next/server";

import { SESSION_COOKIE_NAMES } from "@/lib/auth/session-constants";
import { isProductionEnvironment } from "@/lib/env.server";
import { normalizeReturnToPath } from "@/lib/navigation/return-to";
import { logServerError } from "@/lib/observability/logger";
import {
  deleteSessionByToken,
  readSessionTokensFromCookieReader,
} from "@/lib/services/session-service";

export async function POST(request: NextRequest) {
  const sessionTokens = readSessionTokensFromCookieReader(
    (name) => request.cookies.get(name)?.value ?? null
  );

  if (sessionTokens.length > 0) {
    for (const sessionToken of sessionTokens) {
      try {
        await deleteSessionByToken(sessionToken);
      } catch (error) {
        logServerError("POST /api/auth/logout.deleteSessionFailed", error);
      }
    }
  }

  const secure = isProductionEnvironment();
  const returnToPath = normalizeReturnToPath(
    request.nextUrl.searchParams.get("returnTo"),
    "/"
  );
  const response = NextResponse.redirect(new URL(returnToPath, request.url));

  for (const cookieName of SESSION_COOKIE_NAMES) {
    response.cookies.set(cookieName, "", {
      httpOnly: true,
      secure,
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    });
  }

  return response;
}
