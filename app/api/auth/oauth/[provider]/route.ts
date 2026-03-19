import crypto from "node:crypto";

import { NextRequest, NextResponse } from "next/server";

import { getSessionUserIdFromRequest } from "@/lib/auth/session-user";
import { isProductionEnvironment } from "@/lib/env.server";
import { resolveRequestOriginFromHeaders } from "@/lib/http/request-origin";
import { logServerError } from "@/lib/observability/logger";
import {
  buildSocialOAuthAuthorizationUrl,
  isSocialAuthProvider,
  normalizeHomeAuthForm,
  normalizeReturnToPath,
  resolveSocialOAuthRedirectUri,
  SOCIAL_OAUTH_FORM_COOKIE,
  SOCIAL_OAUTH_PROVIDER_COOKIE,
  SOCIAL_OAUTH_RETURN_TO_COOKIE,
  SOCIAL_OAUTH_STATE_COOKIE,
  type SocialAuthProvider,
} from "@/lib/social-auth";

function buildHomeRedirect(request: NextRequest, form: string, error: string): URL {
  const target = new URL("/", request.url);
  target.searchParams.set("form", form);
  target.searchParams.set("error", error);
  return target;
}

export async function GET(
  request: NextRequest,
  { params }: { params: { provider: string } }
) {
  const form = normalizeHomeAuthForm(request.nextUrl.searchParams.get("form"));
  const provider = params.provider;
  const returnTo = normalizeReturnToPath(
    request.nextUrl.searchParams.get("returnTo")
  );

  if (!isSocialAuthProvider(provider)) {
    return NextResponse.redirect(buildHomeRedirect(request, form, "social-auth-failed"));
  }

  const actorUserId = await getSessionUserIdFromRequest(request);
  if (actorUserId) {
    return NextResponse.redirect(new URL(returnTo, request.url));
  }

  const state = crypto.randomBytes(24).toString("hex");
  const secure = isProductionEnvironment();
  let authorizationUrl = "";

  try {
    let redirectUri = "";
    try {
      redirectUri = resolveSocialOAuthRedirectUri(provider);
    } catch {
      redirectUri = resolveSocialOAuthRedirectUri(
        provider,
        resolveRequestOriginFromHeaders(request.headers)
      );
    }

    authorizationUrl = buildSocialOAuthAuthorizationUrl(
      provider,
      state,
      redirectUri
    );
  } catch (error) {
    logServerError(`GET /api/auth/oauth/${provider}.configError`, error);
    return NextResponse.redirect(
      buildHomeRedirect(request, form, "social-provider-disabled")
    );
  }

  const response = NextResponse.redirect(authorizationUrl);

  response.cookies.set(SOCIAL_OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 10,
  });
  response.cookies.set(SOCIAL_OAUTH_PROVIDER_COOKIE, provider, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 10,
  });
  response.cookies.set(SOCIAL_OAUTH_RETURN_TO_COOKIE, returnTo, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 10,
  });
  response.cookies.set(SOCIAL_OAUTH_FORM_COOKIE, form, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 10,
  });

  return response;
}
