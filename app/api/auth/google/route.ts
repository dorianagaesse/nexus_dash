import crypto from "node:crypto";

import { NextRequest, NextResponse } from "next/server";

import {
  GOOGLE_OAUTH_RETURN_TO_COOKIE,
  GOOGLE_OAUTH_STATE_COOKIE,
  buildGoogleOAuthUrl,
  normalizeReturnToPath,
} from "@/lib/google-calendar";

function withErrorParam(request: NextRequest, returnTo: string, error: string): URL {
  const target = new URL(returnTo, request.url);
  target.searchParams.set("error", error);
  return target;
}

export async function GET(request: NextRequest) {
  const returnTo = normalizeReturnToPath(request.nextUrl.searchParams.get("returnTo"));
  const state = crypto.randomBytes(24).toString("hex");
  const secure = process.env.NODE_ENV === "production";
  let authorizationUrl = "";

  try {
    authorizationUrl = buildGoogleOAuthUrl(state);
  } catch (error) {
    console.error("[GET /api/auth/google] config error", error);
    const fallback = withErrorParam(request, returnTo, "calendar-config-missing");
    return NextResponse.redirect(fallback);
  }

  try {
    const response = NextResponse.redirect(authorizationUrl);

    response.cookies.set(GOOGLE_OAUTH_STATE_COOKIE, state, {
      httpOnly: true,
      secure,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 10,
    });

    response.cookies.set(GOOGLE_OAUTH_RETURN_TO_COOKIE, returnTo, {
      httpOnly: true,
      secure,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 10,
    });

    return response;
  } catch (error) {
    console.error("[GET /api/auth/google] response creation failed", error);
    const fallback = withErrorParam(request, "/projects", "calendar-auth-init-failed");
    return NextResponse.redirect(fallback);
  }
}
