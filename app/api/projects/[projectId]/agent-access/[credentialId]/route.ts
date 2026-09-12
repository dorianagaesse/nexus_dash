import { NextRequest, NextResponse } from "next/server";

import {
  readClientIpAddress,
  requireAuthenticatedApiUser,
  resolveRequestId,
} from "@/lib/auth/api-guard";
import { revokeProjectAgentCredential } from "@/lib/services/project-agent-access-service";
import { parseResponsibilityResolution } from "@/lib/services/project-offboarding-service";

export async function DELETE(
  request: NextRequest,
  props: { params: Promise<{ projectId: string; credentialId: string }> }
) {
  const params = await props.params;
  const authenticatedUser = await requireAuthenticatedApiUser(request);
  if (!authenticatedUser.ok) {
    return authenticatedUser.response;
  }

  const payload = (await request.json().catch(() => null)) as
    | { responsibilityResolution?: unknown }
    | null;

  const result = await revokeProjectAgentCredential({
    actorUserId: authenticatedUser.userId,
    projectId: params.projectId,
    credentialId: params.credentialId,
    requestId: resolveRequestId(request),
    ipAddress: readClientIpAddress(request),
    userAgent: request.headers.get("user-agent"),
    responsibilityResolution: parseResponsibilityResolution(
      payload?.responsibilityResolution
    ),
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, inventory: result.inventory },
      { status: result.status }
    );
  }

  return NextResponse.json(result.data);
}
