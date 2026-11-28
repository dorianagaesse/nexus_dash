import { NextRequest, NextResponse } from "next/server";

import { requireAuthenticatedApiUser } from "@/lib/auth/api-guard";
import { resolveRequestOriginFromHeaders } from "@/lib/http/request-origin";
import {
  inspectAgentCliPairingForUser,
  respondToAgentCliPairing,
} from "@/lib/services/agent-cli-pairing-service";

function isTrustedSameOriginMutation(request: NextRequest | Request): boolean {
  const secFetchSite = request.headers.get("sec-fetch-site")?.trim().toLowerCase();
  if (secFetchSite && secFetchSite !== "same-origin" && secFetchSite !== "none") {
    return false;
  }

  const originHeader = request.headers.get("origin")?.trim();
  if (!originHeader) {
    return true;
  }

  try {
    const suppliedOrigin = new URL(originHeader).origin;
    const requestUrlOrigin = new URL(request.url).origin;
    const expectedOrigin = resolveRequestOriginFromHeaders(request.headers);
    return suppliedOrigin === expectedOrigin || suppliedOrigin === requestUrlOrigin;
  } catch {
    return false;
  }
}

export async function GET(request: NextRequest) {
  const user = await requireAuthenticatedApiUser(request);
  if (!user.ok) {
    return user.response;
  }

  const code = request.nextUrl.searchParams.get("code");
  const view = await inspectAgentCliPairingForUser({
    actorUserId: user.userId,
    rawCode: code,
  });

  return NextResponse.json(view, {
    status: 200,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function POST(request: NextRequest) {
  const user = await requireAuthenticatedApiUser(request);
  if (!user.ok) {
    return user.response;
  }

  if (!isTrustedSameOriginMutation(request)) {
    return NextResponse.json({ error: "invalid-origin" }, { status: 403 });
  }

  let command: unknown;
  try {
    command = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid-json" }, { status: 400 });
  }
  if (!command || typeof command !== "object" || Array.isArray(command)) {
    return NextResponse.json({ error: "invalid-command" }, { status: 400 });
  }

  const result = await respondToAgentCliPairing({
    actorUserId: user.userId,
    command: command as Record<string, unknown>,
  });

  return NextResponse.json(result.ok ? result.data : { error: result.error }, {
    status: result.status,
    headers: { "Cache-Control": "no-store" },
  });
}
