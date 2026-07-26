import { NextRequest, NextResponse } from "next/server";

import { requireAuthenticatedApiUser } from "@/lib/auth/api-guard";
import { logServerWarning } from "@/lib/observability/logger";
import { submitProductFeedback } from "@/lib/services/product-feedback-service";

interface ProductFeedbackRequestBody {
  reportType?: unknown;
  message?: unknown;
  pagePath?: unknown;
  diagnostics?: unknown;
}

export async function POST(request: NextRequest) {
  const authenticatedUser = await requireAuthenticatedApiUser(request);
  if (!authenticatedUser.ok) {
    return authenticatedUser.response;
  }

  let payload: ProductFeedbackRequestBody;
  try {
    payload = (await request.json()) as ProductFeedbackRequestBody;
  } catch (error) {
    logServerWarning("POST /api/feedback.invalidJson", "Invalid JSON payload", {
      error,
    });
    return NextResponse.json({ error: "invalid-json" }, { status: 400 });
  }

  const result = await submitProductFeedback({
    actorUserId: authenticatedUser.userId,
    reportType: payload.reportType,
    message: payload.message,
    pagePath: payload.pagePath,
    diagnostics: payload.diagnostics,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json(result.data, { status: result.status });
}
