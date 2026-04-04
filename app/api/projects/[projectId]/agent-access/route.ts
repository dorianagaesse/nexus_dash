import { NextRequest, NextResponse } from "next/server";

import {
  readClientIpAddress,
  requireAuthenticatedApiUser,
  resolveRequestId,
} from "@/lib/auth/api-guard";
import { logServerWarning } from "@/lib/observability/logger";
import {
  createProjectAgentCredential,
  getProjectAgentAccessSummary,
} from "@/lib/services/project-agent-access-service";

interface CreateAgentCredentialRequestBody {
  label?: unknown;
  scopes?: unknown;
  expiresInDays?: unknown;
}

function readExpiresInDays(value: unknown): number | null {
  if (value == null || value === "") {
    return null;
  }

  if (typeof value !== "number" || !Number.isInteger(value)) {
    return Number.NaN;
  }

  return value;
}

export async function GET(request: NextRequest, props: { params: Promise<{ projectId: string }> }) {
  const params = await props.params;
  const authenticatedUser = await requireAuthenticatedApiUser(request);
  if (!authenticatedUser.ok) {
    return authenticatedUser.response;
  }

  const result = await getProjectAgentAccessSummary({
    actorUserId: authenticatedUser.userId,
    projectId: params.projectId,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json(result.data);
}

export async function POST(request: NextRequest, props: { params: Promise<{ projectId: string }> }) {
  const params = await props.params;
  const authenticatedUser = await requireAuthenticatedApiUser(request);
  if (!authenticatedUser.ok) {
    return authenticatedUser.response;
  }

  let payload: CreateAgentCredentialRequestBody;
  try {
    payload = (await request.json()) as CreateAgentCredentialRequestBody;
  } catch (error) {
    logServerWarning(
      "POST /api/projects/:projectId/agent-access.invalidJson",
      "Invalid JSON payload",
      { error }
    );
    return NextResponse.json({ error: "invalid-json" }, { status: 400 });
  }

  const expiresInDays = readExpiresInDays(payload.expiresInDays);
  if (Number.isNaN(expiresInDays)) {
    return NextResponse.json({ error: "invalid-expiry" }, { status: 400 });
  }

  const result = await createProjectAgentCredential({
    actorUserId: authenticatedUser.userId,
    projectId: params.projectId,
    label: typeof payload.label === "string" ? payload.label : "",
    scopes: Array.isArray(payload.scopes) ? payload.scopes : [],
    expiresInDays,
    requestId: resolveRequestId(request),
    ipAddress: readClientIpAddress(request),
    userAgent: request.headers.get("user-agent"),
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json(result.data, { status: result.status });
}
