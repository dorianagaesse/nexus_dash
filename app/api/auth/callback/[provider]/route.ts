import { NextRequest, NextResponse } from "next/server";

import {
  getPrimarySessionCookieOptions,
} from "@/lib/auth/session-cookie";
import { isProductionEnvironment } from "@/lib/env.server";
import { resolveRequestOriginFromHeaders } from "@/lib/http/request-origin";
import { logServerError } from "@/lib/observability/logger";
import { authenticateWithSocialProvider } from "@/lib/services/social-auth-service";
import { PRIMARY_SESSION_COOKIE_NAME } from "@/lib/services/session-service";
import {
  isSocialAuthProvider,
  normalizeHomeAuthForm,
  normalizeReturnToPath,
  resolveSocialOAuthRedirectUri,
  SOCIAL_OAUTH_FORM_COOKIE,
  SOCIAL_OAUTH_PROVIDER_COOKIE,
  SOCIAL_OAUTH_RETURN_TO_COOKIE,
  SOCIAL_OAUTH_STATE_COOKIE,
} from "@/lib/social-auth";

function clearOAuthCookies(response: NextResponse): NextResponse {
  const secure = isProductionEnvironment();

  for (const name of [
    SOCIAL_OAUTH_STATE_COOKIE,
    SOCIAL_OAUTH_PROVIDER_COOKIE,
    SOCIAL_OAUTH_RETURN_TO_COOKIE,
    SOCIAL_OAUTH_FORM_COOKIE,
  ]) {
    response.cookies.set(name, "", {
      httpOnly: true,
      secure,
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    });
  }

  return response;
}

function buildHomeRedirect(
  request: NextRequest,
  form: string,
  error: string
): NextResponse {
  const target = new URL("/", request.url);
  target.searchParams.set("form", form);
  target.searchParams.set("error", error);
  return clearOAuthCookies(NextResponse.redirect(target));
}

function buildSuccessRedirect(
  request: NextRequest,
  returnTo: string
): NextResponse {
  return clearOAuthCookies(NextResponse.redirect(new URL(returnTo, request.url)));
}

export async function GET(
  request: NextRequest,
  { params }: { params: { provider: string } }
) {
  const provider = params.provider;
  const expectedState = request.cookies.get(SOCIAL_OAUTH_STATE_COOKIE)?.value ?? null;
  const expectedProvider =
    request.cookies.get(SOCIAL_OAUTH_PROVIDER_COOKIE)?.value ?? null;
  const returnTo = normalizeReturnToPath(
    request.cookies.get(SOCIAL_OAUTH_RETURN_TO_COOKIE)?.value ?? null
  );
  const form = normalizeHomeAuthForm(
    request.cookies.get(SOCIAL_OAUTH_FORM_COOKIE)?.value ?? null
  );

  if (!isSocialAuthProvider(provider)) {
    return buildHomeRedirect(request, form, "social-auth-failed");
  }

  if (!expectedState || expectedProvider !== provider) {
    return buildHomeRedirect(request, form, "social-auth-failed");
  }

  const receivedState = request.nextUrl.searchParams.get("state");
  const code = request.nextUrl.searchParams.get("code");
  const oauthError = request.nextUrl.searchParams.get("error");

  if (oauthError) {
    return buildHomeRedirect(request, form, "social-auth-cancelled");
  }

  if (!receivedState || receivedState !== expectedState || !code) {
    return buildHomeRedirect(request, form, "social-auth-failed");
  }

  let redirectUri = "";
  try {
    try {
      redirectUri = resolveSocialOAuthRedirectUri(provider);
    } catch {
      redirectUri = resolveSocialOAuthRedirectUri(
        provider,
        resolveRequestOriginFromHeaders(request.headers)
      );
    }
  } catch (error) {
    logServerError(`GET /api/auth/callback/${provider}.configError`, error);
    return buildHomeRedirect(request, form, "social-provider-disabled");
  }

  let result;
  try {
    result = await authenticateWithSocialProvider({
      provider,
      code,
      redirectUri,
    });
  } catch (error) {
    logServerError(`GET /api/auth/callback/${provider}.authenticate`, error);
    return buildHomeRedirect(request, form, "social-auth-failed");
  }

  if (!result.ok) {
    return buildHomeRedirect(request, form, result.error);
  }

  const response = buildSuccessRedirect(request, returnTo);
  response.cookies.set(
    PRIMARY_SESSION_COOKIE_NAME,
    result.data.sessionToken,
    getPrimarySessionCookieOptions(result.data.expiresAt)
  );
  return response;
}
