import { NextRequest, NextResponse } from "next/server";

import { requireAuthenticatedApiUser } from "@/lib/auth/api-guard";
import { recordProjectActivityEventVersion } from "@/lib/project-activity-event-response";
import { withProjectActivityVersionHeader } from "@/lib/project-activity-version";
import { revokeProjectInvitation } from "@/lib/services/project-collaboration-service";

export async function DELETE(
  request: NextRequest,
  props: {
    params: Promise<{ projectId: string; invitationId: string }>;
  }
) {
  const params = await props.params;
  const authenticatedUser = await requireAuthenticatedApiUser(request);
  if (!authenticatedUser.ok) {
    return authenticatedUser.response;
  }

  const result = await revokeProjectInvitation({
    actorUserId: authenticatedUser.userId,
    projectId: params.projectId,
    invitationId: params.invitationId,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  const version = await recordProjectActivityEventVersion({
    actorUserId: authenticatedUser.userId,
    projectId: params.projectId,
    domain: "membership",
    action: "deleted",
    entityId: params.invitationId,
    payload: { invitationId: params.invitationId },
    entityDisplayNameSnapshot: result.data.invitedEmail,
  });

  return NextResponse.json(result.data, {
    headers: withProjectActivityVersionHeader(undefined, version),
  });
}
