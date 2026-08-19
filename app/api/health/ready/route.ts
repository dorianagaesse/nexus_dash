import { NextResponse } from "next/server";

import { getAppMetadataSummary } from "@/lib/app-metadata";
import { logServerError } from "@/lib/observability/logger";
import { checkDatabaseReadiness } from "@/lib/services/health-service";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const requestId = request.headers.get("x-request-id");

  try {
    await checkDatabaseReadiness();
    const metadata = getAppMetadataSummary();

    return NextResponse.json(
      {
        status: "ready",
        service: "nexusdash",
        timestamp: new Date().toISOString(),
        checks: {
          database: "ok",
        },
        deployment: {
          environment: metadata.environment,
          revision: metadata.revision,
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
