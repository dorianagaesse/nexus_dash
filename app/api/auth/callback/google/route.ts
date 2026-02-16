import { NextRequest, NextResponse } from "next/server";

import {
  GOOGLE_OAUTH_RETURN_TO_COOKIE,
  GOOGLE_OAUTH_STATE_COOKIE,
  exchangeAuthorizationCodeForTokens,
  normalizeReturnToPath,
} from "@/lib/google-calendar";
import { upsertGoogleCalendarCredentialTokens } from "@/lib/services/google-calendar-credential-service";

function buildRedirectUrl(
  request: NextRequest,
  returnToPath: string,
  query: Record<string, string>
): URL {
  const redirectUrl = new URL(returnToPath, request.url);

  Object.entries(query).forEach(([key, value]) => {
    redirectUrl.searchParams.set(key, value);
  });

  return redirectUrl;
}

function buildRedirectResponse(
  request: NextRequest,
  returnToPath: string,
  query: Record<string, string>
): NextResponse {
  const redirectUrl = buildRedirectUrl(request, returnToPath, query);
  const response = NextResponse.redirect(redirectUrl);
  const secure = process.env.NODE_ENV === "production";

  response.cookies.set(GOOGLE_OAUTH_STATE_COOKIE, "", {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });

  response.cookies.set(GOOGLE_OAUTH_RETURN_TO_COOKIE, "", {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });

  return response;
}

export async function GET(request: NextRequest) {
  const expectedState = request.cookies.get(GOOGLE_OAUTH_STATE_COOKIE)?.value ?? null;
  const returnToPath = normalizeReturnToPath(
    request.cookies.get(GOOGLE_OAUTH_RETURN_TO_COOKIE)?.value ?? null
  );

  const receivedState = request.nextUrl.searchParams.get("state");
  const code = request.nextUrl.searchParams.get("code");
  const oauthError = request.nextUrl.searchParams.get("error");

  if (oauthError) {
    return buildRedirectResponse(request, returnToPath, {
      error: "calendar-auth-cancelled",
    });
  }

  if (!expectedState || !receivedState || expectedState !== receivedState) {
    return buildRedirectResponse(request, returnToPath, {
      error: "calendar-auth-state-invalid",
    });
  }

  if (!code) {
    return buildRedirectResponse(request, returnToPath, {
      error: "calendar-auth-code-missing",
    });
  }

  try {
    const tokenResponse = await exchangeAuthorizationCodeForTokens(code);
    await upsertGoogleCalendarCredentialTokens({
      accessToken: tokenResponse.accessToken,
      expiresIn: tokenResponse.expiresIn,
      refreshToken: tokenResponse.refreshToken,
      tokenType: tokenResponse.tokenType,
      scope: tokenResponse.scope,
    });

    return buildRedirectResponse(request, returnToPath, {
      status: "calendar-connected",
    });
  } catch (error) {
    console.error("[GET /api/auth/callback/google] token exchange failed", error);
    return buildRedirectResponse(request, returnToPath, {
      error: "calendar-auth-failed",
    });
  }
}
