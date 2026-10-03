import { NextRequest, NextResponse } from "next/server";

import { requireApiPrincipal } from "@/lib/auth/api-guard";
import { getRealtimeMetricsSnapshot } from "@/lib/observability/realtime-metrics";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const principalResult = await requireApiPrincipal(request);
  if (!principalResult.ok) {
    return principalResult.response;
  }

  return NextResponse.json(
    { metrics: getRealtimeMetricsSnapshot() },
    { headers: { "Cache-Control": "no-store" } }
  );
}
