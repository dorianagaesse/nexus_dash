import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { getSessionUserIdFromRequest } from "@/lib/auth/session-user";
import { logServerError } from "@/lib/observability/logger";
import { getEmailVerificationStatus } from "@/lib/services/email-verification-service";

export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = { "Cache-Control": "no-store" } as const;

function jsonResponse(body: Record<string, unknown>, status: number): NextResponse {
  return NextResponse.json(body, { status, headers: NO_STORE_HEADERS });
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const actorUserId = await getSessionUserIdFromRequest(request);
  if (!actorUserId) {
    return jsonResponse({ error: "unauthorized" }, 401);
  }

  try {
    const status = await getEmailVerificationStatus(actorUserId);
    if (!status.ok) {
      return jsonResponse({ error: status.error }, status.status);
    }

    return jsonResponse({ isVerified: status.data.isVerified }, 200);
  } catch (error) {
    logServerError("GET /api/auth/verify-email/status", error, {
      actorUserId,
    });
    return jsonResponse({ error: "verification-status-unavailable" }, 500);
  }
}
