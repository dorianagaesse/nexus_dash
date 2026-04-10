import { NextRequest, NextResponse } from "next/server";

import {
  readClientIpAddressFromHeaders,
  resolveRequestIdFromHeaders,
  readUserAgentFromHeaders,
} from "@/lib/http/request-metadata";
import { logServerWarning } from "@/lib/observability/logger";
import { exchangeAgentApiKeyForAccessToken } from "@/lib/services/project-agent-access-service";

interface AgentTokenExchangeRequestBody {
  apiKey?: unknown;
}

function readApiKeyFromHeaders(request: NextRequest): string | null {
  const authorizationHeader = request.headers.get("authorization")?.trim();
  if (authorizationHeader) {
    const [scheme, ...valueParts] = authorizationHeader.split(/\s+/);
    if (scheme.toLowerCase() === "apikey") {
      const headerValue = valueParts.join(" ").trim();
      if (headerValue) {
        return headerValue;
      }
    }
  }

  return request.headers.get("x-agent-api-key")?.trim() ?? null;
}

export async function POST(request: NextRequest) {
  let payload: AgentTokenExchangeRequestBody | null = null;

  if (request.headers.get("content-type")?.includes("application/json")) {
    try {
      payload = (await request.json()) as AgentTokenExchangeRequestBody;
    } catch (error) {
      logServerWarning("POST /api/auth/agent/token.invalidJson", "Invalid JSON payload", {
        error,
      });
      return NextResponse.json({ error: "invalid-json" }, { status: 400 });
    }
  }

  const apiKey =
    readApiKeyFromHeaders(request) ??
    (typeof payload?.apiKey === "string" ? payload.apiKey.trim() : "");

  const result = await exchangeAgentApiKeyForAccessToken({
    apiKey,
    requestId: resolveRequestIdFromHeaders(request.headers),
    ipAddress: readClientIpAddressFromHeaders(request.headers),
    userAgent: readUserAgentFromHeaders(request.headers),
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json(result.data);
}
