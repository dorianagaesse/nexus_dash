import { NextRequest, NextResponse } from "next/server";

import { isProductionEnvironment } from "@/lib/env.server";
import { logServerError } from "@/lib/observability/logger";
import {
  SESSION_COOKIE_NAMES,
  deleteSessionByToken,
  readSessionTokenFromCookieReader,
} from "@/lib/services/session-service";

export async function POST(request: NextRequest) {
  const sessionToken = readSessionTokenFromCookieReader(
    (name) => request.cookies.get(name)?.value ?? null
  );

  if (sessionToken) {
    try {
      await deleteSessionByToken(sessionToken);
    } catch (error) {
      logServerError("POST /api/auth/logout.deleteSessionFailed", error);
    }
  }

  const secure = isProductionEnvironment();
  const response = NextResponse.redirect(new URL("/", request.url));

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
