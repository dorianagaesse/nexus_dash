import { NextRequest, NextResponse } from "next/server";

import { buildAgentOpenApiDocument } from "@/lib/agent-onboarding";

export async function GET(request: NextRequest) {
  const appOrigin = new URL(request.url).origin;

  return NextResponse.json(buildAgentOpenApiDocument(appOrigin), {
    headers: {
      "Cache-Control": "public, max-age=0, s-maxage=300",
    },
  });
}
