import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { getSessionUserIdFromRequest } from "@/lib/auth/session-user";
import { logServerError } from "@/lib/observability/logger";
import { consumeEmailVerificationToken } from "@/lib/services/email-verification-service";

const VERIFY_EMAIL_PATH = "/verify-email";
const HOME_SIGNIN_PATH = "/?form=signin";
const PROJECTS_PATH = "/projects";

function buildRedirectUrl(request: NextRequest, path: string): URL {
  return new URL(path, request.url);
}

function mapVerificationError(error: string): string {
  switch (error) {
    case "token-expired":
      return "expired-verification-link";
    case "invalid-token":
      return "invalid-verification-link";
    default:
      return "invalid-verification-link";
  }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const token = request.nextUrl.searchParams.get("token") ?? "";
  const actorUserId = await getSessionUserIdFromRequest(request);

  if (!token.trim()) {
    return NextResponse.redirect(
      buildRedirectUrl(request, `${VERIFY_EMAIL_PATH}?error=invalid-verification-link`)
    );
  }

  try {
    const result = await consumeEmailVerificationToken(token);

    if (!result.ok) {
      const mappedError = mapVerificationError(result.error);
      return NextResponse.redirect(
        buildRedirectUrl(request, `${VERIFY_EMAIL_PATH}?error=${mappedError}`)
      );
    }

    if (actorUserId && actorUserId !== result.data.userId) {
      return NextResponse.redirect(
        buildRedirectUrl(request, `${VERIFY_EMAIL_PATH}?error=verification-link-account-mismatch`)
      );
    }

    if (actorUserId) {
      return NextResponse.redirect(
        buildRedirectUrl(request, `${PROJECTS_PATH}?status=email-verified`)
      );
    }

    return NextResponse.redirect(
      buildRedirectUrl(request, `${HOME_SIGNIN_PATH}&status=email-verified`)
    );
  } catch (error) {
    logServerError("GET /api/auth/verify-email", error);
    return NextResponse.redirect(
      buildRedirectUrl(request, `${VERIFY_EMAIL_PATH}?error=invalid-verification-link`)
    );
  }
}
