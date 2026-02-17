import { NextResponse } from "next/server";

import { logServerError } from "@/lib/observability/logger";
import { checkDatabaseReadiness } from "@/lib/services/health-service";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const requestId = request.headers.get("x-request-id");

  try {
    await checkDatabaseReadiness();

    return NextResponse.json(
      {
        status: "ready",
        service: "nexusdash",
        timestamp: new Date().toISOString(),
        checks: {
          database: "ok",
        },
        requestId,
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  } catch (error) {
    logServerError("GET /api/health/ready", error, { requestId });

    return NextResponse.json(
      {
        status: "degraded",
        service: "nexusdash",
        timestamp: new Date().toISOString(),
        checks: {
          database: "error",
        },
        requestId,
        error: "database-unreachable",
      },
      {
        status: 503,
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  }
}
