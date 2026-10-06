import { NextRequest, NextResponse } from "next/server";

import { requireAuthenticatedApiUser } from "@/lib/auth/api-guard";
import { getRealtimeTransport } from "@/lib/env.server";
import { recordRealtimeCounter } from "@/lib/observability/realtime-metrics";
import { issueRealtimeToken } from "@/lib/services/realtime-token-service";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const auth = await requireAuthenticatedApiUser(request);
  if (!auth.ok) {
    recordRealtimeCounter("broadcast.tokenDenied");
    auth.response.headers.set("Cache-Control", "no-store");
    return auth.response;
  }
  if (getRealtimeTransport() !== "broadcast") {
    return NextResponse.json({ error: "transport-disabled" }, {
      status: 404,
      headers: { "Cache-Control": "no-store" },
    });
  }
  return NextResponse.json(issueRealtimeToken(auth.userId), {
    headers: { "Cache-Control": "no-store" },
  });
}
