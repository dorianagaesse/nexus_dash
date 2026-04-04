import { NextRequest, NextResponse } from "next/server";

import {
  readClientIpAddress,
  requireAuthenticatedApiUser,
  resolveRequestId,
} from "@/lib/auth/api-guard";
import { revokeProjectAgentCredential } from "@/lib/services/project-agent-access-service";

export async function DELETE(
  request: NextRequest,
  props: { params: Promise<{ projectId: string; credentialId: string }> }
) {
  const params = await props.params;
  const authenticatedUser = await requireAuthenticatedApiUser(request);
  if (!authenticatedUser.ok) {
    return authenticatedUser.response;
  }

  const result = await revokeProjectAgentCredential({
    actorUserId: authenticatedUser.userId,
    projectId: params.projectId,
    credentialId: params.credentialId,
    requestId: resolveRequestId(request),
    ipAddress: readClientIpAddress(request),
    userAgent: request.headers.get("user-agent"),
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json(result.data);
}
