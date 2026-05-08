import { NextRequest, NextResponse } from "next/server";

import { requireAuthenticatedApiUser } from "@/lib/auth/api-guard";
import { resolveRequestOriginFromHeaders } from "@/lib/http/request-origin";
import { sendProjectInvitationEmailForOwner } from "@/lib/services/project-collaboration-service";

export async function POST(
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

  const result = await sendProjectInvitationEmailForOwner({
    actorUserId: authenticatedUser.userId,
    projectId: params.projectId,
    invitationId: params.invitationId,
    appOrigin: resolveRequestOriginFromHeaders(request.headers),
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json(result.data);
}
