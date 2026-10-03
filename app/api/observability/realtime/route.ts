import { NextRequest, NextResponse } from "next/server";

import { requireAuthenticatedApiUser } from "@/lib/auth/api-guard";
import { getRealtimeMetricsSnapshot } from "@/lib/observability/realtime-metrics";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const authenticatedUser = await requireAuthenticatedApiUser(request);
  if (!authenticatedUser.ok) {
    return authenticatedUser.response;
  }

  return NextResponse.json(
    { metrics: getRealtimeMetricsSnapshot() },
    { headers: { "Cache-Control": "no-store" } }
  );
}
