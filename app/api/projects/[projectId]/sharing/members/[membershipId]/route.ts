import { NextRequest, NextResponse } from "next/server";

import { requireAuthenticatedApiUser } from "@/lib/auth/api-guard";
import { logServerWarning } from "@/lib/observability/logger";
import {
  removeProjectMember,
  updateProjectMemberRole,
} from "@/lib/services/project-collaboration-service";

interface UpdateMemberRoleRequestBody {
  role?: unknown;
}

export async function PATCH(
  request: NextRequest,
  props: {
    params: Promise<{ projectId: string; membershipId: string }>;
  }
) {
  const params = await props.params;
  const authenticatedUser = await requireAuthenticatedApiUser(request);
  if (!authenticatedUser.ok) {
    return authenticatedUser.response;
  }

  let payload: UpdateMemberRoleRequestBody;
  try {
    payload = (await request.json()) as UpdateMemberRoleRequestBody;
  } catch (error) {
    logServerWarning(
      "PATCH /api/projects/:projectId/sharing/members/:membershipId.invalidJson",
      "Invalid JSON payload",
      { error }
    );
    return NextResponse.json({ error: "invalid-json" }, { status: 400 });
  }

  const result = await updateProjectMemberRole({
    actorUserId: authenticatedUser.userId,
    projectId: params.projectId,
    membershipId: params.membershipId,
    role: typeof payload.role === "string" ? payload.role : "",
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json(result.data);
}

export async function DELETE(
  request: NextRequest,
  props: {
    params: Promise<{ projectId: string; membershipId: string }>;
  }
) {
  const params = await props.params;
  const authenticatedUser = await requireAuthenticatedApiUser(request);
  if (!authenticatedUser.ok) {
    return authenticatedUser.response;
  }

  const result = await removeProjectMember({
    actorUserId: authenticatedUser.userId,
    projectId: params.projectId,
    membershipId: params.membershipId,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json(result.data);
}
