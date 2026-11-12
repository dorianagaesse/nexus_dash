import { NextRequest, NextResponse } from "next/server";
import { readClientIpAddress } from "@/lib/auth/api-guard";
import { exchangeRuntimeAccess } from "@/lib/services/agent-runtime-service";
import {
  AuthRateLimitScope,
  buildAuthRateLimitKey,
  checkAuthAbuseControls,
  registerAuthAbuseFailure,
} from "@/lib/services/auth-abuse-control-service";

export async function POST(request: NextRequest) {
  const signals = [
    {
      key: buildAuthRateLimitKey(
        "runtime-ip",
        readClientIpAddress(request) ?? "unknown"
      )!,
      maxAttempts: 30,
      windowMs: 900_000,
      blockMs: 900_000,
    },
  ];
  const scope = AuthRateLimitScope.agent_token_exchange;
  const allowed = await checkAuthAbuseControls({ scope, signals });
  if (!allowed.ok)
    return NextResponse.json({ error: "too-many-attempts" }, { status: 429 });
  let input;
  try {
    input = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid-json" }, { status: 400 });
  }
  if (!input || typeof input !== "object" || Array.isArray(input))
    return NextResponse.json({ error: "invalid-command" }, { status: 400 });
  const result = await exchangeRuntimeAccess(input);
  if (!result.ok) await registerAuthAbuseFailure({ scope, signals });
  return NextResponse.json(result.ok ? result.data : { error: result.error }, {
    status: result.status,
    headers: { "Cache-Control": "no-store" },
  });
}
