import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  return NextResponse.json(
    {
      status: "ok",
      service: "nexusdash",
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
      requestId: request.headers.get("x-request-id"),
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    }
  );
}
