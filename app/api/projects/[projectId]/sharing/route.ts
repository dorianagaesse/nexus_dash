import { NextRequest, NextResponse } from "next/server";

import { requireAuthenticatedApiUser } from "@/lib/auth/api-guard";
import { logServerWarning } from "@/lib/observability/logger";
import {
  getProjectSharingSummary,
  inviteUserToProject,
} from "@/lib/services/project-collaboration-service";

interface InviteRequestBody {
  invitedEmail?: unknown;
  role?: unknown;
}

export async function GET(request: NextRequest, props: { params: Promise<{ projectId: string }> }) {
  const params = await props.params;
  const authenticatedUser = await requireAuthenticatedApiUser(request);
  if (!authenticatedUser.ok) {
    return authenticatedUser.response;
  }

  const result = await getProjectSharingSummary({
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

  let payload: InviteRequestBody;
  try {
    payload = (await request.json()) as InviteRequestBody;
  } catch (error) {
    logServerWarning(
      "POST /api/projects/:projectId/sharing.invalidJson",
      "Invalid JSON payload",
      { error }
    );
    return NextResponse.json({ error: "invalid-json" }, { status: 400 });
  }

  const result = await inviteUserToProject({
    actorUserId: authenticatedUser.userId,
    projectId: params.projectId,
    invitedEmail:
      typeof payload.invitedEmail === "string" ? payload.invitedEmail : "",
    role: typeof payload.role === "string" ? payload.role : "",
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json(result.data, { status: result.status });
}
