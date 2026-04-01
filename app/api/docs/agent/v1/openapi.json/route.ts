import { NextRequest, NextResponse } from "next/server";

import { buildAgentOpenApiDocument } from "@/lib/agent-onboarding";
import { resolveRequestOriginFromHeaders } from "@/lib/http/request-origin";

export async function GET(request: NextRequest) {
  const appOrigin = resolveRequestOriginFromHeaders(request.headers);

  return NextResponse.json(buildAgentOpenApiDocument(appOrigin), {
    headers: {
      "Cache-Control": "public, max-age=0, s-maxage=300",
    },
  });
}
